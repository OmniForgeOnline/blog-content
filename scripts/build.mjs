// Build script: reads posts/*.md, emits dist/index.json + dist/posts/<slug>.json
// + copies images/. Designed to run in GitHub Actions on push to main.

import { readFile, readdir, writeFile, mkdir, cp, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const POSTS_DIR = join(ROOT, 'posts');
const IMAGES_DIR = join(ROOT, 'images');
const DIST_DIR = join(ROOT, 'dist');
const PUBLIC_BASE_URL = 'https://blog-api.omniforge.online';

const PUBLICATION = {
  title: 'OmniForge Blog',
  description: 'Field notes from the OmniForge team on building local AI for Mac.',
};

/** Rewrite relative image and link URLs to absolute against PUBLIC_BASE_URL. */
function remarkAbsoluteUrls() {
  return (tree) => {
    visit(tree, ['image', 'link'], (node) => {
      if (typeof node.url === 'string' && node.url.startsWith('/')) {
        node.url = `${PUBLIC_BASE_URL}${node.url}`;
      }
    });
  };
}

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkAbsoluteUrls)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeStringify, { allowDangerousHtml: true });

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function calculateReadTime(markdown) {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function absolutize(maybePath) {
  if (!maybePath) return null;
  if (/^https?:\/\//.test(maybePath)) return maybePath;
  if (maybePath.startsWith('/')) return `${PUBLIC_BASE_URL}${maybePath}`;
  return `${PUBLIC_BASE_URL}/${maybePath}`;
}

function requireField(meta, field, file) {
  if (meta[field] === undefined || meta[field] === null || meta[field] === '') {
    throw new Error(`[${file}] missing required frontmatter field: ${field}`);
  }
}

async function buildPost(file) {
  const raw = await readFile(join(POSTS_DIR, file), 'utf8');
  const { data, content } = matter(raw);

  requireField(data, 'title', file);
  requireField(data, 'publishedAt', file);
  requireField(data, 'brief', file);

  const fallbackSlug = slugify(basename(file, extname(file)).replace(/^\d{4}-\d{2}-\d{2}-/, ''));
  const slug = data.slug ? slugify(data.slug) : fallbackSlug;

  const html = String(await processor.process(content));

  const publishedAt = new Date(data.publishedAt).toISOString();
  const updatedAt = data.updatedAt ? new Date(data.updatedAt).toISOString() : null;

  const tags = Array.isArray(data.tags)
    ? data.tags.map((name) => ({ name: String(name), slug: slugify(name) }))
    : [];

  const author = data.author
    ? {
        name: String(data.author.name ?? 'OmniForge'),
        profilePicture: data.author.profilePicture
          ? absolutize(data.author.profilePicture)
          : null,
        tagline: data.author.tagline ? String(data.author.tagline) : null,
      }
    : { name: 'OmniForge', profilePicture: null, tagline: null };

  const coverImage = data.coverImage
    ? { url: absolutize(data.coverImage) }
    : null;

  const seo = data.seo
    ? {
        title: data.seo.title ? String(data.seo.title) : null,
        description: data.seo.description ? String(data.seo.description) : null,
      }
    : null;

  const offering = data.offering ?? null;

  const post = {
    id: slug,
    title: String(data.title),
    slug,
    brief: String(data.brief),
    publishedAt,
    updatedAt,
    readTimeInMinutes: calculateReadTime(content),
    coverImage,
    seo,
    tags,
    author,
    offering,
  };

  const fullPost = { ...post, content: { html } };
  return { meta: post, full: fullPost };
}

async function copyImagesIfPresent() {
  if (!existsSync(IMAGES_DIR)) return;
  const target = join(DIST_DIR, 'images');
  await cp(IMAGES_DIR, target, { recursive: true });
}

async function main() {
  if (!existsSync(POSTS_DIR)) {
    throw new Error(`posts/ directory not found at ${POSTS_DIR}`);
  }

  // Clean dist so removed posts don't linger from a previous build.
  if (existsSync(DIST_DIR)) {
    const { rm } = await import('node:fs/promises');
    await rm(DIST_DIR, { recursive: true, force: true });
  }

  const entries = await readdir(POSTS_DIR);
  const markdownFiles = entries.filter((f) => f.endsWith('.md'));

  if (markdownFiles.length === 0) {
    console.warn('No markdown posts found in posts/. Building empty index.');
  }

  const results = [];
  for (const file of markdownFiles) {
    try {
      results.push(await buildPost(file));
    } catch (err) {
      console.error(`Failed to build ${file}:`, err.message);
      throw err;
    }
  }

  results.sort(
    (a, b) =>
      new Date(b.meta.publishedAt).getTime() -
      new Date(a.meta.publishedAt).getTime(),
  );

  const seen = new Set();
  for (const r of results) {
    if (seen.has(r.meta.slug)) {
      throw new Error(`Duplicate slug: ${r.meta.slug}`);
    }
    seen.add(r.meta.slug);
  }

  await mkdir(join(DIST_DIR, 'posts'), { recursive: true });

  await writeFile(
    join(DIST_DIR, 'index.json'),
    JSON.stringify(
      {
        publication: PUBLICATION,
        posts: results.map((r) => r.meta),
      },
      null,
      2,
    ),
  );

  for (const r of results) {
    await writeFile(
      join(DIST_DIR, 'posts', `${r.meta.slug}.json`),
      JSON.stringify(r.full, null, 2),
    );
  }

  // Copy CNAME so GitHub Pages serves the custom domain
  const cnamePath = join(ROOT, 'CNAME');
  if (existsSync(cnamePath)) {
    await cp(cnamePath, join(DIST_DIR, 'CNAME'));
  }

  await copyImagesIfPresent();

  // No-jekyll: prevent GitHub Pages from running its Jekyll processor
  await writeFile(join(DIST_DIR, '.nojekyll'), '');

  console.log(`Built ${results.length} post(s) into ${DIST_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

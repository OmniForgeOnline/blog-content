// Validates posts/*.md frontmatter and content. Run in CI on every PR that
// touches posts/ or images/, and as the first step of `npm run build`.
//
// Exits 0 on success, 1 on the first validation failure. Prints all issues
// before failing so contributors can fix them in one pass.

import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname, basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const POSTS_DIR = join(ROOT, 'posts');
const IMAGES_DIR = join(ROOT, 'images');

const errors = [];

function err(file, msg) {
  errors.push(`${file}: ${msg}`);
}

function isString(v) {
  return typeof v === 'string' && v.length > 0;
}

function isIsoDate(v) {
  if (!isString(v)) return false;
  // Accept YYYY-MM-DD or full ISO 8601
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(v)) {
    return !Number.isNaN(new Date(v).getTime());
  }
  return false;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

async function pathExists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function validatePost(file) {
  const fullPath = join(POSTS_DIR, file);
  const raw = await readFile(fullPath, 'utf8');
  const { data, content } = matter(raw);
  const expectedSlug = slugify(basename(file, extname(file)).replace(/^\d{4}-\d{2}-\d{2}-/, ''));

  // Required string fields
  for (const field of ['title', 'brief']) {
    if (!isString(data[field])) err(file, `frontmatter.${field} is required and must be a non-empty string`);
  }

  // publishedAt
  if (!isIsoDate(data.publishedAt)) {
    err(file, 'frontmatter.publishedAt must be an ISO date (YYYY-MM-DD or full ISO 8601)');
  }

  // updatedAt is optional but must be valid if present
  if (data.updatedAt !== undefined && data.updatedAt !== null && !isIsoDate(data.updatedAt)) {
    err(file, 'frontmatter.updatedAt, if set, must be an ISO date');
  }

  // slug
  const slug = data.slug ? slugify(data.slug) : expectedSlug;
  if (!/^[a-z0-9-]+$/.test(slug)) {
    err(file, `frontmatter.slug "${slug}" must be lowercase alphanumeric with hyphens only`);
  }
  if (data.slug && data.slug !== slug) {
    err(file, `frontmatter.slug "${data.slug}" must already be slugified (got: "${slug}")`);
  }

  // tags
  if (data.tags !== undefined) {
    if (!Array.isArray(data.tags)) {
      err(file, 'frontmatter.tags must be a list');
    } else {
      for (const t of data.tags) {
        if (!isString(t)) err(file, `tag "${t}" must be a non-empty string`);
        else if (!/^[a-z0-9-]+$/.test(t)) {
          err(file, `tag "${t}" must be lowercase alphanumeric with hyphens only`);
        }
      }
    }
  }

  // author
  if (data.author !== undefined) {
    if (typeof data.author !== 'object' || Array.isArray(data.author)) {
      err(file, 'frontmatter.author must be an object');
    } else {
      if (!isString(data.author.name)) err(file, 'frontmatter.author.name is required');
      if (data.author.tagline !== undefined && data.author.tagline !== null && !isString(data.author.tagline)) {
        err(file, 'frontmatter.author.tagline must be a string');
      }
      if (data.author.profilePicture !== undefined && data.author.profilePicture !== null && !isString(data.author.profilePicture)) {
        err(file, 'frontmatter.author.profilePicture must be a string path or URL');
      }
    }
  }

  // seo (optional)
  if (data.seo !== undefined) {
    if (typeof data.seo !== 'object' || Array.isArray(data.seo)) {
      err(file, 'frontmatter.seo must be an object');
    } else {
      if (data.seo.title !== undefined && data.seo.title !== null && !isString(data.seo.title)) {
        err(file, 'frontmatter.seo.title must be a string');
      }
      if (data.seo.description !== undefined && data.seo.description !== null && !isString(data.seo.description)) {
        err(file, 'frontmatter.seo.description must be a string');
      }
      if (isString(data.seo.title) && data.seo.title.length > 70) {
        err(file, `frontmatter.seo.title is ${data.seo.title.length} chars; keep it under 70`);
      }
      if (isString(data.seo.description) && data.seo.description.length > 200) {
        err(file, `frontmatter.seo.description is ${data.seo.description.length} chars; keep it under 200`);
      }
    }
  }

  // coverImage referenced file must exist if path is repo-relative
  if (data.coverImage !== undefined && data.coverImage !== null) {
    if (!isString(data.coverImage)) {
      err(file, 'frontmatter.coverImage must be a string path or URL');
    } else if (data.coverImage.startsWith('/')) {
      // Repo-relative absolute path, e.g. /images/<slug>/cover.png
      const localPath = join(ROOT, data.coverImage.replace(/^\//, ''));
      if (!existsSync(localPath)) {
        err(file, `coverImage "${data.coverImage}" does not exist on disk (looked for ${localPath})`);
      }
    } else if (!/^https?:\/\//.test(data.coverImage)) {
      err(file, `coverImage "${data.coverImage}" must be either an absolute repo path starting with "/" or an https URL`);
    }
  }

  // Body content must exist
  if (!content.trim()) {
    err(file, 'post body is empty');
  }

  return slug;
}

async function main() {
  if (!existsSync(POSTS_DIR)) {
    console.error(`posts/ directory not found at ${POSTS_DIR}`);
    process.exit(1);
  }

  const entries = await readdir(POSTS_DIR);
  const markdownFiles = entries.filter((f) => f.endsWith('.md'));

  // Filename convention: optional YYYY-MM-DD- prefix, otherwise must be a plain slug
  for (const f of markdownFiles) {
    if (!/^([0-9]{4}-[0-9]{2}-[0-9]{2}-)?[a-z0-9][a-z0-9-]*\.md$/.test(f)) {
      err(f, 'filename must be lowercase, hyphenated, optionally prefixed with YYYY-MM-DD-');
    }
  }

  const slugs = [];
  for (const f of markdownFiles) {
    try {
      const slug = await validatePost(f);
      slugs.push({ file: f, slug });
    } catch (e) {
      err(f, `failed to parse: ${e.message}`);
    }
  }

  // Duplicate slugs
  const seen = new Map();
  for (const { file, slug } of slugs) {
    if (seen.has(slug)) {
      err(file, `duplicate slug "${slug}" (also used by ${seen.get(slug)})`);
    } else {
      seen.set(slug, file);
    }
  }

  if (errors.length > 0) {
    console.error(`\n${errors.length} validation issue(s):\n`);
    for (const e of errors) console.error(`  - ${e}`);
    console.error('');
    process.exit(1);
  }

  console.log(`Validated ${markdownFiles.length} post(s). All checks passed.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

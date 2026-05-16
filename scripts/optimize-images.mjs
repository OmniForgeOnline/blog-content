#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const IMAGES_DIR = join(ROOT, 'images');
const POSTS_DIR = join(ROOT, 'posts');

const SOURCE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const OUTPUT_FORMATS = ['webp', 'avif'];
const RESPONSIVE_WIDTHS = [640, 960, 1280, 1600];
const MAX_CANONICAL_WIDTH = 1600;

export function isOptimizableImagePath(path) {
  const ext = extname(path).toLowerCase();
  if (!SOURCE_EXTENSIONS.has(ext)) return false;
  return !/-\d+\.(avif|webp)$/i.test(path);
}

export function getSourceImagePaths(relativePaths) {
  const pathSet = new Set(relativePaths);

  return relativePaths.filter((path) => {
    if (!isOptimizableImagePath(path)) return false;

    const ext = extname(path).toLowerCase();
    if (ext !== '.webp') return true;

    const stem = path.slice(0, -ext.length);
    return !['.png', '.jpg', '.jpeg'].some((sourceExt) =>
      pathSet.has(`${stem}${sourceExt}`),
    );
  });
}

export function getTargetWidths(originalWidth) {
  const widths = RESPONSIVE_WIDTHS.filter((width) => width < originalWidth);
  widths.push(Math.min(originalWidth, MAX_CANONICAL_WIDTH));
  return [...new Set(widths)].sort((a, b) => a - b);
}

export function getOptimizedRelativePath(relativePath, width, format) {
  const ext = extname(relativePath);
  return `${relativePath.slice(0, -ext.length)}-${width}.${format}`;
}

function getCanonicalRelativePath(relativePath) {
  const ext = extname(relativePath);
  return `${relativePath.slice(0, -ext.length)}.webp`;
}

function toPublicImagePath(relativePath) {
  return `/images/${relativePath.split('/').join('/')}`;
}

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(path));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

async function writeImageVariant(sourcePath, outputPath, width, format) {
  await mkdir(dirname(outputPath), { recursive: true });

  let pipeline = sharp(sourcePath)
    .rotate()
    .resize({ width, withoutEnlargement: true });

  if (format === 'avif') {
    pipeline = pipeline.avif({ quality: 50, effort: 6 });
  } else {
    pipeline = pipeline.webp({ quality: 78, effort: 6 });
  }

  await pipeline.toFile(outputPath);
}

async function optimizeImage(sourcePath) {
  const relativePath = relative(IMAGES_DIR, sourcePath);
  const metadata = await sharp(sourcePath).metadata();

  if (!metadata.width) {
    throw new Error(`Could not read image width for ${relativePath}`);
  }

  const widths = getTargetWidths(metadata.width);
  const canonicalWidth = Math.min(metadata.width, MAX_CANONICAL_WIDTH);
  const canonicalRelativePath = getCanonicalRelativePath(relativePath);

  await writeImageVariant(
    sourcePath,
    join(IMAGES_DIR, canonicalRelativePath),
    canonicalWidth,
    'webp',
  );

  for (const width of widths) {
    for (const format of OUTPUT_FORMATS) {
      await writeImageVariant(
        sourcePath,
        join(IMAGES_DIR, getOptimizedRelativePath(relativePath, width, format)),
        width,
        format,
      );
    }
  }

  return {
    source: toPublicImagePath(relativePath),
    canonical: toPublicImagePath(canonicalRelativePath),
    width: metadata.width,
    height: metadata.height ?? null,
    widths,
  };
}

async function updatePostCoverReferences(replacements) {
  if (!existsSync(POSTS_DIR) || replacements.size === 0) return 0;

  let changed = 0;
  const files = (await readdir(POSTS_DIR)).filter((file) => file.endsWith('.md'));

  for (const file of files) {
    const path = join(POSTS_DIR, file);
    const original = await readFile(path, 'utf8');
    let next = original;

    for (const [source, canonical] of replacements) {
      next = next.replace(
        new RegExp(`^(coverImage:\\s*['"]?)${escapeRegExp(source)}(['"]?\\s*)$`, 'm'),
        `$1${canonical}$2`,
      );
    }

    if (next !== original) {
      await writeFile(path, next);
      changed += 1;
    }
  }

  return changed;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function optimizeImages() {
  if (!existsSync(IMAGES_DIR)) return { images: [], updatedPosts: 0 };

  const files = await listFiles(IMAGES_DIR);
  const relativePaths = files.map((file) => relative(IMAGES_DIR, file));
  const sourcePaths = new Set(getSourceImagePaths(relativePaths));
  const sources = files.filter((file) => sourcePaths.has(relative(IMAGES_DIR, file)));
  const images = [];
  const replacements = new Map();

  for (const source of sources) {
    const result = await optimizeImage(source);
    images.push(result);
    replacements.set(result.source, result.canonical);
  }

  const updatedPosts = await updatePostCoverReferences(replacements);
  return { images, updatedPosts };
}

async function main() {
  const { images, updatedPosts } = await optimizeImages();

  for (const image of images) {
    console.log(
      `${image.source} -> ${image.canonical} (${image.widths.join(', ')}px variants)`,
    );
  }

  console.log(`Optimized ${images.length} image(s); updated ${updatedPosts} post(s).`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getOptimizedRelativePath,
  getSourceImagePaths,
  getTargetWidths,
  isOptimizableImagePath,
} from './optimize-images.mjs';

test('detects raster images that should be optimized', () => {
  assert.equal(isOptimizableImagePath('images/post/cover.png'), true);
  assert.equal(isOptimizableImagePath('images/post/photo.JPG'), true);
  assert.equal(isOptimizableImagePath('images/post/diagram.webp'), true);
  assert.equal(isOptimizableImagePath('images/post/vector.svg'), false);
  assert.equal(isOptimizableImagePath('images/.DS_Store'), false);
});

test('chooses responsive widths without upscaling', () => {
  assert.deepEqual(getTargetWidths(1376), [640, 960, 1280, 1376]);
  assert.deepEqual(getTargetWidths(640), [640]);
  assert.deepEqual(getTargetWidths(500), [500]);
  assert.deepEqual(getTargetWidths(1916), [640, 960, 1280, 1600]);
});

test('builds optimized paths beside the source image', () => {
  assert.equal(
    getOptimizedRelativePath('green-ai-at-the-edge/cover.png', 1280, 'webp'),
    'green-ai-at-the-edge/cover-1280.webp',
  );
  assert.equal(
    getOptimizedRelativePath('post/photo.jpeg', 960, 'avif'),
    'post/photo-960.avif',
  );
});

test('excludes generated canonical webp files when original sources exist', () => {
  assert.deepEqual(
    getSourceImagePaths([
      'post/cover.png',
      'post/cover.webp',
      'post/cover-640.webp',
      'post/cover-640.avif',
      'post/photo.webp',
    ]),
    ['post/cover.png', 'post/photo.webp'],
  );
});

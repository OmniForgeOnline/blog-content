import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const retiredSlug = 'we-automated-the-parts-of-development-nobody-wants-to-do';

test('keeps archived posts out of clean builds and clears stale article output', async () => {
  const fixture = await mkdtemp(join(tmpdir(), 'omniforge-feed-test-'));
  try {
    await mkdir(join(fixture, 'scripts'));
    await Promise.all([
      cp(join(root, 'scripts/build.mjs'), join(fixture, 'scripts/build.mjs')),
      cp(join(root, 'posts'), join(fixture, 'posts'), { recursive: true }),
      cp(join(root, 'archive'), join(fixture, 'archive'), { recursive: true }),
      symlink(join(root, 'node_modules'), join(fixture, 'node_modules'), 'dir'),
    ]);
    const build = () => execFileSync(process.execPath, [join(fixture, 'scripts/build.mjs')], { stdio: 'pipe' });
    const assertRetired = async () => {
      const index = JSON.parse(await readFile(join(fixture, 'dist/index.json'), 'utf8'));
      assert.ok(index.posts.length > 0, 'a healthy feed must still contain current posts');
      assert.equal(index.posts.some(post => post.slug === retiredSlug), false);
      assert.equal(existsSync(join(fixture, 'dist/posts', `${retiredSlug}.json`)), false);
      assert.equal(existsSync(join(fixture, 'archive', `${retiredSlug}.md`)), true);
    };
    build();
    await assertRetired();
    await writeFile(join(fixture, 'dist/posts', `${retiredSlug}.json`), '{"stale":true}');
    build();
    await assertRetired();
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

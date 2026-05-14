# OmniForge Blog Content

Source of truth for blog posts published at https://omniforge.online/blog.

## How it works

1. Posts live as Markdown files under `posts/`, images under `images/`.
2. On every push to `main`, GitHub Actions runs `scripts/build.mjs` which:
   - Parses YAML frontmatter
   - Converts Markdown to HTML (GFM, raw HTML allowed)
   - Rewrites relative image URLs to absolute URLs against the public domain
   - Emits `dist/index.json` (listing) and `dist/posts/<slug>.json` (full posts)
   - Copies `images/` into `dist/images/`
3. The output is published to GitHub Pages at https://blog-api.omniforge.online.
4. The marketing site fetches from that domain server-side via Next.js ISR.

## Adding a post

1. Create `posts/<yyyy-mm-dd>-<slug>.md` (the date prefix keeps the directory ordered; the runtime `slug` comes from frontmatter).
2. Drop cover and inline images in `images/<slug>/`.
3. Open a PR. Once merged, the post appears on the marketing blog within 5 minutes (ISR revalidate window).

## Frontmatter schema

```yaml
---
title: "How we built X"
slug: "how-we-built-x"
brief: "Short summary used in the listing and SEO description."
publishedAt: "2026-05-12"
updatedAt: "2026-05-14"          # optional
coverImage: "/images/how-we-built-x/cover.jpg"
coverImageAlt: "Diagram of the system"
tags: ["engineering", "performance"]
author:
  name: "Vlad Butacu"
  profilePicture: "/images/authors/vlad.jpg"
  tagline: "Founder"
seo:
  title: "How we built X | OmniForge"           # optional
  description: "Custom SEO description."        # optional, falls back to brief
---

Body in **Markdown** with GFM. Inline images use repo-relative paths:

![Diagram](/images/how-we-built-x/diagram.png)
```

Required fields: `title`, `publishedAt`, `brief`. Everything else has a sensible default.

## Local preview

```bash
npm install
npm run build
# inspect dist/index.json and dist/posts/<slug>.json
```

## Authoring conventions

- One folder per post under `images/<slug>/`.
- Cover image at `images/<slug>/cover.<ext>`. Any format Next/Image accepts.
- Inline images in the same folder.
- Compress images before committing. The repo is git, not a CDN.

## Callouts

Blockquotes that start with these emoji render as styled callouts on the live site:

- `> ℹ️ ...` info
- `> ⚠️ ...` warning
- `> 💡 ...` tip
- `> ✅ ...` success
- `> 🚨 ...` danger

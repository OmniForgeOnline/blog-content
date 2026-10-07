# Blog publishing

- The website builder publishes every Markdown file directly under `posts/`. Retain unpublished source outside that directory, such as `archive/`.
- Build the feed after moving or removing a post. The builder clears `dist/` before generating output, so stale article JSON should not remain.
- After deploying a feed change, allow the website's feed cache to refresh and verify the post is absent from the blog index and sitemap before requesting search recrawls.

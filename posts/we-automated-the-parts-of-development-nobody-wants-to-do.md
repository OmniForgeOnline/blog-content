---
title: "We Automated the Parts of Development Nobody Wants to Do"
slug: "we-automated-the-parts-of-development-nobody-wants-to-do"
brief: "Automated code review, merge request creation, and standup summaries for GitLab, GitHub, and Slack."
publishedAt: "2026-04-07T11:52:00Z"
coverImage: "/images/we-automated-the-parts-of-development-nobody-wants-to-do/cover.png"
coverImageAlt: "We Automated the Parts of Development Nobody Wants to Do"
tags: ["automation", "developer-tools", "ai", "code-review", "github", "gitlab", "slack"]
author:
  name: "Vlad Butacu"
  tagline: "Founder, OmniForge"
seo:
  title: "OmniForge Automates Code Review, MRs, and Standups"
  description: "OmniForge handles the repetitive parts of your dev workflow — code review, MR creation, and standup summaries — across GitLab, GitHub, and Slack."
---
If you've worked on a team with more than a couple of developers, you know the drill. Someone opens a merge request. It sits there. Eventually someone reviews it, but by then the author has moved on to something else and the context switch costs everyone time. Meanwhile, standup rolls around and you're trying to reconstruct what you did yesterday from a mix of memory and git log.

None of this is hard work. That's what makes it so annoying — it's easy, repetitive, and it eats hours you'd rather spend building things.

We started OmniForge because we were tired of doing the same predictable tasks over and over. Not because they were difficult, but because they were boring and they added up.

## What we actually built

OmniForge connects to the tools you already use — GitLab, GitHub, Slack — and handles the repetitive parts of your development workflow automatically. Right now, that means three things:

**Automated code review.** When a merge request is opened, OmniForge reads the diff, pulls in relevant file context from the repository, and runs a multi-pass analysis. It posts specific, line-level comments directly on the MR — not vague "looks good" feedback, but concrete observations about potential issues, style inconsistencies, or logic that might break. It also sends a summary to Slack so the team knows a review is ready without anyone having to ping a channel.

The review is thorough. It runs multiple passes over the code, fetches additional files from the repo when it needs more context, and validates its own findings before posting. If it's not confident about something, it says so. Comments are deduplicated so you don't get the same observation repeated across different lines.

**Merge request creation.** When you push to a branch, OmniForge compares it against the target branch, analyzes what changed, and drafts a merge request with a meaningful description. Not a list of commit messages — an actual summary of what the changes do and why they matter. If you've configured it to require approval, it pauses and waits for a human to confirm before creating the MR. If an MR already exists for that branch, it skips the whole thing.

**Standup summaries.** OmniForge pulls your recent activity from GitLab or GitHub — commits, merge requests, reviews — and generates a written summary grouped by project. You can run it on a schedule (every morning before standup) or trigger it on demand. The output goes to Slack, formatted and ready to paste into whatever async standup format your team uses.

All three of these work for both GitLab and GitHub.

## How it works, without the buzzwords

The architecture is straightforward. Your tools send webhooks when things happen — a push, a new MR, a comment. OmniForge's webhook listener picks those up, validates them (checking signatures, tokens, whatever the provider uses), and publishes a standardized event onto a message bus.

From there, the right agent picks up the event and runs its workflow. Each agent is a series of steps: parse the event, gather context, run the analysis, take action. The steps checkpoint to a database, so if something fails halfway through, it picks up where it left off instead of starting over.

The agents use MCP (Model Context Protocol) to interact with your tools. That means they can read diffs, fetch file contents, post comments, create merge requests, and send Slack messages — all through the same APIs you'd use yourself.

For the AI layer, we use a mix of models depending on the task. Different steps in a workflow can use different models — a stronger one for analysis, a lighter one for formatting or validation. You can configure this per agent if you have preferences.

## What we learned running this on our own team

We've been using OmniForge internally for months before opening it up. A few things stood out:

**Speed matters less than quality.** Our first code review agent was fast but shallow. People ignored it. When we invested in making the analysis genuinely useful — multi-pass, context-aware, honest about uncertainty — adoption went up immediately. A review that takes 90 seconds but catches real issues is worth more than one that takes 10 seconds and says nothing.

**Filtering is half the work.** Not every webhook deserves a response. Draft MRs, bot-generated commits, metadata-only changes, MRs that were just closed — the agent needs to know when to do nothing. We spent a surprising amount of time on the rules that decide whether to even start a review.

**Human-in-the-loop is underrated.** For merge request creation, we added an optional approval step. The agent prepares everything, then pauses and asks a human to confirm before actually creating the MR. It sounds like it defeats the purpose, but in practice it gives people confidence that automation isn't going to do something unexpected. Most teams turn it off after a week once they trust the output.

## What's next

We're working on connecting workflows across tools — so when a feature branch merges, the associated ticket updates automatically and the right people get notified. The plumbing is there (webhooks, message bus, tool integrations), it's a matter of building the coordination logic.

We're also building OmniForge Desktop — a local app for on-machine AI workflows. Not everything needs to go through the cloud, and some teams want to keep their code context local. Desktop is designed to work standalone now and connect to cloud automations later if that makes sense.

If you want to try OmniForge, we're in free beta. Connect your GitLab or GitHub, set up Slack, and you'll have automated code reviews running in a few minutes. No infrastructure to manage, no models to host.

We'll keep writing here about what we're building and what we're learning. If you want updates, the [newsletter](/newsletter) is the easiest way to follow along.

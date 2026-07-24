---
title: "When Your AI Agent's Memory Outgrew Your Ability to Trust It"
slug: "agent-memory-from-automatic-recall-to-human-curated-knowledge"
brief: "We built an AI assistant with automatic memory, then hit the wall every agent system reaches: who decides what's worth remembering. Here's the two-layer architecture we settled on."
publishedAt: "2026-07-24T16:00:00Z"
coverImage: "/images/agent-memory-from-automatic-recall-to-human-curated-knowledge/cover.webp"
coverImageAlt: "Two-layer memory architecture: an automatic recall layer feeding through an approval gate into a human-curated knowledge vault"
tags: ["ai-agents", "memory-systems", "architecture", "knowledge-management"]
author:
  name: "Vlad Butacu"
  tagline: "Founder, OmniForge"
seo:
  title: "Agent Memory: Automatic Recall to Human-Curated Knowledge"
  description: "An AI assistant had automatic memory but no way to inspect or correct what it knew. The answer was building a second layer with a human approval gate."
---

For about three weeks, the memory layer on our AI assistant just worked. You'd correct it on something Tuesday, and by Friday it was applying the correction without being reminded. A preference you dropped in passing during one conversation would shape how it handled a different task a week later. It tracked shifting opinions. It reconciled contradictions between sessions on its own. We stopped noticing it, which is the highest praise you can give infrastructure: it became invisible.

Then someone asked a reasonable question: what does it know about us?

The query came back as embeddings. Semantic similarity scores, cosine distances, a JSON blob of weighted vectors. I'm sure the math was correct. I have no way of verifying that, because you can't proofread a vector. You can't open a file and check whether the assistant correctly understands that we prefer rolling deployments over blue-green, or that our alert pipeline routes through a Discord channel. You can't fix a wrong conclusion by editing a line.

The memory works. You can't see inside it. Those two facts coexist fine, right up until they don't.

## What the automatic layer does

Our assistant runs an always-on memory layer called Honcho, built by Plastic Labs. It sits between the agent and the conversation and does four things in the background: stores conversations and events as they happen, models each user and agent as a persistent "peer" with its own representation, extracts conclusions from what was said, and runs semantic search across the entire history when the agent needs to recall something.

During a live conversation, this gives the agent fast, fuzzy recall. It can answer "what did we decide about the deployment strategy" with ranked excerpts from conversations going back weeks. It tracks how preferences shift over time. When two statements conflict, it reconciles them. This is associative, continuous work, the kind you want running without supervision. You don't manage it, you don't curate it, and in our experience the recall quality is good.

The structural problem is that everything it learns lives in a backend that a human cannot open. You can query it through API tools, but you cannot browse to a file and read what the assistant "knows." There is no audit trail showing what was explicitly stated versus what the system inferred. There is no way to correct a single wrong conclusion without working through the API layer. You trust the system because it performs well, not because you can verify what's inside. That trust works until the assistant confidently does something based on a conclusion you didn't realize it had drawn.

## What a transparent layer gives you

We already had Obsidian running as a personal knowledge vault: a folder of Markdown files, human-readable, version-controlled with Git, portable to any text editor. If the tooling disappeared tomorrow, the knowledge would survive as plain files on disk. Every note is correctable. Every change is auditable. There is no API between you and the data.

We set this up alongside Honcho and gave the agent write access to it. The goal was to get an inspectable record of what the assistant "knew," something we could open, read, and correct. The agent dutifully wrote notes after conversations, updated files when things changed, and proposed new entries when it noticed patterns.

The plumbing worked. The content was garbage.

## Why the agent can't self-curate

When we say the agent "learned" something, what actually happened is that it ran a language model over the conversation and produced a plausible-sounding summary. The model is good at summarizing. It is not good at judging durability. It cannot reliably distinguish between "the user stated a standing preference" and "the user mentioned something once in a specific context that will never recur."

In practice, the agent filled the vault with entries like:

- A preference for a specific deployment strategy, inferred from a conversation where we were troubleshooting a one-off configuration issue and mentioned blue-green deployments as context, not as a preference.
- A system architecture decision that was never made, pieced together from fragments where we were thinking out loud about trade-offs between options we hadn't chosen yet.
- A standing constraint about secrets handling that was already documented in three other notes, each with slightly different wording, creating a set of contradictory entries the agent had reconciled by... writing a fourth one.
- A correction to a fact that was already correct, because the agent noticed a wording difference between two notes and treated it as a conflict.

Automatic writing into a human knowledge base is how you acquire a beautifully organised collection of confidently wrong rubbish. The agent is enthusiastic, it is fast, and it has no judgment about what is durable.

The comparison made the trade-off concrete:

| Requirement | Honcho (automatic) | Obsidian (agent-written) |
|---|:---:|:---:|
| Captures facts without human effort | **Yes** | **Yes** |
| Cross-session semantic recall | **Yes** | Needs indexing |
| Tracks changing preferences | **Yes** | **Yes** |
| Human-readable and editable | Limited | **Yes** |
| Auditable history | Backend-dependent | **Git** |
| Correctable without API calls | No | **Yes** |
| Trustworthy without human review | Medium | **Low** |

Both systems capture facts. Neither system guarantees that the facts are correct. Honcho is opaque, so you can't check. Obsidian is transparent, but the agent fills it with plausible noise. The approval gate exists to solve that last row.

## The propose-inbox-approve pattern

The design we settled on keeps both systems but puts a human approval gate between them. Honcho stays for runtime recall: during a live conversation, the agent needs fuzzy, fast memory that tracks shifting preferences and surfaces context from past sessions. Obsidian stays as the durable knowledge store, but the agent no longer writes to it directly.

Instead, the agent proposes. Each proposal lands as a Markdown file in an Obsidian inbox folder, with structured frontmatter that carries provenance:

```yaml
---
type: memory-proposal
status: pending-review
confidence: medium
source: conversation
created: 2026-07-24
---

# Title of the proposed fact

The actual durable fact goes here, stated plainly.

## Review

- [ ] Verify against the original source
- [ ] Check that this is durable and useful
- [ ] Confirm no secrets or credentials are included
- [ ] Promote to a canonical folder
```

The agent creates proposals through a CLI tool:

```bash
python3 ~/.hermes/scripts/obsidian-memory.py propose \
  "Deployment strategy preference" \
  "User prefers blue-green over rolling updates for production." \
  --source="conversation" \
  --confidence=high
```

![Two-layer memory architecture: automatic recall for runtime, human-curated knowledge for durable facts](/images/agent-memory-from-automatic-recall-to-human-curated-knowledge/architecture.webp)

It lands in `Inbox/`. The agent cannot move it further. A human opens Obsidian, reads the note, and either promotes it or deletes it:

```bash
python3 ~/.hermes/scripts/obsidian-memory.py approve \
  Inbox/deployment-strategy-preference.md \
  Decisions
```

Approved notes move to one of four canonical folders, structured around the types of durable knowledge we actually accumulate:

```
Memory/
├── Memory/        # user profile, preferences, environment facts
├── Projects/      # project-specific context and conventions
├── Systems/       # architecture decisions, system configurations
└── Decisions/     # explicit choices with reasoning, including rejected alternatives
```

The frontmatter status flips from `pending-review` to `approved`, and the vault index reloads. The agent never promotes its own proposals. Every fact in the curated store was read by a person who decided it was worth keeping.

The friction is the point. The automatic layer can be fast because the curated layer is slow. Speed belongs in the system that forgets gracefully. Precision belongs in the system that does not forget at all.

## The full three-system picture

The assistant now runs three memory systems, each serving a distinct purpose. Conflating them is how memory architectures become unmaintainable.

**Honcho** handles conversational recall: behavioral patterns, shifting preferences, cross-session semantic search, contradiction handling, user modelling. It is fast, fuzzy, and opaque. It runs in the background and you never touch it directly.

**The Obsidian vault** handles durable knowledge: stable environment facts, architecture decisions, project conventions, operating procedures, approved preferences, explicit always/never rules. It is slow, precise, and fully inspectable. Every entry was reviewed by a human.

**The native key-value store** handles structured context injection: compact facts injected at the start of every turn so the agent has baseline context without needing to search for it. This is the built-in Hermes memory system that holds things like "user prefers terminal commands" or "project uses pytest with xdist." It is small, explicit, and serves a purpose the other two cannot: deterministic injection into the model's context window at a predictable token cost.

Replacing any one of these with another would solve nothing and break the pipeline that depends on its specific properties. Honcho is a memory service, not a file format. Obsidian is a file format, not a memory service. The key-value store is an injection mechanism, not a knowledge base.

## What we tried and rejected

We tried automatic mirroring between Honcho and the Obsidian vault. Every memory write would trigger a proposal in the inbox. Within a day there were 40 pending proposals, and the pattern was consistent: the agent recorded what it was doing during a conversation as if those actions were standing preferences. It captured debugging context as architecture decisions. It proposed corrections to facts that were already correct.

This is not a filtering problem you solve with better prompting. The agent genuinely cannot distinguish between "the user said this once" and "this is a durable fact worth remembering." That distinction requires understanding intent and context over time, which is a harder problem than generating plausible summaries. We considered adding a confidence threshold, but the agent's confidence scores correlated with how well-formed the sentence was, not with whether the fact was actually durable. A confidently stated wrong fact scores higher than a hesitantly stated correct one.

The approval gate is the pragmatic answer. The agent lacks the judgment to self-curate, so human review is the filter. The cost is a few minutes of review per day. The benefit is a curated store where every entry is trustworthy.

## Who decides what's worth remembering

Most agent memory discussions are about capacity: how much can the agent recall, how far back, how accurately. The question that shaped this architecture was jurisdictional: who decides what enters the durable record.

The agent captures everything, which means it captures noise alongside signal. A human-curated store requires manual review, which costs time. We needed both, connected by a gate where the agent proposes and a person decides what survives.

Six months from now, if we swap the model or step away for a while, the curated vault will still be a folder of Markdown files on disk. Each one carries provenance metadata showing where it came from and when it was approved. The automatic layer will have rebuilt its representations from whatever conversations happen next. Some things persist because someone chose to write them down. Others flow and adjust because the context around them is changing. The architecture keeps those two things from getting tangled, and that separation is what makes the whole system trustworthy.

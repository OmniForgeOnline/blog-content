---
title: "Your Local LLM Is Slow Because of Five Config Flags"
slug: "your-local-llm-is-slow-because-of-five-config-flags"
brief: "KV cache, context size, and batch size control more of the performance budget than most people realize"
publishedAt: "2026-04-15T21:37:00Z"
coverImage: "/images/your-local-llm-is-slow-because-of-five-config-flags/cover.png"
coverImageAlt: "Your Local LLM Is Slow Because of Five Config Flags"
tags: ["llm", "llamacpp", "llama-cpp", "ollama", "local-ai", "local-llm", "local-inference", "apple-silicon", "llm-performance-optimization", "kv-cache", "flash-attention", "batch-size-optimization"]
author:
  name: "Vlad Butacu"
  tagline: "Founder, OmniForge"
seo:
  title: "Why Your Local LLM Is Slow — llama.cpp Config Guide"
  description: "KV cache, context size, and batch size often matter more than your GPU. A practical guide to llama.cpp parameters on consumer hardware."
---
Your model fits in memory. You load it up, send a prompt, and watch it choke halfway through a conversation. Or it runs, but at 3 tokens per second on hardware that should do better. You picked the right quantization. You offloaded all the layers. So what's wrong?

Probably your runtime configuration. The parameters you set (or don't set) when launching llama.cpp or Ollama often matter more for real-world performance than the model or quantization format you chose.

Here's the short version:

| Parameter | What it controls | Why it matters |
| --- | --- | --- |
| `--ctx-size` | KV cache memory budget | Pre-allocated at startup. Too high and you swap. Too low and the model forgets. |
| `--cache-type-k/v` | KV cache precision | Q8\_0 halves cache memory with near-zero quality loss. Not all architectures benefit equally. |
| `--flash-attn` | Attention memory layout | Drops attention memory from O(n²) to O(n). No downside. |
| `-b` (batch size) | Prompt processing speed | Larger batches = 2-3x faster prompt eval. |
| `--parallel` | Concurrent request slots | Slots share the context budget. More slots = less context each. |

The rest of this post explains why each one matters and how they interact.

## Where the memory actually goes

When llama.cpp loads a model, two things consume memory: the **model weights** and the **KV cache**.

The weights are the static part. A Llama 3.1 8B model quantized to Q4\_K\_M takes roughly 4.9GB. That number is fixed. It doesn't change during inference.

The KV cache is different. Every transformer layer stores key and value vectors for each token it has processed, so the model can attend to previous context without recomputing everything from scratch. The memory follows a straightforward formula:

```plaintext
KV cache = 2 × layers × kv_heads × head_dim × seq_len × bytes_per_element
```

For a typical 8B model (32 layers, 8 KV heads via GQA, head dimension 128) at 32K context in FP16, that works out to roughly **4.3GB**. Nearly as much as the model itself.

The scaling is linear and unforgiving:

| Context Length | FP16 KV Cache | Total with 4.9GB model |
| --- | --- | --- |
| 8K | ~1.1GB | ~6.0GB |
| 16K | ~2.1GB | ~7.0GB |
| 32K | ~4.3GB | ~9.2GB |
| 64K | ~8.6GB | ~13.5GB |
| 128K | ~17.2GB | ~22.1GB |

This is the wall most people hit without realizing it. Weight quantization gets all the attention, but the KV cache is what actually limits your context length on consumer hardware.

## Context size is a memory reservation

The `--ctx-size` flag in llama.cpp (or `num_ctx` in Ollama) controls how many tokens the model can consider in a single session. What's easy to miss: the KV cache for that entire window is pre-allocated at startup, even if your actual prompt is only 200 tokens.

Set `--ctx-size 65536` and you're reserving KV cache memory for 65,536 tokens immediately. On a MacBook with 16GB of unified memory running an 8B model, that reservation alone can push you into swap.

The flip side is also a problem. Ollama defaults `num_ctx` to 2,048 tokens. That's low enough that the model silently discards earlier context in longer conversations. You get answers that ignore what you said five messages ago, and the only symptom is that the model seems forgetful.

Set context size deliberately. A rough formula:

```plaintext
Available for KV cache = Total RAM − model size − OS overhead (~3-4GB)
```

On a 16GB MacBook running a 4.9GB model with Q8\_0 KV cache quantization, you have roughly 8-9GB for the KV cache. That comfortably supports 32K context. Without KV cache quantization, the same memory only supports about 16K.

## KV cache quantization: the biggest lever most people ignore

By default, llama.cpp stores the KV cache in FP16 — 2 bytes per element. You can quantize it to Q8\_0 (1 byte) or Q4\_0 (0.5 bytes) with minimal impact on output quality.

The savings are hard to overstate:

| KV Cache Type | Memory at 32K ctx | Savings | Quality impact |
| --- | --- | --- | --- |
| FP16 | ~4.3GB | — | Baseline |
| Q8\_0 | ~2.1GB | ~50% | +0.004 perplexity (measured on Qwen 2.5 Coder 7B) |
| Q4\_0 | ~1.1GB | ~75% | +0.2 perplexity, noticeable on precision tasks |

That 2GB you save with Q8\_0 can mean the difference between running a 7B model and fitting a 14B model, or between a 16K and 32K context window on the same hardware.

In llama.cpp:

```bash
llama-server --cache-type-k q8_0 --cache-type-v q8_0 --flash-attn
```

In Ollama:

```bash
OLLAMA_KV_CACHE_TYPE=q8_0 OLLAMA_FLASH_ATTENTION=1 ollama serve
```

One requirement: KV cache quantization needs flash attention enabled. There's no reason not to enable both.

### When KV cache quantization backfires

Q8\_0 is a safe default for most models. Q4\_0 is not.

At longer context lengths, Q4\_0 KV cache quantization can be dramatically slower than FP16 — up to 92% slower at 64K context — because the dequantization overhead during attention computation outweighs the memory savings. Research on INT4 quantization confirms the mechanism: dequantizing weights or partial sums on GPUs introduces 20-90% runtime overhead depending on the workload.

And some model architectures are more sensitive than others. Gemma 3 models, for example, have a known issue where even Q8\_0 KV cache quantization causes severe performance regression — GPU utilization drops to 20-30% while the CPU spikes to 100%. The same Q8\_0 setting works fine on Qwen models of comparable size.

## Flash attention removes the quadratic memory penalty

Standard attention computes a score matrix of shape `(seq_len × seq_len)` for each attention head. At 32K context in FP16, that's 2GB per head per layer. The numbers get absurd fast.

Flash attention avoids materializing that full matrix by processing attention in tiles that fit in fast on-chip memory. Memory drops from O(n²) to O(n). It's also faster, because it reduces data movement between slow main memory and fast SRAM.

On Apple Silicon, flash attention is implemented via Metal compute shaders and works particularly well with the unified memory architecture. No PCIe transfer overhead between CPU and GPU.

Enable it with `--flash-attn` in llama.cpp or `OLLAMA_FLASH_ATTENTION=1` in Ollama. There are no quality downsides. It should arguably be the default everywhere, and in recent Ollama builds it's moving in that direction.

## Batch size controls how fast your prompt gets processed

LLM inference has two phases:

- **Prefill** processes all your input tokens in parallel. Bottleneck: compute.
- **Decode** generates output tokens one at a time. Bottleneck: memory bandwidth.

Batch size (`-b` in llama.cpp, `OLLAMA_NUM_BATCH` in Ollama) controls how many tokens are processed per forward pass during prefill. The default is typically 512. If your prompt is 16,000 tokens, that's 32 forward passes. Bump the batch to 2048 and you're down to 8.

GPU matrix multiplications are most efficient when the matrices are large enough to saturate the compute units. A 2-3x speedup in prompt evaluation from increasing batch size to 2048 is typical. The memory cost is modest — usually a few hundred MB for intermediate activations.

This matters most in agentic workflows. If your coding assistant sends dozens of API calls with a growing context, prefill speed dominates total wall time. Faster prefill means less waiting between tool calls.

## Parallel slots share your context budget

If you're running `llama-server`, the `--parallel` flag controls how many concurrent requests the server can handle. The part that surprises people: `--ctx-size` is the total KV cache budget across all slots, not a per-request allocation.

| Config | Per-slot context |
| --- | --- |
| `--ctx-size 65536 --parallel 1` | 65,536 tokens |
| `--ctx-size 65536 --parallel 2` | ~32,768 tokens each |
| `--ctx-size 65536 --parallel 4` | ~16,384 tokens each |

Want two slots with 64K each? You need `--ctx-size 131072` and the memory to back it.

On consumer hardware, `--parallel 1` is usually the right call for interactive use. In benchmarks on a laptop GPU, two parallel slots turned a 2-minute request into 3.5 minutes each, because both slots compete for the same memory bandwidth and compute. It's a throughput knob, not a "make everything faster" knob.

## Putting it together

A reasonable starting point for a MacBook or single consumer GPU, assuming you've verified Q8\_0 KV cache works with your model:

```bash
llama-server \
  -m model-Q4_K_M.gguf \
  -ngl 99 \
  -c 16384 \
  --flash-attn \
  -b 2048 \
  --cache-type-k q8_0 \
  --cache-type-v q8_0 \
  --parallel 1
```

For Ollama:

```bash
OLLAMA_FLASH_ATTENTION=1
OLLAMA_KV_CACHE_TYPE=q8_0
OLLAMA_NUM_BATCH=2048
```

If you're running Gemma models or notice unexpected slowdowns, drop the KV cache type back to FP16 and see if speed improves. The memory cost is higher, but the dequantization overhead on some architectures makes FP16 the faster option in practice.

Then adjust `num_ctx` per model based on your available memory. Start conservative, check the startup logs for KV buffer allocation sizes, and increase from there.

The model you chose matters. The quantization format matters. But the runtime parameters are where most of the wasted memory and unnecessary slowness actually lives. A few flags, set deliberately, can turn a frustrating local LLM setup into one that feels like it was always supposed to work this way.

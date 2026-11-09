# 00 · Core Mechanisms

> These six pieces are the genuinely hard part of the whole architecture, and the part that decides whether it is a mess three months from now.
> Every other section is an expansion of them.

| Piece | One line | What you get |
|---|---|---|
| [1 · Accumulation](1-accumulation.md) ★ | **Capability is not in the model, it is in the accumulation** | The three symptoms of mainstream frameworks, what accumulation needs as a carrier, the accumulation loop |
| [2 · Scene](2-scene.md) | One scene ＝ the carrier of the accumulation | The six-part set, `.git` draws the boundary, the directory is the router, how to split scenes |
| [3 · Scene Memory](3-scene-memory.md) | Accumulation needs somewhere to land | The three-layer memory structure, the five subsections of the §0 handover, the hard limits, the session switch protocol |
| [4 · Dispatch and Receipt](4-dispatch-and-receipt.md) | How work goes out and how the accumulation comes back | The dispatch four-part set, **the receipt three-part set**, the two channels, the orchestrator's boundary |
| [5 · Workflow](5-workflow.md) ★ | How scenes are strung into one line | The workflow definition, **gates**, the execution lifecycle, where the execution state lives |
| [6 · The Division of Labour of Two Memory Systems](6-two-memory-systems.md) | The difference between a ledger and a wiki | Scene memory vs semantic memory, how to combine them, how to cure contamination |

---

## How the six pieces fit together

```
1-Accumulation ──────▶ 2-Scene ──────▶ 3-Scene Memory
 (why we accumulate)   (what the carrier   (how the memory
                        looks like)         is stored)
                          │                 │
                          └───────┬─────────┘
                                  ▼
                        4-Dispatch and Receipt
                     (how to dispatch, how to collect,
                      ★how to bring the accumulation back)
                                  │
                                  ▼
                        5-Workflow
                    (how scenes are strung into one line)
                                  │
                                  ▼
                        6-Two Memory Systems
                     (which layer all of this is about)
```

**One sentence that covers the whole section:**

> **Accumulation needs a carrier, and the carrier has to be rewritable; a dispatch has to bring back the accumulable artifact, and a receipt has to be verifiable; and when you chain it together, somebody has to be able to see it.**

---

## The three hard limits (the strictest rules in the whole architecture)

| Hard limit | What disease it blocks |
|---|---|
| **One dispatch ＝ one receipt** | Work finished but the other side does not know |
| **A receipt without an accumulable artifact ＝ this round of work was wasted** | Work finished but the understanding did not accumulate |
| **⛔ Requests only, never edit the other side's memory** | Boundaries blur, audit fails |

The first two are the same family: **done, but not left behind.**
The third is the precondition of all accumulation —— **accumulation must happen where there is sovereignty, otherwise nobody is responsible for maintaining it.**

---

## If you only read one piece

Read [1 · Accumulation](1-accumulation.md). It is the main line of the whole architecture:
**why capability should not rely on a smarter model, but on a carrier that can be rewritten.**

The other five are its expansions —— the scene is that carrier, scene memory is its shape,
dispatch and receipt are the loop of accumulation, the workflow is the choreography of the scene.

---

> ⬅️ **Back**: [Master Outline](../overview.md) ｜ **Document map**: [README](../README.md)

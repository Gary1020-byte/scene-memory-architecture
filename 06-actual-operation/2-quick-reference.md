# 6 · As Actually Run — Quick Reference

> For people who have already read the spec. The spec says "what should be"; this says "what is", and "where they differ".
>
> Full discussion: [1-as-actually-run.md](1-as-actually-run.md).

---

## Three sentences

1. **The spec says 3 scenes; there are 24.**
2. **The shared layer is not "shared memory" — it is "the routing table + the dispatch channel". The other three boards are empty.**
3. **The entry point is not in the spec: the entry point is Hermes; DSH is the side that gets dispatched to.**

---

## Numbers

| | spec (written 2026-11-01) | measured (2026-11-11) |
|---|---|---|
| scenes | 3 | **24** |
| scene names | Command / Self-Review / Local-Machine | **Master** / Self-Review / Local-Machine / … (24 total) |
| shared layer size | not stated | 138 KB (of which 93 KB is read by nobody) |
| routing | "mentions a routing table" | 1298 attempts / **94.1% hit rate** |
| dispatch | four-part contract | **53**, across 13 receiving scenes |
| workflows | none | 3 YAML files / 2 real runs |
| memory systems | 2 | **4** |
| scene-specific skills | not stated | 148 |
| Hindsight banks | implies per-scene | **one bank** (not isolated) |

---

## Gap table (14)

| # | the spec says | reality | impact |
|---|---|---|---|
| 1 | 3 scenes | 24 | scale numbers expired |
| 2 | the scene is called "Command" | it is called "Master" | names do not match |
| 3 | shared layer has a todo board | `_待辦.md` 24 B, unreferenced | never grew |
| 4 | shared layer has a conflict log | `衝突.md` 47 B, unreferenced | never grew |
| 5 | shared layer has an index ledger | `索引.md` 568 B, humans only | never grew |
| 6 | shared layer ＝ shared memory | routing table + dispatch channel | **role misread** |
| 7 | two memory systems | four | the Hermes-wide ones are missing |
| 8 | semantic layer is wired up | it says "not yet connected" | it really is not |
| 9 | Hindsight isolates scenes | one bank, no `bank_ids` | **scene-level semantic memory is shared** |
| 10 | the human talks to the scene | Hermes is the entry point | the wire is undocumented |
| 11 | no workflows | 3 YAML files, 2 runs | a missing layer |
| 12 | global constitution says "four scenes" | 24 | **wrong words, injected every turn** |
| 13 | shared-layer files are read by agents | `_跨場景通知.md` 93 KB, unread | notices arrive via dual write instead |
| 14 | hardcoded "3 scenes" | the overview itself says "scale is free" | self-contradictory |

---

## The shared layer's three fates

```
ALIVE (tools read and write)
  routing-table.json 11 KB     ← 1298 attempts, 94.1% hit
  routing-feedback.jsonl 202 KB ← append-only audit trail
  dispatch/<13 scenes>/        ← 53 dispatches (plus 40 receipts)
  skill-mapping.json 6.7 KB    ← single source of truth
  index.json / memory-map.json ← owner registration
  areas/*.md 22 files

HALF-ALIVE (tools write, no agent reads)
  _跨場景通知.md 93 KB   ← notices only land via the dual write into the receiver's memory
  _場景活動.md 44 KB     ← the event layer; says the semantic layer is "not yet connected"

DEAD (no program references)
  _待辦.md 24 B
  衝突.md 47 B
  索引.md 568 B (humans only)
  项目.json 20 B (looks up one long-gone project)
```

---

## Three memory layers

```
scene memory   scenes/<x>/scene-private-memory.md   per scene  ledger   "where are we now"
Hindsight      bank: hermes                          global    wiki     "what did we learn before"
Hermes global  MEMORY.md + kanban.db                 global    registry "who are you, what are the rules"
```

**The sharpest cut is "facts" versus "progress"**: Hindsight stores facts, §0 stores progress.
"The next step" is an **intention that cannot be derived from existing actions alone** — it must have an explicit landing place.

---

## Scene / workflow / dispatch

| | scene | workflow | dispatch |
|---|---|---|---|
| decides | **who** does it | **how** it is done | **what this one** is |
| shape | a directory | a YAML file | a markdown file |
| steps | free-form | fixed steps with gates | unconstrained |
| judgement | the scene decides | AI judgement kept inside nodes | the receiving scene decides |
| crosses scenes | no | **yes, in fixed order** | one receiver at a time |

**The core definition: the output is a function of the input.** A scene lets the AI work freely in context; a workflow pins it into a repeatable sequence.

---

## To-do (two batches)

### Batch 1 — retire the stale claims

1. `overview.md`: the "3 scenes" paragraph, and the section-navigation table
2. `~/.dsh/AGENTS.md`: the scene list and the paths — **it injects every turn**
3. The L1 shared-layer description
4. `00-core-mechanisms/6-two-memory-systems.md` → four systems, and the Hindsight side is not isolated

### Batch 2 — decide whether to grow what never grew

| option | my view |
|---|---|
| A make `_待辦.md` / `衝突.md` used | the spec asks for them; first decide whether they are for humans or tools |
| B split Hindsight into one bank per scene | expensive, and scenes arguably *should* share part of it |
| C connect the semantic layer | already on the todo list, in the tool's own words |
| **D write the Hermes side into the spec** | **the most important one** — it is the entry point; without it the whole system stays invisible |

---

⬅️ **Back**: [1-as-actually-run.md](1-as-actually-run.md) · [overview](../overview.md)

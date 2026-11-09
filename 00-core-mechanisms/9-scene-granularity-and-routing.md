# 9 · Scene Granularity and Routing Hierarchy

> This chapter answers one question: **when the number of scenes grows, what breaks first?**
>
> The original motivation was "more scenes → bigger routing table → more injection → wasted tokens".
> Measured on a real machine: **the token claim does not hold; the routing claim does.**
> This chapter separates three things: what is a real bottleneck, what is a real misconception,
> and how to design so you do not end up half-way.

---

## 1. First, drop a misconception: the injection layer does not grow linearly with scene count

### The common assumption

> Every scene needs its own `AGENTS.md`, and every one of them gets injected
> → 24 scenes means 24 injections.

### What actually happens

The engine's injection path (`dsh-agent-instructions/lib/index.js`):

```js
// :674
for (const dir of ancestorChain(projectRoot, cwd))
  for (const candidates of [config.instructionFileCandidates, config.localInstructionFileCandidates])
    for (const file of await allExistingInstructionFiles(dir, projectRoot, candidates, ...))
      addFile(file)
```

`ancestorChain(projectRoot, cwd)` = **the path from the project root down to cwd** — not "all projects".

And `projectRoot` is defined as: **walk up from cwd until you find a directory containing `.git`**
(`findProjectRoot`, :574).

⇒ **A session injects only the `AGENTS.md` files in its own tree, plus the global one.**

### Numbers (measured on this machine, 2026-11-09)

| Item | Characters |
|---|---|
| Global `~/.dsh/AGENTS.md` | 921 |
| All 24 scenes' `AGENTS.md` combined | 33,451 |
| Average per scene | 1,394 |
| **What a single session actually injects** | **≈ 2,315** (global + its own scene) |
| (Hypothetical) all 24 scenes injected | 34,372 ← **this never happens** |

**So splitting scenes does not increase per-session tokens.** It actually *reduces* them —
because each smaller scene has a smaller `AGENTS.md`.

| | Injected |
|---|---|
| One big scene (`AGENTS.md` 2,000 chars) | 921 + 2,000 = 2,921 |
| Split into three small scenes (600 chars each) | 921 + 600 = **1,521** |

> **Conclusion 1: injection cost is neither a reason to split nor a reason not to.**
> It is a question **inside** a scene (how short should `AGENTS.md` be),
> not a question **between** scenes.

---

## 2. The real bottlenecks: three, not one

| # | Bottleneck | How it scales with scene count | Measured status |
|---|---|---|---|
| 1 | **Routing table growth** | Linear | 24 scenes / 348 keywords / 14.5 avg per scene, max 30 ("dev tools") |
| 2 | **Per-scene registration cost** | Linear × 4 places | Each new scene touches 4 places (scene dir, scene json, identity index, shared layer) plus a resident session |
| 3 | **Per-scene `check` cost** | Linear | One `check --all` runs 24 scenes × 11 assertions |

> **Note that #2 is the real burden.** Splitting "video editing" into three means
> two more scene directories, two more resident sessions, eight more registrations,
> and two more keyword groups in the routing table.
>
> **The per-scene boundary cost is fixed, and a scene's boundary cost ≠ its token cost.**

---

## 3. So should you build smaller scenes? Answer with the accumulation criterion

### The criterion (from [1 · Accumulation](1-accumulation.md) — the only one in the whole book)

> **Is the value of this thing greater than "how it was done last time"?**

### Applying it to a case like "separate the voice track"

| | Does it come back? | Same files/rules/knowledge each time? | What accumulates | Verdict |
|---|---|---|---|---|
| "Mute the music in this video" | Yes | Yes | **Nothing** (one-off instruction) | **Not a scene** → ephemeral executor / skill |
| "The video editing pipeline" | Yes | Yes | Storyboard spec, asset library location, subtitle axis, publish checklist | **Is a scene** |
| "Separating the voice track" | Yes | Yes | Which model, how to tune it, which signals it misreads, where the output goes | **Maybe a scene** — but ask: is this the same accumulation as video editing's? |

### The key follow-up question

> **Is the thing the smaller scene accumulates the same batch as what the parent scene accumulates?**
>
> - **Same batch** → do not split (splitting just cuts memory in half; at the seam both scenes
>   have to restate the same thing)
> - **Different batch** → do split (it has its own rules, its own files, its own set of traps)

"Separating the voice track" accumulates (model choice, parameters, misread patterns);
"video editing" accumulates (storyboards, subtitle axis, publish checks). **These are different
batches** → by the accumulation criterion, **it should be split**.

### But check these three failure modes before splitting ([2 · Scene](2-scene.md) §4)

| Symptom | What went wrong | Fix |
|---|---|---|
| More and more scenes, none of them alive | Cut too fine | Merge: same files and same domain knowledge means they belong together |
| The scene keeps talking about other people's business | Cut too coarse | Split it |
| The scene has to read two directories at once | Boundary is wrong | One git root per scene; whatever crosses the boundary goes to the shared layer |

---

## 4. The gap in the type system: there is no "memoryless scene" today

### The three existing types

| Type | Has memory? | Has a scene directory? | Has a resident session? | Notes |
|---|---|---|---|---|
| **Scene** | ✅ | ✅ | ✅ | The only type today |
| **View** (`"view": true`) | ❌ | ❌ | ❌ | Read-only presentation, see [new-scene spec](../02-implementation/5-new-scene-spec.md) §B.3 |
| **Ephemeral executor** (sub-agent) | ❌ | ❌ | ❌ | Throwaway after use, see [scene vs ephemeral executor](../05-comparisons-and-selection/1-scene-vs-ephemeral-executor.md) |

### The missing cell

What is actually being asked for:

> **Has its own dedicated skill, its own routing entry, its own constitution — but does
> "not need to remember how far it got last time".**

This differs from a view (a view has no scene body at all and cannot do work),
and from an ephemeral executor (an ephemeral executor has no dedicated skill and is
reassembled every time).

**It is called a "capability scene" or "memoryless scene" — a type this architecture does not
have yet.**

### Its minimal type definition

| | Has | Doesn't have |
|---|---|---|
| `.git/` | ✅ **required** (otherwise skills don't load, and the symptom is subtle) | |
| `AGENTS.md` | ✅ but extremely short (only "what I do, what I don't") | |
| `.dsh/skills/<id>/SKILL.md` | ✅ **this is its body** | |
| `定位卡.md` / `身份卡.md` / `場景畫像.md` | ✅ | |
| `場景私有記憶.md` | | ❌ **absent** — there is no "how far did I get last time" to record |
| `專案記憶/` | | ❌ |
| `歸檔/` | | ❌ |
| Resident session | ✅ (it must be interruptible, must accept work) | |
| Registration in four places | ✅ (it is still a scene that can take work) | |

**Where does memory go?** Two options, pick one:

| | Location | Fits when | Cost |
|---|---|---|---|
| **A. Parent scene holds it** | The child's `AGENTS.md` says "my memory is in `影片剪輯/場景私有記憶.md`" | This work is one step of the parent's workflow | Reading memory across scenes breaks sovereignty |
| **B. Shared layer holds it** | `_共享記憶/能力/<id>.md` | This work belongs to no single scene | The shared layer is supposed to hold only things that affect others — the criterion needs restating |

> **Recommendation: A, with an explicit "read-only borrow".** The child scene may read the
> parent's §〇, but the **receipt is written back to the parent** — the child does not open
> its own memory file. Memory still has exactly one source of truth (the parent),
> and the sovereignty rule is intact.

---

## 5. The key mechanism: nested vs sibling — the difference is whether `.git` exists

This is the most useful section, because it decides whether a child scene can inherit
from its parent.

### Engine behavior (measured on `dsh-agent-instructions` + `dsh-skill-filesystem`)

```
project root = walk up from cwd until a directory containing .git
injection    = AGENTS.md on ancestorChain(project root, cwd), layer by layer from the root down
skills       = scans only <project root>/.dsh/skills   ← one level, not the whole tree
```

### Three placements, three behaviors

| Placement | Project root | Injected `AGENTS.md` | Visible skills |
|---|---|---|---|
| **Sibling**: `<scene root>/audio-separation/` (has `.git`) | audio-separation | **only** audio-separation's | only `audio-separation/.dsh/skills` |
| **Nested, no `.git`**: `<scene root>/audio-separation/` (**no** `.git`) | **the parent scene** | **both** parent and audio-separation (chained) | only the parent's `.dsh/skills` (**the child's skills are invisible**) |
| **Nested, with `.git`** | audio-separation | only audio-separation's | only `audio-separation/.dsh/skills` |

### ★ Nested without `.git` is a natural "borrow from parent" mechanism

This is where the intuition of a "memory neuron" lands at the engine level:

- **The child's `AGENTS.md` is injected after the parent's** ⇒ the parent's rules are inherited
  automatically, without restating them
- **But the child's dedicated skills are not visible** ⇒ the child's skills must live inside
  **the parent's** `.dsh/skills/`

**So "small enough that you don't repeat the rules" is natively supported by the engine already**,
at the cost of hanging skills under the parent.

**What this saves: the tokens of restating the parent's rules plus one of the four registrations.**
**What it costs: `check` will block it (missing `.git`).** ⇒ This needs a spec decision:
**nested child scenes are a legal type, and `check` must recognize and allow them.**

---

## 6. The routing table: three options

### Current state

```json
{ "版本": 3, "路由": [ { "項目": ["簡報","簡報設計",...12 more], "owner": "簡報設計" }, ... ] }
```

**Flat structure, no groups, no hierarchy.** 24 scenes / 348 keywords.

Routing scoring (`派單.mjs:1940-1990`):

```
score = (action verb ? 1000 : 0) + keyword length × 10 + occurrence position / 1e6
then: compound-term priority suppression (a long keyword containing a short one suppresses the short one)
```

**Key limitation: each owner can win only once, and the routing table has no second level.**

### Option A: hierarchical routing (one more level in the table)

```json
{ "路由": [
  { "項目": ["影片"], "owner": "影片剪輯" },
  { "項目": ["分離配音","去人聲"], "owner": "音訊分離" }
] }
```

plus:

```json
{ "群組": [
  { "id": "media", "項目": ["影片","音訊","配音","字幕"], "成員": ["影片剪輯","音訊分離"] }
] }
```

Routing in two stages: **hit a group first, then compare members within the group.**

**Good:** a group's generic term ("video") doesn't compete for score with a member's specific
term ("separate the voice track").
**Bad:** the routing table goes from 24 entries to two layers (groups + members) — maintenance
goes up, not down.

### Option B: stay flat, solve it with the compound-term mechanism (★ do this one first)

**The existing compound-term suppression already handles most of it**:

> "separate the voice track" contains "voice track" ⇒ if "voice track" belongs to another owner,
> "separate the voice track" wins.

**That means: a new small scene only needs specific enough compound keywords to automatically
outrank the parent's generic terms.**

Measured examples with the existing logic: "daily digest" beats "digest"; "scheduled publish"
beats "publish".

**So option B is nearly zero-change**:
1. Add one entry for the new scene, with **specific enough** compound keywords
2. Confirm it doesn't steal words from an existing owner (use `派單.mjs`'s ambiguity check)
3. Run the regression with `路由測試語句.json`

**This is the lowest-cost, fastest-to-payoff path.**

### Option C: auto-derive hierarchy from the routing table (tool-generated)

Derive hierarchy from keyword **containment**: if A's keyword set ⊇ B's, then A is above B.

**Good:** no manual layering.
**Bad:** the derived hierarchy may not be the functional one you wanted — it's just literal
containment.

---

## 7. Implementation order (smallest to largest, each step independently verifiable)

| Step | What | Acceptance |
|---|---|---|
| **1** | **Define the "capability scene" type** — add it to the spec: what it has/doesn't have, memory ownership, how §〇 is handled | Spec document |
| **2** | **Teach the routing table about "capability scene" entries** (with a `型別` field) | `派單.mjs 路由` behaves consistently for new entries |
| **3** | **Let `check` allow nested child scenes** (no `.git` but with a `.git-marker`) | `check --all` is green |
| **4** | **Regression-test compound terms** (a new scene doesn't steal existing owners' words) | `路由測試語句.json` hit rate does not drop |
| **5** | **Build one real example**: audio separation (or something smaller) | End-to-end dispatch → receipt → on-disk |

---

## 8. Three-sentence summary

1. **The injection layer is not the bottleneck** — a session injects only its own tree
   (≈ 2,315 chars); splitting scenes actually saves tokens.
2. **The real bottlenecks are the routing table and registration cost** — 24 scenes /
   348 keywords / four registrations per scene.
3. **The "memory neuron" already exists at the engine level** — a nested subdirectory without
   `.git` chains the parent's `AGENTS.md`; the cost is that skills must hang under the parent
   and `check` currently blocks it.

> **If you split scenes, the reason is "the accumulation is a different batch" — not "saves
> tokens" and not "the routing table is big".**

---

> ➡️ **Next**: [6 · Two Memory Systems](6-two-memory-systems.md)
> ⬅️ **Back**: [Core Mechanisms README](README.md) ｜ **Related**: [1 · Accumulation](1-accumulation.md) · [2 · Scene](2-scene.md) · [5 · Workflow](5-workflow.md)

# 3 · Scene Memory —— accumulation needs somewhere to land

> Memory lives in files, not in sessions —— this is the precondition for accumulation to happen.
>
> This piece describes what that "somewhere to land" looks like: three layers, how the handover section is written, how the hard limits are set.

---

## 1. The core premise: memory in files, not in sessions

| Approach | Result |
|---|---|
| Relying on conversation history to remember "where I got to" | ❌ Breaks the moment the session changes; after compression the details are gone too |
| Relying on the AI itself to "remember" | ❌ It cannot; whatever it sees in the context, it takes as truth |
| **Relying on the handover in files** | ✅ Change the session a hundred times, the memory is still there |

**Corollary**: the value of a session = the **files it produces**, not how much it talked.
So "switching sessions" is not a disaster, **switching without writing the handover** is.

> Where does this premise sit in the framework of [1 · Accumulation](1-accumulation.md)?
> **It is the minimum requirement of the carrier.** Accumulation needs somewhere to store; a session is not a place —— it is a container that gets thrown away.

---

## 2. Three layers: why layering is mandatory

```
┌─ ① Injection layer (global hard rules)──────────────────────────┐
│  Auto-injected every turn. Everyone pays this cost ⇒ must be tiny │
│  Only the rules that mean "without reading them you work for nothing"; ⛔ no tutorials, no detail │
└───────────────────────────────────────────────────────────────┘
┌─ ② Private layer (one folder per scene)────────────────────────┐
│  scene-private-memory.md (§0 handover ≤ 4 KB, written by humans)           │
│  identity-card.md / scene-portrait.md (tool-generated, hand-editing breaks validation) │
│  + project-memory/<project-id>.md (one per project, ≤ 8 KB)      │
│  Read only when this scene opens ⇒ the only entry point on a session switch │
└───────────────────────────────────────────────────────────────┘
┌─ ③ Shared layer (boards / ledgers / indexes)───────────────────┐
│  What happened · what to do · where things are · who is who · which way to go │
│  Belongs to no single scene; whoever needs it reads it           │
└───────────────────────────────────────────────────────────────┘
```

**How the three layers flow**:

```
One turn ──auto-injected every turn──▶ ① Injection layer (global hard rules, must be tiny)
    │
    └──read when a new scene opens──▶ ② Private layer (§0 handover ≤ 4 KB)
                              │
              conclusions land long-term────┴──▶ ③ Shared layer (boards·to-do·indexes·workflows)
                              │
              history too thick──────────┴──▶ Archive layer (pointers only)
```

**Why they cannot be merged into one**:

| Consequence of merging | Concrete numbers |
|---|---|
| The injection layer grows ⇒ **every turn costs more** | Injecting 60 KB ≈ 20k extra tokens per turn; a few dozen turns a day is a disaster |
| The private layer grows ⇒ **the opening never finishes reading** | A scene memory once grew to 40 KB, so nobody read it and the handover was a formality |
| Private content leaks into the shared layer ⇒ **mutual interference** | Other people's progress crowds into your opening; you read a pile of things unrelated to you |

> **The criterion: "who reads this, and how often?"**
> Read every turn ⇒ injection layer (must be tiny) · read at every scene opening ⇒ private layer (≤ 4 KB) · looked up on demand ⇒ shared layer or on-demand docs.

> The private layer is **the landing point of accumulation**, so it must be short——
> accumulation should not be stuffed into the opening entry; it should sink into project memory and the archive.

---

## 3. Private layer: what `§0 Handover` actually contains

Each scene's private memory lives at `<workbench-root>/scenes/<scene-name>/scene-private-memory.md`
(written by humans; `identity-card.md` and `scene-portrait.md` in the same directory are tool-generated, ⛔ hand-editing breaks validation).

`§0` is **overwritten in place**, keeps only the latest copy, and has five fixed subsections:

```markdown
## §0 Current Handover (≤ 4 KB, a new session reads this section first)

### 1) Last Handover
- <what was done / result / evidence>

### 2) Current Projects
| Project | Memory File | Status | Next Step |
|---|---|---|---|
| <project-name> | <project-id>.md | in progress | <action> |

### 3) Private Memory Changes
- <YYYY-MM-DD>: <what changed + why>

### 4) Next Steps / Blockers
- Next step: <who moves first, in what order>
- Blocker: <write "none" if there is none; otherwise say clearly who you are waiting on>

### 5) Full Picture

## Core Responsibilities

## §1 What I Own / What I Don't

## §2 Where to Start

## §5 Decisions and Pitfalls (append only)

## 0 - Notifications
```

The tool generates the content of subsection 5 — **do not hand-edit it**.

**§0 answers only four things**: who am I / where am I / what is next / what is blocking me.

> ⚠️ **The most common mistake: writing §0 as a weekly report** (today I did 1, 2, 3, 4, 5 things, three paragraphs each).
> The result: first it blows the limit, second a new session still does not know "what to do next".

### Four hard rules

| Rule | Why |
|---|---|
| **Keep only the latest copy** (overwrite, do not append) | Appending grows forever; "last progress" is meaningful only in one copy |
| **≤ 4 KB** | Over that, nobody reads it; 4 KB is roughly "read for 30 seconds and start working" |
| **Latest every turn, move the old one to `archive/`** | History cannot be discarded, but it must not block the entry point |
| **Write "pointers", not "full text"** | Details go into project files／skills; here you only write "where it is" |

---

## 4. Shared layer: five boards, each answering one question

| Board | Answers | Who writes | Lifecycle |
|---|---|---|---|
| **Cross-scene board** | **What happened** (announcements / dispatches / receipts) | The notify tool writes automatically | Newest on top; each scene keeps ≤5 summary lines in its own memory |
| **To-do board** | **What to do** (the single landing point on the whole machine) | Any scene adds a line; the same item may only have one line | Delete the line when done; move long-stuck items to the archive |
| **Master index / identity index** | **Where things are** (scene ↔ memory ↔ card ↔ skill) | Registered on creation/move | Tabular, single authority |
| **Conflict log** | **Two places disagree** | Whoever finds it registers it | Closed once adjudicated |
| **Workflows** ★ | **Which way to go** (order, criteria, branches) | Machine owner | Revised version by version |

**Why the boards are separate**: they **change at different rates** (the board gets dozens of entries a day, workflows one version a month),
**are read by different people** (everyone reads the board, the index is looked up occasionally), **have different responsibilities** (whoever posts writes the board, whoever creates registers in the index).
Merged together, the fastest-moving board squeezes everything else out.

> **Workflows are the fifth board, because they are "the plan".**
> The board is the current situation, the to-do list is items, workflows are **a path with order, conditions and branches**——
> stuffing them into the board or the to-do list flattens them. See [5 · Workflow](5-workflow.md).

---

## 5. Write-back criteria: what to record, what not to

**Only "real work" is written back**:

| ✅ Record | ⛔ Do not record |
|---|---|
| Built/changed an app, fixed a bug | Search results |
| Wrote a report／document | Temporary paths |
| Refactoring / architecture change | Raw tool error output (if you must record it, record "symptom → root cause") |
| Chose a technical approach | One-off constraints ("just do it this way this time") |
| Conventions shared by the machine owner | The chat itself |

**Volume also has a ceiling**: every write-back is **≤ 10 lines / ≤ 2 KB**.
Over that means you are copying the process, not recording the conclusion —— the process belongs to the current turn, only the conclusion belongs to memory.

> **The criterion: "will I still need this line three months from now?"** If not, do not write it.
> The value of memory is not in being "complete", it is in "**picking up 30 seconds later**".

### But the accumulable artifact is the exception

Ordinary write-backs have a ceiling; the **accumulable artifact** (the practice, the pitfall, the criterion you can use next time) is not bound by 10 lines——
it is not "what was done this time", it is "**how it should be done next time**"; the two are different in nature.

See [4 · Dispatch and Receipt](4-dispatch-and-receipt.md).

---

## 6. Size hard limits and what to do when you hit them (memory gets fat, it must diet)

| Target | Hard limit | When the limit is hit |
|---|---|---|
| Scene memory main file | **≤ 25 KB** | Move old turns and old decisions into `archive/`; keep only the entry point + pointers in the main file |
| `§0 Handover` | **≤ 4 KB** | Same: move the history away, keep "the latest copy + pointers" |
| Project memory | **≤ 8 KB** | Split into "main file + appendix" |
| Skill (single file) | **≤ 12 KB** | Split into "main file + reference sub-file" |
| Injection layer (global hard rules) | The shorter the better | Push all detail down to the "spec" layer (not injected, looked up on demand) |

**Hard requirement for dieting: move, never discard, and be able to prove it.**

```
① First save a "before the move" snapshot
② Move (history → archive/)
③ Run the comparison script: compare line by line "non-history lines before == non-history lines after"
      0 differences hit ⇒ nothing was lost
④ Run the index health check: dead entries / unregistered / expired / identity drift
```

> A real lesson: once we tore a file apart without saving a snapshot, and the **comparison script could not even run** —— you cannot prove you lost nothing.
> Since then the rule changed: **snapshot first, then act.**

---

## 7. Session switch protocol (the most operational rule in this mechanism)

```
① First overwrite §0 with "progress / next step / blocker"   ← this step IS the handover, do not skip it
② Then switch (create the new session + archive the old one)
③ After switching, sync three places:
     · sessionId in the scene config
     · the session id column of the identity index table
     · the handover signature in §0 ("This handover was written by session <new-id> on <date>")
④ Run the self-check: every panel must print "✓ id hit (identity validation passed)"
```

**Why step ③ cannot be skipped**: panels pin the session by `sessionId`. If it is not synced ⇒ the panel points at an **archived session**,
which shows up as "switching to this scene, the AI feels like a different person" (it literally is a different session).

**When you should switch** (this one is counter-intuitive):

| Trigger | Switch? |
|---|---|
| The machine owner says "switch session" | ✅ Switch |
| Context limit exceeded (HTTP 413) and **still** 413 after compression | ✅ Switch (a real dead end) |
| Only "the compression line is near", no error yet | ❌ **Do not switch** —— the engine compresses automatically, keep working |
| The task is done | ✅ Recommended (one topic, one session) |

> **Switching sessions is not a disaster in this architecture, it is the act of handing over the accumulation.**
> A new conversation reads `§0` when it opens, so the accumulation carries over automatically —— **as long as the handover was written.**

---

## 8. Failure modes (all of these really happened)

| Symptom | Root cause | Fix |
|---|---|---|
| **Memory gets fatter and fatter until nobody reads it** | Process, search results and raw error output all written in | Write-back criteria + size hard limits |
| **Two sets of numbers disagree** (memory says A, the ledger says B) | The same fact lives in two places | Single source of truth: one fact stored in one place, the other holds only a pointer |
| **"Amnesia" after switching scenes** | `sessionId` points at the old session | Step ③ of the session switch protocol |
| **Someone else's judgement appears in my memory** | Writing the other party's memory directly across scenes | Scene sovereignty: on someone else's ground you may only write requests |
| **"Size is fine" but the content is useless** | Watching only the size, not "can I start working after reading it" | Change the criterion: after a new session reads §0, **can it say "what to do next" within 30 seconds** |
| **The board split in two** | Two scripts resolve the memory root to different paths | Unify path resolution (see [4 · Known Gaps and TODO](../02-implementation/4-known-gaps-and-todo.md)) |
| **The work is done but the understanding did not accumulate** | The receipt carried no accumulable artifact | The receipt three-part contract (see [4 · Dispatch and Receipt](4-dispatch-and-receipt.md)) |

---

## 9. Minimum viable (do only these four things first)

1. **One memory file per scene**, whose first subsection is always `§0 Handover` (identity / progress / next step / blocker);
2. **You must write `§0` before switching sessions** (if you cannot write "next step", this turn was wasted);
3. **Keep `§0` under 4 KB**; over that, move the history into `archive/`;
4. **Record conclusions, not process** (≤ 10 lines per write-back).

Once you have more than 3 scenes and start hitting "the same fact disagrees in two places", come back and add the five boards of the shared layer.

---

> ➡️ **Next**: [4 · Dispatch and Receipt](4-dispatch-and-receipt.md) (how work goes out, how it comes back, how the accumulation travels back with it)
> ⬜ **Previous**: [2 · Scene](2-scene.md) ｜ **Back**: [Core Mechanisms README](README.md) ｜ **Related**: [1 · Accumulation](1-accumulation.md)

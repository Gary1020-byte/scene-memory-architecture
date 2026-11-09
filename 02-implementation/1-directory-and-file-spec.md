# 1 · Directory and File Spec

> This is **a spec you can copy as-is**. All file names, section headings and fields are conventions, not suggestions.
>
> ⚠️ **The `外壳/` in the example is the actual directory name on the local workbench (kept as-is, including its simplified glyphs)**.
> Directory names like this come from the underlying engine's existing conventions — **they are not typos and do not need to be rewritten uniformly** —
> rewriting them would only make the docs stop matching the real machine. If your workbench uses a different name, change it to match your actual setup;
> what really needs to be consistent is the **structure** (tools separated from data, one git repository per scene), not the glyphs.

---

## 1. Workbench directory

```
<workbench-root>/
├── scenes/                        ← ★ Scene layer (one independent git repository per scene)
│   ├── _shared-memory/                 ← Shared layer (L1): plans and current state (everyone reads the same copy)
│   │   ├── _scene-identity-index.md  ← Board 1: where things are (scene id ↔ panel ↔ session ↔ locator card ↔ skill)
│   │   ├── _跨場景通知.md          ← Board 2: what happened (announcements / dispatches / receipts)
│   │   ├── _待辦.md                ← Board 3: what to do (the machine's single landing point, one line per item)
│   │   ├── 衝突.md                ← Board 4: register conflicts before anything breaks
│   │   ├── workflows/                 ← Board 5: ★ which path to take (the plan: order, criteria, branches)
│   │   │   └── <workflow-id>.yaml
│   │   ├── 項目.json              ← Project list (routes to each project's memory file)
│   │   ├── 索引.md / 索引.json     ← Structured master index
│   │   └── areas/<scene>.md        ← Name card page per scene
│   ├── <scene A>/                   ← ★ Independent git repository
│   ├── <scene B>/
│   └── <scene C>/
├── runs/                          ← ★ Execution layer (L2′): orchestrator-private (this run's state)
│   └── <run-id>/
│       ├── execution-state.md             ← Where it got to, where it is stuck, what it is waiting for
│       └── carry.md               ← The carrier that passes each hop's accumulable artifact onward
├── 工具/                          ← Tool layer (L3): executable, upgradable, holds no data
├── 外壳/                          ← Workbench UI (panels, top bar)
└── 說明/                          ← Docs for humans
```

> **Criterion: tools and data are separated.** Upgrading or replacing the tools must not touch scene memory.
> That is also why `工具/` sits at the workbench root instead of inside some scene.

> **Criterion: plans and state are separated.** The workflow **definition** lives in the shared layer (what is shared is the definition);
> this run's **execution state** lives in `runs/` (one copy per run, private).
> Mixing them ⇒ the execution state splits into several copies and nobody can read the authoritative version.

### The shared layer's five boards: each answers one question

| Board | Answers | Who writes | Lifecycle |
|---|---|---|---|
| **Cross-scene board** | **What happened** (announcements / dispatches / receipts) | The messaging tool writes it automatically | Newest on top; each scene keeps ≤ 5 summaries in its own memory |
| **Todo board** | **What to do** (the machine's single landing point) | Any scene adds a line, one line per item | Delete the line when done; move to archive if it hangs too long |
| **Master index / identity index** | **Where things are** (scene ↔ memory ↔ card ↔ skill) | Registered on creation / move | Tabular, single source of truth |
| **Conflict book** | **Where two things collide** | Anyone who spots it registers it | Closed after adjudication |
| **Workflows** ★ | **Which path to take** (order, criteria, branches) | The owner | Revised version by version; touched once a month |

> **Why the boards are separate**: they have **different update frequencies** (the board gets dozens of entries a day, workflows get one version a month),
> **different readers** (everyone reads the board, the index is consulted occasionally), **different ownership** (whoever sends writes the board, whoever creates registers the index).
> Merge them and the result is: **the most frequently updated board squeezes everything else out**.
>
> Workflows are the fifth board because they are the **plan** — order, conditions, branches —
> and squeezing them into a board or a todo list flattens them.

### What this workbench root looks like in practice (2026-11-01)

The local machine actually runs **3 scenes**: scene A / scene D / scene C, **each an independent git repository**.

| Layer | Real-world content | Measured |
|---|---|---|
| Scene layer | 3 scene directories, each with `.git/` | scene boundary = project root |
| Shared layer | `_shared-memory/` (boards / todo / conflicts / index / project table) | Two boards once split (see gap #3) |
| Tool layer | validation, session creation, messaging, dispatch scripts | Separated from data |
| Audit layer | Each scene's own git repository | `git log` all there |

> This architecture **does not lock itself to one engine**: `.git` boundary marking, skill mounting and command injection are engine behaviours,
> so switching engines means re-testing those three things ([3 · Maintenance Manual](3-maintenance-manual.md) task E).

---

## 2. Scene directory spec

```
scenes/<scene-name>/
├── .git/                          ← ★ Scene boundary (the engine uses it to decide the project root)
├── AGENTS.md                      ← Scene constitution (injected only into this scene's sessions)
├── .dsh/skills/<scene-id>/SKILL.md  ← Scene-exclusive skill (visible only inside this scene)
├── locator-card.md                ← Scene identity spec sheet (hand-written, the anchor for validation)
├── scene-private-memory.md        ← ★ Memory source of truth (hand-written)
├── identity-card.md               ← Tool-generated, ⛔ hand-editing it fails validation
├── scene-portrait.md              ← Tool-generated, ⛔ hand-editing it fails validation
├── _file-index.md                 ← Which files this scene has (four states: active / standing / archived / to-clean)
├── project-memory/<project-id>.md ← One file per project, ≤ 8 KB
└── archive/                       ← Old snapshots, append only
```

### Who owns which file

| File | Who writes | What happens if you change it |
|---|---|---|
| `AGENTS.md` | Human | Takes effect only after a session switch (injected every turn) |
| `.dsh/skills/` | Human | Same |
| `locator-card.md` | Human | **Fingerprint goes stale** ⇒ you must re-run `stamp` |
| `scene-private-memory.md` | Human | §0 structure wrong ⇒ `check` reports an error |
| `identity-card.md` | **Tool** | ⛔ Hand-editing it fails validation |
| `scene-portrait.md` | **Tool** | ⛔ Hand-editing it fails validation |
| `_file-index.md` | Human + tool registration | —— |

### The six-piece set → file mapping

"The scene six-piece set" is a concept from the mechanism layer (see [2 · Scene](../00-core-mechanisms/2-scene.md) section 2);
here it is in its **file-layer** form — follow this table and you know what is missing and which file to add.

| # | Piece | File | Format essentials | What happens if it's missing |
|---|---|---|---|---|
| 1 | **Scene config** | `<scene-id>.json` | `id` / `name` / `description` / `layout` / `theme` / `panels[]`; each panel has `id` / `title` / `type` / `col` / `row` / `w` / `h` | The scene never shows up in the panel |
| 2 | **Locator card** | `locator-card.md` | Six fixed fields (see section 4) | Validation gets no fingerprint ⇒ `check` blocks outright |
| 3 | **Scene private memory** | `scene-private-memory.md` | §0 five subsections + core responsibilities + §1 / §2 / §5 | Session switch breaks the thread |
| 4 | **Scene-exclusive skill** | `.dsh/skills/<scene-id>/SKILL.md` | YAML frontmatter (`name` / `description`) + procedure | Professional work gets done with generic methods |
| 5 | **Optional panel** | Written in the scene config | `type` picks the renderer; **a session panel must bind `sessionId`** | Chat only, low efficiency |
| 6 | **Resident session + one identity index row** | one row in `_scene-identity-index.md` | Seven columns, see section 5 | The engine injects no identity ⇒ the agent guesses, and one guess mixes up scenes |

> ★ **②③⑥ are the three that cannot be skipped** (①④⑤ may degrade to "shared").
> To judge whether a scene "holds up", look at those three: **card (duties), memory (progress), index (identity)**.

### Size hard limits (every object has a threshold)

| Object | Hard limit | What to do when over | Block or warn |
|---|---|---|---|
| `§0` handover section | **4 096 B (4 KB)** | Move history into `archive/`, keep only the newest copy + a pointer | **Block** (exit=1) |
| `scene-private-memory.md` main file | **25 600 B (25 KB)** | Move old rounds and old decisions into `archive/` | Warn |
| `project-memory/<project-id>.md` | **8 192 B (8 KB)** | Split into "main file + appendix" | Warn |
| Single skill file | 12 KB | Split into "main file + reference sub-file" | Convention (no tool check) |
| Locator card fingerprint length | 16 hex digits | —— | —— |

> Hard limits are **byte counts**, not line counts and not character counts — the same Chinese passage yields very different
> character counts under different tools, and **only bytes are stable**. Where the limit numbers are defined is in
> [2 · Handover and Validation](2-handover-and-validation.md) section 2.

---

## 3. `scene-private-memory.md` spec

```markdown
# <scene-name> · Scene Private Memory

> Identity and shape see `identity-card.md` / `scene-portrait.md` (tool-generated, ⛔ hand-editing)
> The rule: only this scene may rewrite this memory; other scenes may only point out errors.

## §0 Current Handover

### 1) Last Handover
- <what was done / result / evidence>

### 2) Current Projects
| Project | Memory file | Status | Next step |
|---|---|---|---|
| <project-name> | <project-id>.md | in progress | <action> |

### 3) Private Memory Changes
- <YYYY-MM-DD>: <what changed + why>

### 4) Next Steps / Blockers
- Next step: <who moves first, in what order>
- Blocker: <write "none" if there is none; if there is, write clearly who you're waiting on>

### 5) Full Picture
- N project memories · M archive snapshots · index _file-index.md
- Identity card / scene portrait / shared-layer areas are in place
- Blockers / who we're waiting on: see section 4

## Core Responsibilities

- Responsible for: <one sentence saying "what comes to me">
- Not touching: <one sentence saying "what does not come to me">
- In one sentence: <can you say in one sentence why this scene exists>

## §1 What I Own / What I Don't

- Own:
- Don't own:

## §2 Where to Start

- Project memory: `project-memory/<project-name>.md` (the index table goes in §0 subsection 2 above)
- Archive: `archive/`
- Index: `_file-index.md`

## §5 Decisions and Pitfalls (append only)

## 0 - Notifications
```

### The contract of each section

| Section | Contract | Hard limit |
|---|---|---|
| `§0` | **Overwrite in place**, keep only the newest copy | **≤ 4 KB** (hard, exceeding it blocks) |
| `Core Responsibilities` | ≥ 3 items (responsible for / not touching / in one sentence) | Missing one is an error |
| `§1 §2` | Duty boundary and entry point | —— |
| `§5` | **Append only**, never rewrite history | —— |
| `0 - Notifications` | Landing spot for cross-scene messages | —— |
| The whole main file | —— | ≤ 25 KB (over ⇒ move to `archive/`) |

> ⚠️ **`§0` answers exactly four questions**: who am I / where did I get to / what's next / where am I blocked.
> Writing it as a weekly report is the most common mistake.

### Section-by-section criteria for §0's five subsections

"All five subsections present" is a **mechanical check** (missing one blocks, exit=1);
but "does each subsection actually answer what it should" is a **human criterion**. Both must pass.

| Subsection | Question it answers | Criterion (check yourself once after writing) | What a bad version looks like |
|---|---|---|---|
| **1) Last Handover** | Where the last round got to, what it produced | Has a **clickable path**, not "did a lot of things" | "Today I did 1, 2, 3, 4, 5 things" (⇒ it becomes a weekly report and goes over the limit) |
| **2) Current Projects** | What work is on my plate right now | Every row has a **memory file path + status + next step** | An empty table |
| **3) Private Memory Changes** | What changed in the memory itself, and why | Every line has a **date + what changed + why** | Only "updated" |
| **4) Next Steps / Blockers** | What is the new session's first action | Both the "next step" and "blocker" lines must exist; the blocker must say **who you're waiting on** | Left blank (⇒ the tool warns "section 4 Next Steps / Blockers is empty") |
| **5) Full Picture** | What this scene looks like as a whole | **Tool-generated**; the numbers (N project memories, M archive snapshots) must add up | Hand-written numbers |

### Write-back criterion (every write into memory must pass this table)

| ✅ Record | ⛔ Don't record |
|---|---|
| Built / changed an app, fixed a bug | Search results |
| Wrote a report / document | Temporary paths |
| Refactor / architecture change | The raw text of a tool error (if you must record it, record "symptom → root cause") |
| Chose a technical approach | One-off constraints ("let's just do it this way this time") |
| A convention shared by the owner | The chat process |

**Amount**: every write-back **≤ 10 lines / ≤ 2 KB**.
**Criterion**: "Will I still need this line in three months?" If not, don't write it.

### Hard requirement for slimming down: move only, never discard, and it must be provable

```
① First save a "before the move" snapshot      ← without this step you cannot prove afterwards that nothing was lost
② Move (history → archive/)
③ Run the reconciliation script: compare line by line "non-history lines before == non-history lines after"
      0 differences matched ⇒ then nothing was lost
④ Run the index health check: dead entries / unregistered / stale / identity drift
```

> **Real lesson (measured, 2026-10-31):**
> once we started dismantling without saving a snapshot, the **reconciliation script could not run at all** —
> you cannot prove you discarded nothing.
> Since then the rule changed: **snapshot first, then act.**

### Measured: where the hard limit boundary sits (2026-11-01)

| Measured value | Number | Explanation |
|---|---|---|
| Demo scene §0 | **587 B** | Limit 4 096 B, headroom 3 509 B |
| Demo scene main file | **1 375 B** | Limit 25 600 B |
| Largest §0 that exactly fits | **4 089 B** | 187 filler lines; one more line gives 4 109 B ⇒ over the limit |
| Local three scenes' §0, measured | **4 012 / 4 047 / 1 693 B** | Two of them are **less than 100 B from the limit** |

> ⚠️ The hard limit only blocks when you **exceed** it; it **does not warn you that it is nearly full**.
> Measure §0's size regularly; when it is close to the limit, slim it down — do not wait for the day it suddenly goes all red.

---

## 4. Locator card spec

```markdown
# <scene-name> · Locator Card

- Scene id: `<scene-id>`
- Scene name: <scene-name>
- Panel: <panel path>
- Memory directory: scenes/<scene-name>/
- Exclusive skill: `<scene-id>` (`scenes/<scene-name>/.dsh/skills/<scene-id>/SKILL.md`)
- Locator card version: 1
```

> **The locator card is the anchor for validation**: the tool writes the first 16 characters of its sha256 into `identity-card.md`.
> Change the locator card but do not re-stamp the identity card ⇒ `check` reports "card fingerprint stale".

---

## 5. Identity index spec

**Single source of truth**: every "scene ↔ session ↔ locator card" mapping is in this one table:

```markdown
## Scene Identity Index

| Scene | Panel ID | Panel Title | Session Name | Session ID | Locator Card | Main Skill |
|---|---|---|---|---|---|---|
| `sc-a` | `sc-a-ai` | scene A | scene A | `session-xxxx` | `scenes/scene A/locator-card.md` | `command` |
```

> ⚠️ **When this table is moved, the index path in the tool must be updated at the same time** —
> this is a real incident that has already happened (see [4 · Known Gaps and To-Do](4-known-gaps-and-todo.md) entry 4).
>
> **The fix is not "remember to update it"**, it is **making the index path a candidate chain too**:
> ```
> scenes/_scene-identity-index.md
>   → 外壳/scenarios/_scene-identity-index.md
> ```
> Take the first one that exists. Then moving it can never blind the tool.

### What each of the seven columns is for (what breaks if one is missing)

| Column | Who uses it | What happens if it's missing |
|---|---|---|
| Scene id | The tool (compares against the scene json) | The tool cannot find the scene |
| Panel id | Dispatch / notification / panel refresh | Other scenes cannot call you |
| Panel title | Humans | No harm, but you will misidentify it yourself |
| Session name | The engine finds the session by name | **Session binding fails = scenes mix up when you switch** |
| Session id | The engine finds it precisely by id (**the only authority**) | Same; after a session switch, not syncing points at the old session |
| Locator card | That scene's duties / assets / progress | The AI does not know what it is supposed to do |
| Main skill | That scene's professional procedure | The AI brute-forces professional work with generic methods |

> ⚠️ **Table and scene json disagreeing = the table is stale, not the json is wrong.**

---

## 6. Project memory spec

One file per project, **≤ 8 KB**, fixed fields:

```markdown
# <project-name>

- Status: <in progress / done / up for handover>
- In one sentence: <what this project is about>
- Evidence of result: <file path / commit / number>
- Next step: <who moves first, doing what>
- Pitfalls: <pits you stepped in, append only>
- Existing files: <list of related files>
```

> **Project memory belongs to the scene**, it is not the shared layer's business —
> when a project ends, **the scene is still there** (see the scene/project comparison in
> [2 · Scene](../00-core-mechanisms/2-scene.md) section 1).

**Routing**: the `memory` field of the shared layer's `_shared-memory/項目.json` points at this file.
**One project memory maps to exactly one path** — two places pointing at the same copy means it forks.

---

## 7. File index spec

```markdown
# <scene-name> · File Index

> Four states: `active / standing / archived / to-clean`

| File / Directory | What It Is | Status | Last Reviewed |
|---|---|---|---|
| `scene-private-memory.md` | scene private memory (hand-written) | active | 2026-10-31 |
```

| Status | Meaning | Handling |
|---|---|---|
| **active** | In use right now | —— |
| **standing** | Kept for use, re-review if untouched for 180 days | Look back at it periodically |
| **archived** | History, append only | Not maintained |
| **to-clean** | To be dealt with within 7 days | Act when it is due |

---

## 8. Naming conventions

| Object | Convention | Example |
|---|---|---|
| Scene directory | Chinese name, no symbols | `scenes/scene D/` |
| Scene id | Lowercase English + hyphens, only `[a-z0-9-]+` allowed | `sc-d` |
| Main memory file | `scene-private-memory.md` | Fixed name, cannot be changed |
| Project memory | `<project-id>.md`, id in English | `磁碟體檢-2026-10-31.md` |
| Archive snapshot | `<main-file-name>-<timestamp>-<first 6 of session id>.md` | `scene-private-memory-202610311007-a93204.md` |
| Tool scripts | Verb + object | `scene-memory.mjs`, `建會話.mjs` |

> **Keep the scene directory name and the scene id separate**: the directory name is for humans (Chinese), the id is for machines (English).
> The tool supports both — do not record only one of them.

### ⚠️ A pitfall actually hit: thought it was a hard link, it was two separate files

**Measured (2026-11-01, local workbench)**:

```bash
stat -c 'inode=%i links=%h  %n' scene-private-memory.md <scene-name>scene-private-memory.md
# inode=5636724 links=1  scene-private-memory.md
# inode=5374645 links=1  場景丙scene-private-memory.md
```

| Fact | Value | Meaning |
|---|---|---|
| The two files' inodes | **5636724 vs 5374645** | ★ **Different inodes ⇒ not a hard link** |
| Link count | **both are 1** | Each file has exactly one name pointing at it |
| Content difference | The main file has the latest progress; the copy is still an empty skeleton | **The two have already forked** |

> ⚠️ **"Looks like the same file" does not mean it is the same file.**
> Two files written independently drift apart over time —
> and **there is no error message at all**; you only notice when reading stale content and think "why did it go back to the old state".
>
> **Fix**: ⛔ Never assume a copy syncs. Either **use only one file**,
> or actually create a hard link (`ln`) and **verify the link count > 1**.
> Verification costs one `stat`; not verifying costs "read stale content and never know why".

---

## 9. Cross-scene messages (the channel that does not wake the other side)

File-based messages are a **zero-network-request** delivery method — the other side receives them even while asleep.

```
- [2026-10-31 09:12] → <scene-name>: [dispatch·please reply with a receipt] <one-line summary, details on the shared board>
```

| Property | Explanation |
|---|---|
| Zero network requests | Pure file write, delivered even if the other side is not awake |
| Receipt only | There is no way to proactively confirm the other side has seen it |
| **Must be written twice** | Shared board + the recipient's `## 0 - Notifications` |

> ⚠️ **Double-writing is the source of "board splitting".**
> When two scripts write to different paths, the recipient never receives anything, and the surface shows nothing wrong.
> The fix is **unified path resolution**, not "remember to write both" —
> see [4 · Known Gaps and To-Do](4-known-gaps-and-todo.md) entry 3.

---

## 10. How to confirm you have not missed anything after getting the spec

```bash
# ① Overview: what each scene is missing (including whether the boundary .git exists)
node 03-executable-tools/scene-memory.mjs list --root <workbench-root>

# ② Scene by scene: full check of structure/boundary/fingerprint/§0/project/archive
node 03-executable-tools/scene-memory.mjs check --scene <scene-name> --root <workbench-root>

# ③ All scenes in one go (exit code 0 = all passed, 1 = some scene failed)
node 03-executable-tools/scene-memory.mjs check --all --root <workbench-root>

# ④ Prove this checker really works (deliberately break 10 situations)
bash 03-executable-tools/negative-acceptance.sh
```

| Command | Which section of this doc it corresponds to |
|---|---|
| `list` | Section 2 (scene directory spec) |
| `init` / `stamp` | Sections 3 and 4 (memory file, locator card, identity card formats) |
| `handover` | Section 3 (§0 overwrite-in-place, archive snapshots) |
| `check` | The hard limit table in section 2 |

> Per-message detail and exit codes see [`03-executable-tools/USAGE.md`](../03-executable-tools/USAGE.md);
> the "fails when it should fail" acceptance method see [2 · Handover and Validation](2-handover-and-validation.md) section 6.

---

> ➡️ **Next**: [2 · Handover and Validation](2-handover-and-validation.md) (how to switch sessions, how you get blocked)
> ⬅️ **Back**: [Implementation README](README.md) ｜ **Related**: [2 · Scene](../00-core-mechanisms/2-scene.md) · [3 · Maintenance Manual](3-maintenance-manual.md) · [Templates](../04-templates/README.md)

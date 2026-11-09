# 5 · New Scene Spec

> **A standard scene = 10 items inside the directory ＋ 3 registrations outside it.**
> This doc turns those 10+3 into rules, and gives you the ten steps from zero to working, each with its acceptance criteria.
>
> **The goal of this doc is not for you to read it and remember it — it is for you to follow it and end up correct.**
> Every step has mechanical acceptance — `check` blocks, so you don't have to rely on memory.
>
> **The worked example throughout this doc is scene E** (the scene id `sc-e`).

---

## Zero. First ask: should this thing be a scene at all

**The criterion (one is enough)**: this kind of work **will come back**, and **every time it uses the same set of files, the same set of rules, the same domain of knowledge**.

| ❌ Should not be a scene | ✅ Should be a scene |
|---|---|
| "make a video today" — a one-off task | "the video workflow" — every video needs the storyboard spec, the asset library, the publish check |
| "a project" — has a clear end point | "scene D" — comes back every week, never ends |
| Split by tool — one scene per tool | Split by function — one scene per stretch of duty |

### Scene vs project (the easiest thing to mix up)

| | Scene | Project |
|---|---|---|
| Lifecycle | Exists long-term | Has a clear end point |
| Boundary | Decided by **duty** | Decided by **deliverable** |
| Memory ownership | The scene owns it | The project memory sits **under the scene** |
| Example | scene D | "the October 2026 circuit theory lecture notes archaeology" |

> **One scene can hold many projects; when the project ends, the scene is still there.**

### Scene vs ephemeral executor (sub-agent)

| | Ephemeral executor | Scene |
|---|---|---|
| Condition of existence | The one turn that summoned it | **Depends on no single call** |
| Has an event history | **No** | Yes (the `§0` handover ＋ `§5` decisions and pitfalls) |
| After it leaves | Nothing remains | The files are still there; the next round picks up |
| When to use | One-off queries, independent exploration, unrelated parallel work | **Work that comes back** |

> **The criterion in one line: does the value of this thing exceed "how it was done last time".**
> No → ephemeral executor. Yes → scene.

---

## 1. The spec of a standard scene

### A. Inside the scene directory (`scenes/<scene-name>/`)

| # | Item | Who writes it | Purpose | Does `check` verify it |
|---|---|---|---|---|
| 1 | `.git/` | `git init` | **The scene boundary**: the engine uses it to determine the project root, which constitutions get injected and which exclusive skills are visible | ✅ Blocks if missing |
| 2 | `AGENTS.md` | Human | **The scene constitution**: who I am, duty boundaries, memory rules, the session-switch protocol, cross-scene rules | — |
| 3 | `.dsh/skills/<scene-id>/SKILL.md` | Human | **The scene's exclusive skill**: how to take over at the start, how to work, how to write back, how to hand over | — |
| 4 | `locator-card.md` | Human | **The identity spec sheet**: scene id / name / panel path / memory directory / exclusive skill — **the fingerprint source for validation** | ✅ Exists ＋ fingerprint matches |
| 5 | `scene-private-memory.md` | Human | **The memory source of truth** (the only one) | ✅ Exists ＋ has a duties block |
| 6 | `identity-card.md` | **Tool** | Identity / permissions / card fingerprint — ⛔ a hand edit fails validation | ✅ Exists |
| 7 | `scene-portrait.md` | **Tool** | Panel layout / renderer / dependencies, derived from the scene definition | ✅ Exists |
| 8 | `_file-index.md` | Human | The file list, four states: `active / standing / archived / to-clean` | ✅ Exists |
| 9 | `project-memory/` | Human | One file per project, ≤ 8 KB | ✅ Exists |
| 10 | `archive/` | Human / tool | Pre-handover snapshots, append only | ✅ Exists |

### B. Outside the scene (the scene cannot manage it itself; it must be registered separately)

| # | Item | Location | Who writes it | Does `check` verify it |
|---|---|---|---|---|
| 11 | **The scene definition** (panel) | The engine-side directory outside `<workbench-root>/workflows…` (see the engine-side notes) | Human | ✅ The session is bound |
| 12 | **One row in the identity index** | `scenes/_scene-identity-index.md` (7 aligned columns) | Human | ✅ This card exists |
| 13 | **One resident session** (cwd = the scene directory) | Engine | Engine | ✅ The session is in the session store |

> **Items 11–13 are the easiest to miss.** Because they are not inside the scene directory, `ls` on the scene directory cannot show that something is missing.
> So `check` counts them too — **missing one produces an error, instead of discovering three months later that the scene cannot be called.**

### B.2 ★ The four registrations must agree (a gap filled in by measurement on 2026-11-03)

A scene must be registered in **four places**, and these four belong to different files, different tools, and different authors:

| # | Location | What goes there |
|---|---|---|
| ① | `scenes/<scene-name>/` | The scene itself (an independent git repository) |
| ② | `<root>/scenarios/<scene-id>.json` | The scene config: the panel, the bound `sessionId` |
| ③ | `scenes/_scene-identity-index.md` | Seven columns: scene id ↔ panel ↔ session ↔ locator card ↔ skill |
| ④ | The shared layer (`索引.json` / `記憶地圖.json` / `areas/`) | The scene card and the routing |

> **★ The symptom of missing one is not obvious.** The panel pointing at the wrong session ⇒ the scene is broken;
> the card pointing at the wrong one ⇒ cross-scene routing is wrong; a missing index row ⇒ the tool "does not know this scene".
> **And no single tool can manage all of this** — `check` only covers consistency inside the scene directory.

**So a dedicated audit tool is needed** (implemented engine-side, the repo defines the interface):

| What to compare | Rule |
|---|---|
| ②'s `sessionId` ↔ ③'s session id | **Must be identical** |
| ①'s directory name ↔ ②'s `name` | **Must match** |
| ③'s locator card path | The file must exist |
| ④'s owner / panel ↔ a panel id that actually exists in ② | **Must be a panel id that scene really has** (not a guessed name) |
| ① exists but ② does not | Report an error (the scene directory exists but there is no panel ⇒ it will never appear) |

> **"④'s owner must be a panel id the scene really has" is the easiest to miss**:
> when the scene was created the panel id was written as `ns-chat`, and later the panel was changed to `sc-e-ai`,
> but the shared layer's card still points at the old one — **with no symptom at all**; that cell is just permanently dead.

### B.3 ★ A "view" is not a scene (the third type, added by measurement on 2026-11-03)

> **In the scene config json, besides "scenes" there are also "views".**
> A view has only a panel, **no scene body** — no scene directory, no session, no memory, and it does none of the four registrations.

| | Scene | View |
|---|---|---|
| Scene directory | ✅ Has one | ❌ None |
| Resident session | ✅ Has one | ❌ None (`sessionId` may be left empty) |
| Scene private memory | ✅ Has one | ❌ None |
| Exclusive skill | ✅ Has one | ❌ None |
| Four registrations | ✅ All four | ❌ **None of them** |
| Identity index | ✅ Has a row | ❌ None |
| Shared-layer area card | ✅ Has one | ❌ None |
| Reason to exist | A duty that **accumulates memory** | **Read-only presentation**: draw what is scattered across the shared layer as one picture |

**How to mark it**: add `"view": true` to the scene config json.

```json
{ "id": "overview", "name": "總覽", "view": true,
  "panels": [ { "id": "ov-neuron", "type": "neuron", "col": 1, "row": 1, "w": 4, "h": 5 } ] }
```

> ★ **Why this type is needed.**
> Measured: there is a "memory neuron 3D view" panel that reads the shared layer's index / projects / todo / skills
> and draws a map of the whole workbench's scenes — **it is an overview, not a duty**.
> Bind it under some scene and two problems appear:
> ① when that scene is retired the view disappears with it (but the view has nothing to do with that scene);
> ② the audit tool will demand four registrations for it, though it obviously should not have a scene directory.
> **⇒ Give it its own type and it can exist independently of any scene.**

**The audit tool must skip views** (otherwise it reports "no scene directory" and "identity index is missing a row"):

```
Read the scene config json → if j.view is true → skip, do not list it as a scene to audit
```

**Tab order**: views and scenes share the same tab bar; `"first": true` controls who goes first.

---

### C. The fixed structure of `scene-private-memory.md`

```
## §0 Current Handover
  ### 1) Last Handover        —— where the last round got to, where the output is
  ### 2) Current Projects     —— table: project / memory file / status / next step
  ### 3) Private Memory Changes    —— what changed this time, and why
  ### 4) Next Steps / Blockers    —— who moves first, in what order; if blocked, write down who you're waiting on
  ### 5) Full Picture            —— tool-generated
## Core Responsibilities             ← at least 3 items
## §1 What I Own / What I Don't
## §2 Where to Start
## §5 Decisions and Pitfalls (append only)  ← ★ the landing spot for accumulable artifacts
## 0 - Notifications               ← the inbox for cross-scene messages
```

**§0 answers exactly four questions**: who am I / where did I get to / what is next / where am I blocked.
Writing it as a weekly report is the most common mistake — it goes over the limit, and the new session still does not know what to do next.

---

## 2. The ten-step procedure

### Step 0: decide whether it should be a scene

See [§Zero](#zero-first-ask-should-this-thing-be-a-scene-at-all). **Do not skip this step** — opening the wrong scene costs more than not opening one.

### Step 1: decide the three names

| Name | Example | Rule |
|---|---|---|
| **Scene id** | `sc-e` | English kebab-case; **at the same time** the exclusive skill directory name and the scene definition file name |
| **Scene name** | `scene E` | Chinese; used for the panel display, and it is the "session name" in the identity index |
| **Scene directory name** | `scene E` | The physical directory name |

> ⚠️ **The correspondence of the three names must not slip.** The validation tool **looks up the directory by the `name` field of the scene definition**.
> A directory name that does not match `name` ⇒ the tool says "not a scene directory, no matching scene json".

### Step 2: create the directory and the boundary (the most critical step)

```bash
cd <workbench-root>
mkdir -p scenes/<scene-name>/.dsh/skills/<scene-id> scenes/<scene-name>/project-memory scenes/<scene-name>/archive
cd scenes/<scene-name> && git init -q
```

> ⛔ **`git init` cannot be skipped.** Without `.git` ⇒ the exclusive skill is not loaded,
> **but the scene constitution is still loaded by the chain ⇒ the symptom is not obvious**, showing up as "this scene seems to have gotten dumber".
> `check` will block it: the scene directory is missing the boundary marker.

### Step 3: write the three core documents

| File | What goes in it |
|---|---|
| `locator-card.md` | Scene id / name / panel path / memory directory / exclusive skill |
| `AGENTS.md` | The scene constitution: who I am, duty boundaries, memory rules, the session-switch protocol, cross-scene rules |
| `.dsh/skills/<scene-id>/SKILL.md` | The exclusive skill: how to take over at the start, how to work, how to write back, how to hand over |

**The frontmatter of `SKILL.md` must have `name` and `description`, and the description must carry the absolute path of the scene directory** —
that is the engine's basis for deciding "is this skill visible in this scene".

Templates see [`04-templates/`](../04-templates/).

### Step 4: create the memory skeleton

```bash
node <workbench-root>/工具/scene-memory.mjs init --scene <scene-name> --root <workbench-root>
```

Generates `scene-private-memory.md` and `_file-index.md`, and creates `project-memory/` and `archive/`.

**Then replace `## Core Responsibilities`** (the template says "to be filled in"), **at least 3 items** — fewer than 3 means you have no duties,
and the new session does not know who it is.

### Step 5: create the scene definition (the panel)

Put `<scene-id>.json` in the engine-side scene directory. It must have at least one `harness`-type panel,
`sessionTitle` set to the scene name, and `sessionId` **left empty for now** (backfilled in the next step).

### Step 6: create the resident session

Use the engine-side session-creation tool (DSH: `bash 工具/建會話.sh <scene-name>`).
It goes through the engine RPCs: create the workspace → create the session → rename → send the opening message → pin it to the sidebar.

> **A session created with only cwd falls into "ungrouped", so you must pass the workspaceId.**

### Step 7: ★ Backfill the sessionId into two places (the easiest to miss)

```
① the sessionId of the harness panel in the scene definition json
② the "Session ID" column of scenes/_scene-identity-index.md (7 aligned columns)
```

> ⛔ **Missing either one ⇒ `check` reports "session not bound to the scene json"**,
> and the symptom is "check is all red but you cannot tell what is wrong".

### Step 8: stamp and self-check

```bash
node <workbench-root>/工具/scene-memory.mjs stamp --scene <scene-name> --root <workbench-root>
node <workbench-root>/工具/scene-memory.mjs check --scene <scene-name> --root <workbench-root>
```

`stamp` regenerates `identity-card.md` (with the locator card fingerprint) and `scene-portrait.md` (with the panel layout).

> **If you changed the locator card you must re-run `stamp`**, otherwise `check` reports "card fingerprint stale".

### Step 9: confirm it can be called

Use the engine-side call tool (DSH: `node <workbench-root>/工具/呼叫場景.mjs --only=<scene-name>`).
Every scene prints "✓ called" ⇒ the scene is alive.

> ★ **The workbench tools do not live inside the scene directory.** The engine-side call / read-reply tools belong to the **workbench**,
> they are not some scene's private property — putting them in `scenes/<scene-name>/` makes "delete that scene" hideously become
> "and delete the tools too", and tools travelling with a scene makes version control meaningless.

---

## 3. The three easiest traps

| Trap | Symptom | Fix | Is there a mechanical check? |
|---|---|---|---|
| **Forgot `git init`** | The exclusive skill is not loaded, **but the symptom is not obvious** (it looks like the scene got dumber) | `git init -q` | ✅ `check` blocks it |
| **Backfilled the sessionId in only one place** | `check` reports "session not bound to the scene json", and you cannot tell what is wrong | Fill in both places | ✅ `check` blocks it |
| **Changed the locator card and did not re-stamp** | `check` reports "card fingerprint stale" | Run `stamp` | ✅ `check` blocks it |

**All three have a mechanical check** — this is the core claim of the whole architecture: **rules do not rely on memory, they rely on blocks.**

---

## 4. The second memory file (a mistake the scene itself makes, measured 2026-11-03)

**Every scene may end up with two memory files**: `scene-private-memory.md` and `<scene-name>scene-private-memory.md`.

**Source, measured**: the **scene itself** wrote the wrong file name when writing memory (commit message: "the scene constitution AGENTS.md write took effect").
Not a human's mistake — **the scene agent got it wrong**.

| Situation | Result |
|---|---|
| Different inodes | **The two will fork** — the source of truth changed and the orphan did not keep up; and `check` only looks at the source of truth ⇒ nobody manages the orphan |
| Same inode (a hard link) | The contents always agree, but the **duplicate file name** confuses other tools (any tool looking for "*scene-private-memory.md" will hit it by mistake) |

**Now `check` blocks it** (both the repo side and the engine side):

| Situation | Message |
|---|---|
| Different inodes | `scene directory has an orphan memory file "X" (inode differs from the source of truth) ⇒ the two will fork, please move it into archive/` |
| Hard link | `scene directory has a second memory file "X" (same hard link as the source of truth) ⇒ keep only "scene-private-memory.md"` |

**The fix**: move the orphan into that scene's `archive/` (do not delete it, keep the history); break the hard link (the contents stay in the source of truth).

> **★ What this rule means**: the scene makes this mistake by itself, and **there is no symptom**.
> So you cannot rely on "remember not to create a second one" — the tool has to block it.

---

## 5. Deleting a scene (noted in passing, because the procedure is the reverse)

Deleting a scene **needs more guardrails than adding one**:

1. **Commit or archive first** — uncommitted content is lost on the spot
2. Unpin and archive the engine-side session first
3. Remove that row from the identity index, delete the scene definition json
4. Delete the scene directory
5. Run `check --all` to confirm nothing is left behind

> Real lesson: once, a scene was deleted without committing first and the content vanished on the spot.
> See [Known Gaps](4-known-gaps-and-todo.md) for the details.

---

> ⬅️ **Back**: [Implementation README](README.md) ｜ **Previous**: [4 · Known Gaps and To-Do](4-known-gaps-and-todo.md) ｜ **Related**: [2 · Scene](../00-core-mechanisms/2-scene.md) · [3 · Scene Memory](../00-core-mechanisms/3-scene-memory.md)

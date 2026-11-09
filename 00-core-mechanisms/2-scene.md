# 2 · Scene —— one scene ＝ the carrier of accumulation

> A scene is not "a folder", it is a **boundary**.
> It answers three questions at once: **who owns this scene? Where is its boundary? What of it can other scenes see?**
>
> Inside the framework of [1 · Accumulation](1-accumulation.md) it answers a fourth question:
> **where did the work we have already done accumulate to?**

---

## 1. What counts as a scene

**The criterion (one is enough)**: this kind of work **comes back repeatedly**, and **every time it uses the same set of files, the same set of rules, and the same domain knowledge**.

> Why is "comes back repeatedly" the criterion? Because **accumulation is only meaningful on work that repeats**.
> One-off work should not open a scene —— that is the position of the [ephemeral executor](../05-comparisons-and-selection/1-scene-vs-ephemeral-executor.md).

| ❌ Not a scene | ✅ Is a scene |
|---|---|
| "Make a video today" —— a one-off task | "Video workflow" —— every episode needs the storyboard spec, the asset library, the publish check |
| "One project" —— has a clear end point | "scene D" —— comes back every week, never ends |
| "Split by tool" —— one scene per tool | "Split by function" —— one scene per stretch of responsibility |

**The difference between a scene and a project** (easy to confuse):

| | Scene | Project |
|---|---|---|
| Lifecycle | Long-lived | Has a clear end point |
| Boundary | Decided by responsibility | Decided by deliverable |
| Memory ownership | The scene owns it | Project memory lives **under the scene** |
| Example | scene D | "October 2026 circuit-lecture notes archaeology" |

> One scene can hold several projects; **when the project ends, the scene stays.**

---

## 2. The six-part set: what a scene must have

| # | Part | Who writes it | Purpose |
|---|---|---|---|
| 1 | **Scene config** (json) | Machine owner | Panel layout, type, coordinates, which session is bound |
| 2 | **Locator card** | Human | One sentence saying "who am I, where am I, what do I own" —— **the anchor for routing and validation** |
| 3 | **Scene private memory** | Human | §0 handover + responsibilities + decisions and pitfalls (**the single source of truth**) |
| 4 | **Scene-private skills** | Human | Practices only this scene can see; **other scenes do not even have them in the list** |
| 5 | **Optional panels** | Machine owner | Preview / files / URL / conversation —— the visible part of the workbench |
| 6 | **Persistent session + one identity index row** | Built by the tool | Every opening is the same session; the index table is the **single authority** |

Directory shape:

```
scenes/<scene-name>/
├── .git/                        ← ★ Scene boundary (the engine uses it to find the project root)
├── AGENTS.md                    ← Scene constitution (injected only into this scene's sessions)
├── .dsh/skills/<scene-id>/SKILL.md ← Scene-private skills (visible only in this scene)
├── locator-card.md                     ← The scene's identity sheet
├── scene-private-memory.md                ← ★ Memory source of truth (§0 handover ≤ 4 KB)
├── identity-card.md                     ← Tool-generated, ⛔ hand-editing breaks validation
├── scene-portrait.md                   ← Tool-generated, ⛔ hand-editing breaks validation
├── project-memory/                     ← One per project
├── archive/                         ← Old snapshots (append only, never edited)
└── _file-index.md
```

---

## 3. How the boundary is drawn: `.git` is the routing table

This is the single most worth-explaining passage in the whole architecture.

Many people think "who to dispatch to" means throwing a sentence at some agent. This approach is different:
**who to dispatch to is not asked of the model, it is asked of the file system.**

The engine walks up from the session's working directory, hits the first directory containing `.git`, treats it as the "project root",
and then loads **only** the `AGENTS.md` and `.dsh/skills/` inside that tree:

```js
// dsh-agent-instructions/lib/index.js:574
async function findProjectRoot(cwd, markers, fileSystem, signal) {
  let current = resolve(cwd);
  for (;;) {
    for (const marker of markers)          // markers default = [".git"]
      if (await existsAsMarker(join(current, marker))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(cwd);
    current = parent;                       // keep walking up
  }
}
```

Skill visibility uses the same logic:

```js
// dsh-skill-filesystem/lib/index.js:154
const projectRoot = await findProjectRoot(resolve(cwd), ...);
roots.push({ path: join(projectRoot, ".dsh/skills"), source: "project-dsh" });
roots.push({ path: join(projectRoot, ".agents/skills"), source: "project-agents" });
roots.push({ path: join(this.dshHome, "skills"), source: "user-dsh" });     // globally visible
```

### So "switching scene ＝ switching brains"

| | scene D | scene A |
|---|---|---|
| Scene constitution | only `scenes/scene D/AGENTS.md` | only `scenes/scene A/AGENTS.md` |
| Visible skills | `sc-d` | `sc-a` |
| Memory source of truth | `scenes/scene D/scene-private-memory.md` | `scenes/scene A/scene-private-memory.md` |

More precisely: it is not "the model is forbidden to take other work" —— it is that **in the world it sees, that scene's things do not exist at all** ——
no constitution, no skill, no memory, so it cannot even judge "should I take this".

> **The philosophy here: eliminate errors through structure, do not request correctness through prompts.**
> A prompt, however well written, is only a "request"; the file system boundary is "fact".

### Two layers of constitution

```
Instructions from: <global>/AGENTS.md      ← Global constitution (injected every turn, shared by all sessions)
Instructions from: AGENTS.md              ← Scene constitution (only inside this scene's tree)
```

The global constitution defines the rules (memory lives in files, scene sovereignty, one dispatch ＝ one receipt, done means there is an observable landing point);
the scene constitution defines **this scene's** responsibilities and boundary.

---

## 4. How to split scenes: ten real splits

| # | Split | Example |
|---|---|---|
| 1 | By **function** | scene A (dispatch)／scene D (organize)／scene C (maintain) |
| 2 | By **deliverable type** | Video／article／slides |
| 3 | By **client** | Client A／Client B (but: **same function, different clients** usually belong in the same scene, separated by project memory) |
| 4 | By **time cycle** | Daily／weekly |
| 5 | By **tech stack** | Frontend／backend |
| 6 | By **device** | Desktop／laptop／server |
| 7 | By **permission boundary** | Isolating confidential work |
| 8 | By **rhythm** | Always on standby／emergency repair |
| 9 | By **memory characteristics** | Needs long-term accumulation vs one-off |
| 10 | By **who is on it** | Who owns this piece |

### Three typical mis-splits

| Symptom | What is wrong with the split | Fix |
|---|---|---|
| Scenes multiply and none of them has work | **Split too fine** | Merge: if two scenes use the same files and the same domain knowledge, they belong together |
| Inside a scene you keep talking about other people's work | **Split too coarse** | Split: work that crosses domains means the boundaries are not aligned |
| A scene has to read two directories at once | **Boundary is wrong** | One scene ＝ one git repository root; whatever must cross goes into a shared layer |

---

## 5. Scene sovereignty: a hard rule, not a courtesy

| Rule | Content |
|---|---|
| **Only write your own** | Each scene writes only its own `scene-private-memory.md` |
| **To touch someone else's, only send a request** | Find an error in another scene's memory ⇒ dispatch／notify, ⛔ do not edit it for them |
| **Whose memory you change is whose it stays** | This rule kills the hardest bug to find: two agents racing to write the same memory |

Independent git repository + sovereignty rule ＝ every change can be **diffed and held accountable**——
**memory becomes a version-controlled asset, not the model's internal memory.**

---

## 6. Scene geometry mapped onto the six-part set

```
┌─ Global layer ────────────────────────────────────────┐
│  Global AGENTS.md · global skills · engine · tools      │
│  (there is only one rule set; scenes only specialize)   │
└────────────────────────────────────────────────────────┘
                    ▲ each scene sees only its own tree
┌─ scene A ─────┐ ┌─ scene B ─────┐ ┌─ scene C ─────┐
│ own .git      │ │ own .git      │ │ own .git      │
│ own constitution│ │ own constitution│ │ own constitution│
│ own skills    │ │ own skills    │ │ own skills    │
│ own memory    │ │ own memory    │ │ own memory    │
│ own projects  │ │ own projects  │ │ own projects  │
└──────────────┘ └──────────────┘ └──────────────┘
         the only legal cross-scene channel ↓
┌─ Shared layer ────────────────────────────────────────┐
│  Identity index · cross-scene board · to-do · conflict log · project list │
│  (writes are partitioned: each owner writes only its own) │
└────────────────────────────────────────────────────────┘
```

---

## 7. Failure modes of the scene system

| Symptom | Root cause | Fix |
|---|---|---|
| Scenes keep being added and keep getting emptier | Split too fine | Merge using the "comes back repeatedly" criterion |
| `.git` disappears and all scene skills vanish | The engine only accepts `.git` as the project-root marker; without it it **silently walks up** | Add "`.git` exists" to the check (⚠ symptom is not obvious: the constitution still gets loaded by the chain) |
| After switching scenes the AI feels like a different person | `sessionId` points at the old session | Step ③ of the session switch protocol |
| Other scenes' skills are visible too | Global skills are visible to all sessions | Scene isolation only isolates the **project-level** part; global skills must be pruned |

---

> ➡️ **Next**: [4 · Dispatch and Receipt](4-dispatch-and-receipt.md) (how work goes out, how it comes back)
> ⬅️ **Back**: [Core Mechanisms README](README.md) ｜ **Related**: [3 · Scene Memory](3-scene-memory.md)

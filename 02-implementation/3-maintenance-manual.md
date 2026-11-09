# 3 · Maintenance Manual — for when you need to change the architecture three months from now

> **This doc is written for the person who comes back to maintain it.**
> Goal: every architectural change has a standard procedure, can be verified, can be rolled back, and **does not silently break**.

---

## 0. Read these three sentences first

1. **Inventory the current state before designing.** Before you touch anything, read through what already exists — including the parts you assumed were already there.
   (Lesson: once we pushed an SDK approach, only to find the other side had already written a more suitable path themselves,
   and it worked better. **"An official option exists" ≠ "it is the better way".**)
2. **Every value may have only one definition.** Rules, hard limits, paths, index locations — anything at all gets exactly one source of truth.
3. **After changing, verify that "it fails when it should fail".** Only seeing "the normal case passes" does not count.

---

## 1. The standard procedure for changing the architecture (five steps)

```
① Inventory ──▶ ② Define the change ──▶ ③ Migrate ──▶ ④ Verify ──▶ ⑤ Record
```

### ① Inventory (no code)

Answer these four questions first, and **write them down**:

| Question | Why you ask it |
|---|---|
| Where is this value/rule defined now? | More than one place ⇒ it will fork sooner or later |
| Who reads it? | A reader you did not change ⇒ the change is equivalent to no change |
| After the change, is the old data still legal? | Decides whether you need to migrate |
| How do you roll back when it breaks? | No rollback plan ⇒ do not touch it |

> **Output: a "who defines / who reads / how to migrate" table.**
> That table is the foundation for every later step; do not skip it.

### ② Define the change (rules before code)

- Write the rules into the **single source of truth** (this architecture uses `handover-rules.json`).
- The program **only reads that file**, never hardcodes its own copy.
- The rule change itself must be versioned (see section 3).

### ③ Migrate (snapshot first, then act)

```
① Save a "before the move" snapshot first      ← without this step you cannot prove afterwards that nothing was lost
② Run the migration
③ Run the reconciliation script: compare line by line "non-history lines before == non-history lines after"
      0 differences matched ⇒ only then is nothing lost
④ Run the index health check: dead entries / unregistered / stale / identity drift
```

> Real lesson: once we started dismantling without saving a snapshot, the **reconciliation script could not run at all** —
> you cannot prove you discarded nothing. Since then the rule changed: **snapshot first, then act.**

### ④ Verify (two tracks)

| Track | Content |
|---|---|
| **Positive cases** | Normal data should pass |
| **Counter-examples** | Deliberately broken, must be blocked (see [2 · Handover and Validation](2-handover-and-validation.md) section 6, V1–V8) |

**Only the positive cases passing = not verified.** The counter-examples must really be blocked.

### ⑤ Record

- Write the change into [`changelog.md`](../changelog.md) (local version) or the git commit message;
- Write new rules into the corresponding mechanism doc;
- Write the traps you stepped on into [4 · Known Gaps and To-Do](4-known-gaps-and-todo.md).

---

## 2. How to do the common maintenance tasks

### Task A: add a new scene

```
① scenes/ <new-scene-name>/.git init          ← the boundary comes first
② Copy from 04-templates/: scene-private-memory.md, locator-card.md, identity-card.md, scene-portrait.md
③ Edit the locator card: scene id, name, panel path, exclusive skill
④ scenes/ <new-scene-name>/AGENTS.md          ← the scene constitution
⑤ scenes/ <new-scene-name>/.dsh/skills/<scene-id>/SKILL.md
⑥ Add one row to _scene-identity-index.md
⑦ Run: scene-memory.mjs stamp --scene <new-scene-name>
⑧ Run: scene-memory.mjs check --scene <new-scene-name>   ← must be all green
⑨ Create the resident session, pin it, fill in the sessionId (see task B)
```

**Acceptance criterion**: switch to the new scene and the AI's skill list contains only that scene's own skills.

### Task B: switch to a different session

```
① Overwrite §0 current handover (progress / next step / blocker)
② Create the new session, archive the old one
③ Sync three places: scene config sessionId / identity index session id column / §0 handover signature
④ scene-memory.mjs stamp --scene <name>       ← re-stamp the identity card
⑤ scene-memory.mjs check --scene <name>        ← must pass
```

> Missing any one of step ③ ⇒ the panel points at the old session ⇒ "the AI acts like a different person".

### Task C: change a hard limit (e.g. §0 from 4 KB to 8 KB)

#### Think it through first: changing a hard limit is not changing a number, it is changing a behavioural threshold

Answer these four questions first, and **write them down**:

| Question | Why you ask it |
|---|---|
| **How much data is currently over budget?** | Over-budget data must either be slimmed down or you accept it will never pass the check |
| **Does the reason the hard limit exists still hold?** | The reason for 4 KB is "readable in 30 seconds". If the nature of the scene changed (e.g. from "dispatching work" to "deep research"), the reason may have changed; **if the reason has not changed, do not touch the number** |
| **After relaxing it, who pays the price?** | The price is **the new session has to read more**. Relaxing 4 KB → 8 KB ＝ the opening cost doubles |
| **After relaxing it, does this hard limit still block anything?** | If no scene's §0 would exceed 8 KB, this hard limit is already decoration — **decoration is more dangerous than having none** |

> ★ **A hard limit is not "roughly don't write too much"; it is an explicit threshold.**
> Before relaxing a hard limit, confirm: **are you relaxing a "threshold" or "laziness"?**
> If it is laziness, the correct action is to slim down, not to relax.

#### Do it: which places to change (single source of truth for rules)

```
① Change sec0MaxBytes in handover-rules.json          ← ★ single source of truth for rules, change only here
② Confirm the tool reads this file (not a hardcoded copy)
③ Find the existing data: which §0 are over budget? Slim them down or move them to the archive, one by one
④ Run check --all, confirm the report is consistent
⑤ Update the skeleton in 04-templates/ (the tool uses the new value when generating §0)
⑥ Update every place in the docs that mentions 4 KB
```

> ⚠️ **Do not skip step ⑥.** The hard limit number is scattered across the docs, the templates and the tool;
> changing one place produces an inconsistency like "the docs say 4 KB, the tool blocks at 8 KB" —
> which is exactly the disease described in section 7 of [2 · Handover and Validation](2-handover-and-validation.md).

#### ⚠️ The two-step self-check you must do after changing (otherwise you don't know whether it took effect)

```bash
# ① Look at the rules source the tool self-reports, confirm it is the file you changed
node 03-executable-tools/scene-memory.mjs list --root <workbench-root>
#    output: rules source: <path>   ← this must be the file you changed

# ② Deliberately blow up the handover section, check whether the reported limit number is the new value
#    expected: "§0 N B exceeds 8 KB (hard limit 8192)" and not 4096
```

> **Skip these two steps and the change is as if it was never made.**
> This repo has a live instance of the disease: `04-templates/handover-rules.json` uses Chinese key names
> (`交接段紅線位元組`), while the tool looks for the English key (`sec0MaxBytes`) —
> **the file was read, but the value did not take effect, and no error message appeared at all**.
> The full measurement is in section 7 of [2 · Handover and Validation](2-handover-and-validation.md).

### Task D: change the scene split (merge / split scenes)

```
① Inventory: what does each of the two scenes have (memory, projects, skills, sessions)
② Decide: which memory file does everything merge into? How do the project memories migrate?
③ Snapshot both memory files
④ Merge the §0 (not concatenation — rewrite it as one new handover)
⑤ Migrate the project memory files, keeping the original file names
⑥ Before deleting the old scene's git repository, ★ you must commit + make a backup archive first
⑦ Update the identity index and the routing table
⑧ Run check --all
```

> ⚠️ **Step ⑥ is a hard gate.**
> When deleting a scene, if it has uncommitted changes ⇒ **they are lost on the spot, with no backup**.
> **Before deleting any scene, commit first, then archive.** No exceptions.

### Task D2: retire a scene (the one that has been idle for a long time)

**Criterion**: six months from now, will you still open a separate window for it? If you cannot answer, retire it.
Retiring is **not deleting** — it means "keep the memory and the index, stop occupying a slot".

```
① Inventory: what unfinished work does this scene still have? Where does it go?
② Move the unfinished work to the scene that receives it (or mark it "shelved, awaiting the owner's decision")
③ Run scene-memory.mjs handover --scene <name>     ← produces the final archive snapshot
④ ★ git commit (the uncommitted content in the scene repository)
⑤ ★ Backup archive: <workbench-root>/.archive/<scene-name>-<timestamp>.tar.gz
⑥ Delete that row from the identity index
⑦ Delete <scene-id>.json from the scene configs
⑧ Delete that scene's entries from the shared layer (areas / index / project table)
⑨ Archive the session (if the engine has an archiveSession-type API)
⑩ Run check --all, confirm the remaining scenes are all green
```

**Pre-deletion checklist (tick every item, none may be skipped)**:

```
□ git status clean? (not clean ⇒ commit or stash first)
□ Backup archive made? (path: <workbench-root>/.archive/<scene-name>-<timestamp>.tar.gz)
□ Scene memory exported to a single file? (the handover snapshot is in archive/)
□ No project memory inside that others depend on?
□ The identity index, the scene config and the shared layer are all cleaned up?
```

> ⚠️ **git only protects what has been committed.**
> "There is version control" does not mean "it cannot be lost" — the uncommitted part is gone the moment you delete.
>
> **Measured (2026-10-31)**: when a scene was deleted it contained **2 uncommitted modifications + 2 untracked files**;
> after the deletion they were **lost on the spot, with no backup**.
> Also noted: after that deletion, `scene-memory.mjs list` only recognises directories under `scenes/` ⇒
> **deleting the directory is how you retire — no engine change needed**.

### Task E: upgrade the engine

```
① First see what behaviours the engine version changed (especially: project root determination, skill mounting, command injection)
② Rebuild a session in a test scene, run the isolation verification (see below)
③ Compare: under the new and old engines, is the skill list the scene sees identical
④ Confirm whether the generation logic for §0, the identity card and the scene portrait changed
⑤ Run check --all immediately after the upgrade
```

**How to do the isolation verification** (this is the measurement that settles whether "switching scenes = switching brains" actually holds):

```
① Create a temporary session in each scene directory, run one round of probe questions
② Create a temporary session in a "non-scene directory", run the same probes —— this is the control group
③ The probes ask three questions (no tools allowed, answer only from context):
     ① What is your working directory?
     ② The list of skills you can see (names only)
     ③ Is there a "Scene Constitution" (場景憲法) in your context? If so, copy the top-level headings
④ Compare the answers across scenes: did each scene see the skills it should? Did anything leak in that should not have?
⑤ Clean up everything (cancel + archive), leave nothing in the sidebar
```

> **The control group is the key.** Without it you cannot distinguish "the isolation works" from "it could not see those skills anyway".

---

## 3. Versioning: how rules and architecture get a version

| Thing | How it is versioned | Why |
|---|---|---|
| Scene memory | Every handover produces an `archive/` snapshot (timestamp + first 6 of session id) | The snapshot is the version |
| Scene repositories | Their own git repositories | `git log` is the complete history |
| Tools | git repository | —— |
| Rules (`handover-rules.json`) | The `version` field in the file + git | Changing a hard limit is a major change |
| Locator card | The `locator card version: N` field | The tool can tell from it whether to re-stamp |
| Global constitution | Version number + old versions archived | Change once +1 |

> **The rules version field is not decoration**: when the tool has to migrate old data,
> it needs to know "which version of the rules generated this data".

---

## 4. Rollback: every change needs a way back

| Change type | Rollback method |
|---|---|
| Memory content | `git checkout` / pull a snapshot from `archive/` |
| Tool version | `git revert` in the tool repository |
| Rules version | The rules file version field + git |
| Scene merge / split | Must commit + archive before deleting (**hard rule**) |
| Engine upgrade | Keep the old engine directory, do not overwrite it |

> **"Can be rolled back" and "has been verified to be rollback-able" are two different things.**
> Discovering for the first time that you cannot roll back, at the moment you actually need to, is too late —
> **after every big change, rehearse the rollback once.**

---

## 5. The six mistakes most easily made during maintenance

| # | Mistake | Consequence | Prevention |
|---|---|---|---|
| 1 | Adopt an official solution on sight | Pushed an SDK, only to find the other side had already written something more suitable | **Inventory the current state first** |
| 2 | Write the same rule in two places | Boards split, messages silently lost | **Single source of truth for rules** |
| 3 | Only verify the positive cases | The checker looks safe but blocks nothing | **Counter-example acceptance** |
| 4 | Delete a scene without committing | Uncommitted content lost on the spot | **Commit first, then archive** |
| 5 | Change the hard limit in the tool but not in the docs | Docs and behaviour disagree | A limit change syncs all three places |
| 6 | Assume "there is an observable landing spot" means it took effect | You wrote it, but wrote it where nobody looks | **Check whether the landing spot's timestamp moved** |
| 7 | Assume changing the rules file means it took effect | The value was not read, and there was no error at all | **Look at the "rules source" that `list` self-reports** |

---

## 6. Which acceptances to run after every change

**This table is the definition of "done".** If it is not run through, the change is not complete.

| # | Acceptance | Command | Criterion for passing |
|---|---|---|---|
| **A1** | All-scene structure | `scene-memory.mjs check --all --root <workbench-root>` | Exit code **0**; every scene reports "✓ all passed" |
| **A2** | ★ Counter-example acceptance | `bash 03-executable-tools/negative-acceptance.sh` | **10 passed, 0 failed** (proves the checker still blocks) |
| **A3** | ★ Rules source | `scene-memory.mjs list --root <workbench-root>` | The printed "rules source" is **the file you changed** |
| **A4** | Hard limit boundary | Deliberately blow up the handover section | The reported limit number = **your new value** (not the old one) |
| **A5** | Internal links | `node 03-executable-tools/check-links.mjs` | "✓ all links valid" |
| **A6** | Isolation | Probe questionnaire (task E, step 2) | Each scene saw the skills it should, and nothing leaked in |
| **A7** | Rollback | Actually roll back once | You can return to the pre-change state |
| **A8** | Record | Changelog + known gaps | Both sides carry your record this time |

> ⚠️ **A2 and A3 are the easiest to skip, and they are the most lethal.**
> - **Skip A2** ⇒ you do not know whether the checker still blocks (it may be broken and always return 0).
> - **Skip A3** ⇒ you do not know whether your changed hard limit took effect (when the file is read but the key names do not match, **there is no error at all**).
>
> **A2 and A3 together take seconds to run, and they decide whether all the work before them is actually done.**

**Pick which ones to run by change type**:

| Change type | Must run |
|---|---|
| Docs only | A5 · A8 |
| Hard limit / rules | A1 · A2 · A3 · A4 · A8 |
| Tools | A1 · A2 · A8 |
| Add / delete / merge a scene | A1 · A2 · A3 · A7 · A8 |
| Engine upgrade | All (A1–A8) |

---

## 7. When you should stop and ask someone to confirm

In these four situations, **do not decide on your own**:

| Situation | Why |
|---|---|
| Deleting any scene or directory | Irreversible |
| Changing a hard limit (4 KB / 25 KB and the like) | Affects all existing data |
| Merging scenes (memory moves house) | Involves ownership of everything |
| Changing the global constitution | Global rules are the owner's alone |

> This is one of the few rules in the whole architecture that sits outside the "mechanical invariants":
> **the sovereignty rules themselves need someone to guard them.**

---

## 8. Self-check list before maintenance

```
□ I have read the counter-example acceptance table in [2 · Handover and Validation](2-handover-and-validation.md)
□ I have inventoried "how many places is this rule defined in"
□ I have confirmed that "who reads it" will all be changed together
□ I have a "before the move" snapshot
□ I have written both positive and counter-example verification
□ I have confirmed the rollback method (and rehearsed it)
□ I have updated every affected number in the docs
□ I have written the new traps I stepped on into [4 · Known Gaps and To-Do](4-known-gaps-and-todo.md)
□ I have updated [changelog.md](../changelog.md)
```

---

> ➡️ **Next**: [4 · Known Gaps and To-Do](4-known-gaps-and-todo.md) (located but unfixed problems)
> ⬅️ **Back**: [Implementation README](README.md) ｜ **Related**: [1 · Directory and File Spec](1-directory-and-file-spec.md) · [2 · Handover and Validation](2-handover-and-validation.md) · [Changelog](../changelog.md)

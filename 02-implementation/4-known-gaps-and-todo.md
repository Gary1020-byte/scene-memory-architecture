# 4 · Known Gaps and To-Do

> **This doc records problems that have been located but not yet fixed.**
> Writing them down is for this: **the next time someone (or yourself) hits the same trap, they can look up the root cause instead of investigating from scratch.**

> 📌 Status markers: `🔴 unfixed` · `🟡 fix known, work not started` · `🟢 fixed` · `⚪ accepted by design`
>
> Measurement period: 2026-10-31 to 2026-11-01 (local Linux environment, DSH engine; the 3 scenes are each independent git repositories)

---

## 1. Overview

| # | Gap | Status | Impact |
|---|---|---|---|
| 21 | The spec §6 "on-limit action" does not exist at the tool layer | 🔴 | Memory only grows; the scenes that blow up are the ones with no archive |
| 22 | The hard limit layering is wrong (main file only warns, shared layer has no limit) | 🔴 | The red light is lit and nobody looks; no scheduled `check` |
| 23 | No agent reads the shared-layer board | 🔴 | 22k tokens consumed by nobody; mixed with the history of a deleted scene |
| 24 | `## 0 - Notifications` is a broken "channel B" precondition | 🔴 | Cross-scene messages can be written but not read; the section has no limit |
| 25 | The routing table's hit rate cannot support "machine first" (3 of 7 hits) | 🟢 | **Fixed (2026-11-09): 67-sentence regression test at 100%, 0 ambiguous sentences, weighted scoring + simplified/traditional normalization + a feedback loop** |
| 26 | The accumulable-artifact routing criteria were not implemented ⇒ the dispatch demanded verbatim copies, the real machine grew dual writes | 🟢 | **Fixed (2026-11-09): the dispatch's reject rule now agrees with the verifier, 4 groups of dual writes eliminated per spec §3.2** |
| 13 | **The accumulable artifact has no mechanical acceptance** | 🟢 | **Fixed (v0.3): `verify-receipt.mjs` + landing acceptance, 12 end-to-end acceptance items** |
| 14 | **Workflow execution state has no persistence mechanism** | 🟢 | **Fixed (v0.3): `run-workflow.mjs` ＋ execution-state / carry templates** |
| 15 | **Receipt field names are scattered in many places** | 🟢 | **Fixed (v0.3): all of them into the single source of truth `handover-rules.json`** |
| 16 | **The receipt three-part contract exists only at the doc layer, not the tool layer** | 🟢 | **Fixed (v0.3): `verify-receipt.mjs` blocks a missing section** |
| 17 | **No recovery mechanism after a run stops** | 🟢 | **Fixed (v0.3): `resume` scene A (a gap that only surfaced by actually running it)** |
| 3 | The memory root path is split (board split) | 🔴 | **Messages silently lost** |
| 4 | The identity index path is hardcoded | 🔴 | Move the index ⇒ validation all red |
| 5 | A missing `.git` silently degrades | 🟢 | **Already blocked at the tool layer (V9)** |
| 9 | No "commit first / archive first" gate before deleting a scene | 🔴 | **Uncommitted content lost on the spot** |
| 11 | Two memory files are not hard links; the contents diverge | 🔴 | You read stale content with no error message |
| 12 | There are two rules files with different key names; one of them is never read | 🔴 | Changing a hard limit does nothing, with no error |
| 1 | No automatic routing | 🟡 | A misrouted scene has to be corrected by a human |
| 2 | Receipts have no timeout detection | 🟡 | "Nobody picked it up" cannot be discovered |
| 10 | Scene memory has no native dispatch / receipt | 🟡 | Relies on written messages + human confirmation |
| 6 | cwd can be switched | ⚪ | Isolation is a default constraint, not a lock |
| 7 | Touching a path expands the scope | ⚪ | Writing into another subdirectory pulls in its constitution |
| 8 | Global skills are visible to all sessions | ⚪ | Scene isolation only isolates the project-level part |

---

## 2. Five real lessons (symptom → root cause → fix → status)

> These five are **really stepped on**, not "I heard it goes like this".
> Each has a fixed format: **symptom / root cause / fix / current status**.

### Lesson 1: dismantling files without saving a snapshot ⇒ the reconciliation script cannot run at all

| | Content |
|---|---|
| **Symptom** | After the slimming down (moving history into `archive/`) is done, **you cannot get an answer to "did anything get lost"** |
| **Root cause** | No "before the move" snapshot was saved ⇒ the reconciliation script has no baseline to compare against ⇒ **you cannot even prove "I didn't lose anything"** |
| **Fix** | **Snapshot first, then act.** The order cannot be reversed: ① snapshot → ② move → ③ run the reconciliation script → ④ run the index health check |
| **Current status** | 🟢 **Fixed (it has become a rule)**. Written into section 6 of [3 · Scene Memory](../00-core-mechanisms/3-scene-memory.md) and section 1 ③ Migrate of the [3 · Maintenance Manual](3-maintenance-manual.md) |

> **The lesson here is worth more than the fix**: it is not "remember to save a snapshot",
> but **"do not act without a snapshot"** — because a change without a baseline **cannot be accepted**,
> and its correctness can only rest on luck.

### Lesson 2: not committing / archiving before deleting a scene ⇒ uncommitted content lost on the spot

| | Content |
|---|---|
| **Symptom** | After the scene was deleted, **2 uncommitted modifications + 2 untracked files** were **lost on the spot, with no backup** |
| **Root cause** | The deletion process has no precondition gate. **The existence of a git repository only provides traceability after the fact; it cannot recover uncommitted work** |
| **Fix** | **Before deleting any scene: commit first, then archive. No exceptions.** The checklist is in task D2 of the [3 · Maintenance Manual](3-maintenance-manual.md) |
| **Current status** | 🔴 **Unfixed** (confirmed by measurement on 2026-10-31). The current countermeasure is **a hard rule in the docs**, not a gate the machine enforces |

> **"There is version control" does not mean "it cannot be lost".** git only protects what has been committed.

### Lesson 3: the memory root is hardcoded in two scripts and they disagree ⇒ boards split, messages silently lost

| | Content |
|---|---|
| **Symptom** | When sending a message by hand, the recipient's `scene-private-memory.md` **never receives it at all**; the message only goes into the old board |
| **Root cause** | Two scripts (`發消息.mjs`, `_共用-場景記憶.mjs`) hardcode the old memory root path `engine-data/.dsh/scene-memory/`, while the other scripts already point at `scenes/` |
| **Fix** | **Unified path resolution**: all scripts resolve the memory root through the same candidate chain (environment variable → `<root>/scenes` → `<root>/engine-data/.dsh/scene-memory`), taking the first one that **exists and is a directory**. Then merge the old board once, **preserving the original timestamps** |
| **Current status** | 🔴 **Unfixed** (confirmed by measurement on 2026-11-01: two scripts still hardcode the old path) |

**Measured evidence (2026-11-01)**:

| Board | Last message | Size |
|---|---|---|
| New root `scenes/_shared-memory/_跨場景通知.md` | 2026-10-31 17:40 | 7 061 B |
| Old root `engine-data/.dsh/scene-memory/_shared-memory/_跨場景通知.md` | 2026-10-31 08:26 | 5 050 B |

> Both boards were **still growing**, yet their contents did not overlap at all —
> **neither board is the complete truth**, and nothing showed on the surface.
>
> **The disease is not "forgot to sync" — it is "the same thing has two path definitions".**
> Instead of remembering to sync, **make it so it cannot have two**.

### Lesson 4: the identity index moved but the path in the tool did not move with it ⇒ `check` all red across three scenes

| | Content |
|---|---|
| **Symptom** | `scene-memory.mjs check` is **all red across three scenes**, with the error "there is no card for this scene in the identity index" |
| **Root cause** | The index moved from `外壳/scenarios/` to `scenes/_scene-identity-index.md`, but the tool's `IDX` **still points at the old location** |
| **Fix** | Make the index path a **candidate chain** (`scenes/_scene-identity-index.md` → `外壳/scenarios/_scene-identity-index.md`), taking the first one that exists |
| **Current status** | 🔴 **Unfixed** (measured on 2026-11-01: `check` is still all red across three scenes, exit code 1) |

> **Why it is severe**: it is not "the error message is annoying" — it is that **the whole validation mechanism is paralysed** —
> every scene shows a red light, and a red light is then the same as no light.
> **The iron rule "check must pass before switching sessions" was, at that moment, completely inoperative.**
>
> Acceptance: `check --all` all green across the three scenes; and when the index is **deliberately moved away**,
> the tool should report "index not found" rather than "every scene is red".

### Lesson 5: two memory files thought to be hard links; the inodes differ and the contents diverge

| | Content |
|---|---|
| **Symptom** | Thought `scene-private-memory.md` and `<scene-name>scene-private-memory.md` were the same file (thought they would sync automatically); in fact **the two contents already differ**, and **there is no error message at all** |
| **Root cause** | Thought a hard link had been created; in fact the inodes differ and the link count is 1 for both ⇒ they are **two independent files**, each written on its own |
| **Fix** | ⛔ Do not assume a copy syncs. Either **use only one file**, or actually `ln` it and **verify the link count > 1** |
| **Current status** | 🔴 **Unfixed** (confirmed by measurement on 2026-11-01) |

**Measured evidence (2026-11-01, local workbench)**:

```bash
stat -c 'inode=%i links=%h  %n' scene-private-memory.md 場景丙scene-private-memory.md
# inode=5636724 links=1  scene-private-memory.md
# inode=5374645 links=1  場景丙scene-private-memory.md
```

| Fact | Value | Meaning |
|---|---|---|
| inode | **5636724 vs 5374645** | ★ **Different inodes ⇒ not a hard link** |
| link count | **1 for both** | Each file has exactly one name pointing at it |
| contents | The main file has the latest progress; the copy is still an empty skeleton | **They have already forked** |

> ⚠️ **This is the quietest kind of failure in this doc**: no error, no warning.
> You only notice when you read stale content and think "how did it go back to the old state",
> then suspect that **a human wrote it wrong** instead of suspecting the file system.
>
> **The cost of verifying is one `stat`; the cost of not verifying is "read stale content and never know".**

---

## 3. Structural gaps not yet fixed

> The first five are **concrete incidents**. These three are **structural** —
> they are not "some file is broken", they are "this architecture is born missing this piece".

### Gap A: cross-scene dispatch has no native support (only file messages + human confirmation) 🔴

**Current state**: cross-scene dispatch relies on **file messages + human confirmation**, with no native support.
A message can be delivered, but you cannot confirm the other side saw it; a dispatched request has no timeout detection,
so **"the work is done but the other side does not know" can only be discovered by a human**.

**Fix**: write the dispatch four-part contract and the receipt's diff set as a **structured format** (prefix markers),
so tools can parse, summarise and reconcile them.

**Note**: the structured format must **stay human-readable** —
memory is for humans; machine-parsability is only an added value.

### Gap B: insufficient separation of tool paths and data paths 🔴

**Current state**: lessons 3, 4 and 5 are all **different faces of this same gap** —
path resolution is scattered across scripts, the rules file is scattered across directories, and file name correspondences rely on convention rather than on a mechanism.

| Symptom | How it shows up |
|---|---|
| Path resolution is scattered | Two scripts each hardcode the memory root ⇒ boards split |
| The index path is hardcoded | The index moves ⇒ `check` all red across three scenes |
| The rules file is scattered | Two rules files with different key names ⇒ changing a hard limit does nothing, with no error |
| File name correspondence relies on convention | Thought it was a hard link but it was not ⇒ contents fork |

**Fix**: **all path resolution goes through the same function**, **every rules number exists in exactly one place**,
**file name correspondences are generated by the tool rather than remembered by a human**.

### Gap C: rules numbers scattered in many places drift easily 🔴

**Current state**: numbers like hard limits, the subsection list and the fingerprint length should in theory live in one JSON only.
But **the rules file itself can grow a crack**.

**A live instance in this repo (2026-11-01, end-to-end verification)**:

| File | Key name style | Will the tool read it? |
|---|---|---|
| `03-executable-tools/handover-rules.json` | English keys (`sec0MaxBytes`…) | ✅ Read (search order position 1) |
| `04-templates/handover-rules.json` | Chinese keys (`交接段紅線位元組`…) | ❌ **Not read** |

**End-to-end measurement**: put the Chinese-keyed copy into the tool's own directory and change the hard limit to `999`:

```
rules source: …/handover-rules.json              ← the tool self-reports that it read this copy
T: ✗ §0 19235 B exceeds 4 KB (hard limit 4096)   ← but the limit is 4096, not 999
```

> **The file was read, but the value did not take effect, and there was no error message at all.**
> This is the most typical shape of "rules numbers scattered in many places drift easily":
> **it is not that one place is wrong — it is that both places "look right".**

**Fix**:

| Approach | Explanation |
|---|---|
| **One copy is enough** | Keep only one `handover-rules.json`; **reference** it elsewhere, do not copy it |
| **Use English key names** | Write the key names the program reads in English, keep Chinese only in the "description" column |
| **Make the failure visible** | The tool self-reports the "rules source" path in `list`; after changing a hard limit **you must look at that line** |
| **Add one self-check** | Add a counter-example to the acceptance script: "change the hard limit to 999 ⇒ check must report 999" |

---

## 4. Entry by entry (other known problems)

### #5 A missing `.git` silently degrades 🟢 Already blocked at the tool layer

**Symptom**
- After the scene directory's `.git` is deleted:
- The engine's project root **walks up** to an ancestor directory
- **All of that scene's exclusive skills disappear**
- But **the scene constitution is still loaded by the chain** (because the constitution is found along the ancestor chain)

**Why it is hard to detect**
The symptom is not obvious. The scene can still chat and still read memory,
it just "seems to have gotten dumber" / "it seems not to know how to do this".

**Fix**: add "`.git` existence" into `check`:
```
✗ scene directory is missing .git (scene boundary fails ⇒ the exclusive skill will not be loaded, and the symptom is not obvious)
```

**Current status**: 🟢 **Fixed**. The validation tool has implemented this check,
and counter-example acceptance **V9** (delete the demo scene's `.git` ⇒ `check` reports an explicit error, exit code 1) proves that it really blocks.

> ★ **This is a complete case of "turning a rule into a mechanism"**:
> from the discovery "the engine silently walks up" to the result "the tool blocks it",
> every step in between has an acceptable landing point.

### #1 No automatic routing 🟡

**Current state**
"Who should do this job" is still judged by scene A's model based on the duty card. If it judges wrong, a human has to correct it.

**Fix**
Add a routing table to the shared layer (scene → trigger words / scene name);
on a hit, use the table; **only when there is no hit hand it to the model to judge**.

**Note**
The routing table is a **default value**, not the only truth —
the model's judgement should not be replaced by the routing table; the routing table just gives it a starting point.

### #2 Receipts have no timeout detection 🟡

**Current state**
The rule is "the other side not replying = counted as no receipt", but no mechanism will **actively discover** that "nobody picked it up".

**Fix**
Record the timestamp of each dispatch on the orchestrator side,
and scan periodically: no receipt within the threshold (e.g. 2 hours) ⇒ mark it as "receipt overdue".

**Note**
The threshold needs a starting point but should not be dead — different jobs differ hugely in workload,
so a default value plus the ability to override is recommended.

### #10 Scene memory has no native dispatch / receipt 🟡

**Current state**
Cross-scene dispatch relies on "file message + human confirmation", with no native support.

**Fix**
Write the dispatch four-part contract and the receipt's diff set as a **structured format** (prefix markers),
so tools can parse, summarise and reconcile them.

**Note**
The structured format must **stay human-readable** —
memory is for humans; machine-parsability is only an added value.

## 5. Accepted by design (not bugs)

| # | Phenomenon | Why it is accepted |
|---|---|---|
| 6 | cwd can be switched | Isolation is a soft constraint that "defaults to cwd". Turning it into a hard lock would block legitimate cross-directory work |
| 7 | Touching a path expands the scope | This is a **feature**: when an agent works inside some subdirectory, that directory's constitution ought to apply |
| 8 | Global skills are visible to all sessions | Global skills are a shared tool set to begin with. The price is that scene isolation only isolates the project-level part — **this is a deliberate trade-off** |

> **Writing down "accepted limitations" is as important as writing down bugs.**
> Otherwise next time somebody treats it as a new bug and investigates it all over again.

---

## 6. Suggested priority order for fixing these

| Priority | Item | Reason |
|---|---|---|
| **P0** | #3 memory root split | It is currently causing data loss, and **the symptom is hidden** |
| **P0** | #9 deleting a scene with no gate | Irreversible data loss |
| **P0** | #11 two memory files fork | You read stale content with no error message |
| **P0** | #12 rules file key names inconsistent | Changing a hard limit does nothing, with no error message |
| **P1** | #4 index path hardcoded | The validation mechanism is paralysed ＝ all protections fail |
| **P2** | #1 routing table · #2 timeout detection | Efficiency, not correctness |
| **P3** | #10 native dispatch | Do it after routing and timeout exist |

> **Two of the P0 items share a trait: no error message at all.**
> This is the most expensive class of problem — because **without an error, nobody goes looking**.

---

## 6.1 The five gaps of the accumulation mechanism (found while re-architecting on 2026-11-02 → fixed during implementation)

After the architecture was changed to put "accumulation" on the main line, there were five things that had **a spec but no mechanism**.

**All five were implemented and fixed in v0.3.** The process of fixing them is itself the most valuable part of this list —
because **three of the gaps were "written to spec, discovered only by actually running it"**.

### Gap 13: the accumulable artifact has no mechanical acceptance 🟢 Fixed

**The original problem**: the red line "a receipt without an accumulable artifact ＝ this round of work was wasted" was just a sentence in a document,
with no program enforcing it. A receipt could be sent back with only a "diff set".

**Fix**:
1. `03-executable-tools/verify-receipt.mjs` — checks whether the receipt has the three-part contract
2. ★ **Landing acceptance**: every accumulable artifact must be **findable in the scene memory's §5 Decisions and Pitfalls (or in the exclusive skill)**.
   Writing it only in the receipt does not count.
3. `run-workflow.mjs` calls it when it collects a receipt; if it fails, it **stops on the spot** (fail-closed)

**Acceptance**: items E3, E5 and E6 of `workflow-acceptance.sh`.

### Gap 14: workflow execution state has no persistence mechanism 🟢 Fixed

**The original problem**: a workflow definition can be written and validated, but **where the state lives during execution, who writes it, and how to recover, existed only as a spec with no implementation**.

**Fix**:
1. `03-executable-tools/run-workflow.mjs` — the offline executor (start / step / receipt / resume / status)
2. The `runs/<run-id>/` directory: execution-state.md (how far it got, where it is stuck) + carry.md (passes the accumulable artifact onward) + receipts/ (copies of dispatches and receipts)
3. Pre-check fail-closed: the scene does not exist, the boundary marker is missing, a step has no criteria ⇒ refuse to start

**Acceptance**: items E1 and E2 of `workflow-acceptance.sh`.

> **This version is offline**: it does not actually call the engine; instead it writes out what each step should do as files and advances the state machine.
> This is deliberate — **engine-neutral**. The engine-specific version only has to replace "generate a dispatch" with "actually dispatch it";
> the state machine and the acceptance logic are reused verbatim.

### Gap 15: receipt field names are scattered in many places 🟢 Fixed

**The original problem**: "diff set / accumulable artifact / next handoff" appeared in four files at once, so one change meant four edits.

**Fix**: all field names go into `handover-rules.json` (single source of truth); both the docs and the tools read it.

### Gap 16: the receipt three-part contract exists only at the doc layer, not the tool layer 🟢 Fixed

**The original problem**: even with the field names unified, nothing checked the receipt when it was delivered.

**Fix**: `verify-receipt.mjs` blocks a "missing section" and a "section that is empty".

### Gap 17: no recovery mechanism after a run stops 🟢 Fixed (**discovered only by running it**)

**This is something entirely absent from the spec** — the original spec only said "stop on the spot on failure", never "how to reconnect after fixing it".

**Symptom**: the first time it was blocked by fail-closed, the run stopped at "stopped",
and then **even the fixed receipt could not be collected** ("the run state is 'stopped', it cannot accept a receipt").

**Fix**: `resume` scene A pulls the state back to "running" and re-collects the receipt for the same hop.

---

## 6.2 The traps hit during implementation (all "write it and don't look — it only shows up when you run it")

| # | Symptom | Root cause | Fix | Status |
|---|---|---|---|---|
| 18 | The `step` command explodes: `Cannot read properties of undefined` | **The state property name was wrong**: it wrote `目前步驟` but read `目前步驤` (a synonym one character apart), reading undefined ⇒ `steps[NaN]` | Use one single spelling; the lesson: **one concept may have only one spelling in the code** | 🟢 Fixed |
| 19 | The carry file stays empty; the accumulable artifact never gets written into it | **Using regex to grab a markdown section is unreliable**: the lookahead `\s*$` (with the m flag) matches immediately on the blank line after the heading ⇒ it captures an empty string; lazy + lookahead then eats the last line | Switch to **line-by-line scanning** (`sectionLines`), put it in the shared module | 🟢 Fixed |
| 20 | Three tools each had their own YAML parser, and each was wrong once | Duplicated implementation | Extract the shared module `workbench.mjs` (path resolution + YAML + section parsing) | 🟢 Fixed |
| 21 | The dispatch body is missing "Needs (the previous hop's accumulable artifact)" | The carry write failed (see #19) ⇒ unreadable | Fixed together with #19 | 🟢 Fixed |
| 22 | The gate requires a human to "hand-edit execution-state.md" | The spec only said "stop and wait for a person", never how to continue | Add `resume --gate-passed` scene A | 🟢 Fixed |

> **#18 is the one most worth remembering**: a one-character difference, the program runs fine and writes it into the file,
> and only when reading it do you find it is undefined. **Code that has never actually run is code that has never been verified.**
> This is why v0.3's acceptance is "run it end to end" rather than "read the code and check it".

## 6.3 The archive layer and the session switch (found while finishing the spec on 2026-11-03)

### Gap 18: the full chat transcript has nowhere to go ⇒ an engine version change makes the whole batch unreadable 🟡 Fixed (spec + tool)

**Measured**: a workbench's session store had 30 sessions; the engine recognised 11 and could actually read **7**;
23 reported `corrupt` — but `zstd -t` passed on all of them, **not a single byte of data was broken**.

**Root cause**: the engine changed its session log format (the new one has one frame per line, the old one packs the whole thing into the first frame).
**This is not data corruption; the engine cannot read its own old files.**

**Fix**: add [6 · Archive Layer](6-archive-layer.md) ＋ `session-archive.mjs` —
drop the full chat transcript into `session-archive/<scene-name>/`, with a greppable index.
**An engine version change no longer affects your data**, because the data is no longer inside the engine.

### Gap 19: switching sessions is a manual procedure ⇒ the symptom of missing one place is always the same 🟡 Fixed (spec + tool)

**Symptom**: switch to a scene and the AI acts like a different person. If any one of the three places
(scene config sessionId / identity index session id column / §0 handover signature) is out of sync, the symptom is **exactly the same** —
so you cannot guess from the symptom which one was missed.

**Fix**: add [7 · Session Switch](7-session-switch.md) ＋ `switch-session.mjs` —
preconditions (can we switch at all), a mechanical self-check for the three sync points, and missing one counts as inconsistent.

### Gap 20: the checker modifies data 🟢 Fixed (**discovered only by measurement**)

`session-archive.mjs check` used to rebuild the index first ⇒ **it overwrote the broken index** ⇒ the problem could never be found.

> **A checker must be read-only.** A checker that modifies data erases the problem on every check,
> it will always return 0, and a human will think they are protected — **more dangerous than no checker at all**.

---

## 6.4 Memory size and the shared layer (added after the full audit on 2026-11-05)

> Scope of measurement: 22 scenes on the local workbench (`~/.DSH/工作台/場景/`), 81 session files,
> all tool source code, every scene's `AGENTS.md`.
> Method: measure the bytes of the §0 / §5 / `0 - Notifications` sections file by file, grep the reference relations, actually run `check --all` and `派單.mjs 路由`.
> **All statuses are 🔴 unfixed (the owner's decision on 2026-11-05: list them as tasks first, do not act).**

### Measurement snapshot (2026-11-05)

| Scene | Main file | §0 | §5 | `0 - Notifications` | Project memory | Archive |
|---|---|---|---|---|---|---|
| **郵件處理** | 24,061 | **5,435 ⚠over** | 11,441 | **6,421 ⚠** | **0 files** | 0 copies |
| 新增場景 | **24,651 ⚠at the line** | 3,536 | 949 | 140 | 2 files | 2 copies |
| 影片剪輯 | 20,612 | 3,808 | 3,347 | **4,727 ⚠** | 6 files / 73,595 B | 2 copies |
| 音效配樂 | 15,604 | 3,346 | 6,983 | **4,576 ⚠** | **0 files** | 0 copies |
| 簡報設計 | 17,211 | 3,966 | 9,408 | 2,341 | 4 files / 74,252 B | 2 copies |
| 自我復盤 | 10,615 | 2,926 | 2,515 | **4,157 ⚠** | 3 files | 2 copies |
| 社群發布 | 8,376 | 2,069 | 924 | **4,131 ⚠** | 2 files | 0 copies |

Machine-wide total: main files 194,668 B · §5 52,008 B · `0 - Notifications` **40,947 B**.
**49 skill files exceed the 12 KB hard limit**, the largest is `NTU 課程` at 94,379 B.
`check --all` currently exits with code **1** (郵件處理 §0 at 5,435 B exceeds 4 KB), **but nothing scheduled ever runs it**.

### Gap 21: the spec §6 "on-limit action" does not exist at the tool layer 🔴

**Symptom**: `scene-memory.mjs handover` **copies the whole main file into `archive/`**; the main file does not get one byte smaller.
The "move old rounds and old decisions into `archive/`, keep only an entry point + a pointer in the main file" that spec §6 describes — **the "move" action has no program**.

**Root cause**: none of the existing five commands `init / stamp / handover / check / list` makes a file smaller.
"Handover" is a **copy mechanism, not a move mechanism**.

**Consequence**: 郵件處理, the worst offender, **has not a single archive copy** (only 9 of the 22 scenes have an archive) —
because nobody runs the handover, and running it would not help anyway.

**Fix**: add `scene-memory.mjs slim --scene <name> [--dry]`, transcribing the four steps of spec §6 into code:

| Step | What the program must do |
|---|---|
| ① Snapshot first | Write `archive/pre-slim-<timestamp>.md` (= the complete main file before slimming) |
| ② Move | §0 subsection 3 keeps only a ≤3-line summary, the rest goes into `archive/sec0-changes-<date>.md`; the excess of §5 goes into the archive and the main file keeps a pointer; the whole `0 - Notifications` section goes into the archive |
| ③ Reconcile | **In the same program**, compare line by line "non-history lines before == non-history lines after", printing "moved N / remaining M / differences 0"; **a non-zero difference aborts** |
| ④ Health check | Update `_file-index.md`, recompute the fingerprint, re-stamp the identity card (`stamp`) |

**Hard requirement**: `--dry` must achieve "the plan is computed and not one byte is written".
The reason is in [Lesson 1](#lesson-1-dismantling-files-without-saving-a-snapshot--the-reconciliation-script-cannot-run-at-all) — without a snapshot you cannot prove nothing was lost.

**Acceptance**: after `--dry` the main file's hash is unchanged; after a real run §0 ≤ 4,096 B and the reconciliation difference = 0;
counter-example: manually delete the moved content from the archive ⇒ the reconciliation script must report "something was lost".

### Gap 22: the hard limit layering is wrong — the main file over budget only warns 🔴

**Symptom**: in `check`, §0 over 4 KB → `problems` (**blocks**); the main file over 25 KB → `warns` (**only warns**);
**the shared layer over budget → not even a warning** (there is no shared-layer hard limit entry in `handover-rules.json`).

**Root cause**: the "block / warn" of a hard limit was assigned by hand according to the importance of the object, with no consistent principle;
and the check is only called incidentally when switching sessions — **no cron runs `check --all`** —
`check --all` now exits with code 1, this red light is already lit, and the system keeps running as if nothing happened.

**Fix**:
1. The main file over 25 KB ⇒ promote to `problems` (block the handover), or at least **block the handover but not the check**
2. Add shared-layer hard limit entries to `handover-rules.json` (the boards, the todo board, the `0 - Notifications` section)
3. **Add scheduling**: a daily `check --all` ＋ `一致性稽核.mjs`, pushing a notification when something is abnormal

**Acceptance**: inflate some scene's main file to 26 KB ⇒ `check` must report an error and exit with code 1 (right now it only prints one warning line).

### Gap 23: the shared-layer board is a "write-only bus" — no agent reads it 🔴

**Symptom**: not one of the 23 scenes' `AGENTS.md` teaches an agent to read the shared layer (the only mention of "shared layer" is in the development tool,
and it is a prohibition — "do not touch scene memory or the shared layer"); the global constitution `~/.dsh/AGENTS.md` greps **0 hits** for "shared / board / notification";
of the 81 session files, only 8 mention `_跨場景通知`, and **all of them are on the write side; read-side = 0**.

**Root cause**: the board's original positioning was "leaving a trace" (spec 8 §3.2: "the shared-layer board = leaving a trace, everyone can see it;
the recipient scene's `## 0 - Notifications` = the recipient sees it themselves"), **it was never a channel for agents to use**.
The only things really reading it are the `wb-web` web page (`readNotices()`) and the topbar status bar — **both for humans**.

**Current data**: `_跨場景通知.md` is 66,910 B (≈22k tokens), 140 entries, of which 121 are mechanical noise,
only 12 are real dispatches / 5 are receipts / 2 are rejections; **and it still mixes in the history of the "B站" scene that was deleted on 2026-10-30**.

**Fix (two options, the owner picks one)**:

| Option | Approach | Cost |
|---|---|---|
| **A. Cut it** | Delete `_跨場景通知.md` / `_場景活動.md` / `_待辦.md` / `衝突.md` (move them to `archive/` first); have the audit read `派單/<場景>/*.狀態.json` instead (**it already has `發起方` / `狀態` / `送出時間` / `拒絕原因`**) | The web version loses one board; the 3D overview's edges were never built from the board anyway (`buildGraph()` only uses scene→skill→project) |
| **B. Fix it** | Add an unread flag + filtering by recipient + rotation (keep the last 7 days, archive the rest) to the board; and teach agents to read it in the global constitution + 23 scenes' `AGENTS.md` | 22 scenes' constitutions have to be changed in sync; the token cost remains |

**Acceptance (A)**: after deleting the board, run the `派單 --全部` flow end to end once; the receipts and the audit are unaffected;
**Acceptance (B)**: open a new scene session and the opening self-introduction can say "there is 1 unread notification" citing the board's `→ <this scene>` entry.

### Gap 24: `## 0 - Notifications` is a broken "channel B" precondition 🔴

**Symptom**: spec 8 §3.2 states outright: "writing only to the board and not into the recipient's memory file means the message goes into the old board,
and the recipient's memory file never receives it — that real incident happened exactly this way. **Dual writing is not redundancy, it is the precondition for it working.**"
But on the real machine the `0 - Notifications` section is appended at the **end** of the memory file (after §5), not inside §0;
`check` does not look at this section at all; **no `AGENTS.md` teaches an agent to read it**.

**Current data**: the `0 - Notifications` sections total 40,947 B, the largest is 郵件處理 at 6,421 B (**bigger than its entire §0 of 5,435 B**),
with 19 lines of a scene dispatching to itself stuffed inside; 4 scenes are over 4 KB.

**Root cause**: spec 8 treats "the recipient sees it themselves" as a problem of **file location**,
but an agent only reads §0 when it opens (the session-switch opening message hard-codes "read the §0 handover first, then work") —
**the right location with nobody reading it is still no delivery**.

**Fix**:
1. Add a `0 - Notifications` section size hard limit (8 KB) to `check`
2. Move the "unread notifications" summary into §0's jurisdiction (or add one line to §0: "N unread notifications, see X")
3. Redirect `派單.mjs`'s `dualWrite`: no longer write the public board, write the recipient scene's own inbox
4. Add one line to each of the 23 scenes' `AGENTS.md` explaining how to read this scene's inbox

**Acceptance**: dispatch a request to some scene → when that scene opens a new session, its opening self-introduction can say "there is 1 unread notification".

### Gap 25: the routing table's hit rate cannot support "machine first" 🟢 Fixed (2026-11-09)

**Symptom**: actually running `派單.mjs 路由`, only 3 of 7 everyday phrases **hit**:

| Input | Result |
|---|---|
| What is the midterm scope | ✓ 考古題庫 |
| That audio file just now was too loud | ✓ 音效配樂 |
| Check me how much disk space is left | ✓ 本地電腦 |
| Check my todos for this week | ✗ miss |
| Forward this email to 王 | ✗ miss |
| I want to make a short video | ✗ miss |
| Tidy up my notes | ✗ miss |

**Root cause**: the routing table has 32 entries and owners repeat (產品發布 ×2, 自我復盤 ×3, 開發工具 ×2);
a hit is decided by "entry order", and the order is a manual decision made during maintenance; there is no concept of synonyms / word forms / weights.

**Another layer**: the routing table still carries keywords that were already judged to be generic words (e.g. "音檔"→音效配樂,
"摘要"→每日簡報), **which conflicts with the "remove generic words" lesson already in the skill**.

**Fix**:
1. Add keywords (fold in the 4 misses above), keep only one owner set per entry
2. Remove generic words
3. **Add a feedback loop**: record every routing hit / miss and manual correction, so the routing table gets better on its own

**Acceptance**: a 30-sentence measured phrase set, hit rate ≥ 80%.

**The actual fix** (2026-11-09, measure first, then change):

1. **First establish a regression baseline**: `工具/路由測試語句.json` (58 sentences, 24 scenes) ＋
   `工具/路由回歸測試.mjs` (re-runnable, supports `--明細` and a threshold mode).
   Baseline measurement: **34 of 41 sentences hit = 82.9%** (7 mismatches).
2. **Rewrite the scoring mechanism** (`routeBy()` in `派單.mjs`): the old logic "a long keyword always beats a short action word"
   would misroute "幫我把這個 repo 公開". Changed to **action weighting ＋ occurrence-position weighting ＋ keyword-length weighting ＋ multi-word weighting**.
   The action word list only holds actions (make / write / cut / mix / forward…); noun-like keywords do not get action weighting.
3. **Tidy the routing table**: merge duplicate owners (one set per owner), remove generic words
   (摘要／空間／音檔／同步／sync／貼文／排程 —— per skill §8, leave those to the model),
   add colloquial compounds and synonyms (`復盤|複盤`, `每日摘要`, `每日資訊摘要`, `流程編排|流程编排`).
4. **Simplified/traditional normalization**: when the user types simplified and the routing table is written traditional, you miss (e.g. `帮我写个脚本` misses,
   and `流程编排` became a new miss after I converted it to traditional). Add a 1794-character simplified→traditional mapping table,
   **normalize both sides when comparing**. The mapping table already excludes value collisions (one-to-many would cause false hits) and
   dangerous characters that are both simplified and traditional (茫／蒙／襁／谷 etc.).
5. **Feedback loop**: routing queries write into `scenes/_shared-memory/路由回饋.jsonl`;
   `--糾正` can specify the human's correct owner; **only when the human result differs from the machine hit is it recorded as a "抢单"**
   (identical results do not pollute the statistics); added `回饋 --明細` for viewing.

**Acceptance (measured)**:

| Item | Result |
|---|---|
| Regression test set hit rate | **67/67 = 100.0%** (baseline 82.9%), 0 unexpected mismatches |
| Ambiguous sentences (top-2 score gap < 20) | **0 sentences** (folded into the regression test; ambiguity ⇒ exit 1; and proven to catch them by "deliberately deleting the 投資簡報 compound word") |
| Simplified forms of 350 routing table keywords | All still hit the original owner (0 exceptions) |
| 280 representative words verified before the change | 275 still hit the original owner; the 5 exceptions are the deliberate generic-word removals, **no stolen words** |
| `工具/一致性稽核.mjs` | 99 of 99 pass |

> **The key lesson (same shape as gap 20)**: **measure first, then change**.
> Changing the routing table without a regression corpus set is equivalent to proving yourself right with "test sentences you just wrote yourself" —
> the old representative-word stealing check (275/280) is the half that actually prevents breaking other people's routes.
> Another lesson: **when changing keywords, think about the glyph form too**; a change like "流程編排 → 流程编排"
> creates a new miss all by itself.

### Gap 26: the accumulable-artifact routing criteria were not implemented ⇒ the dispatch demanded verbatim copies, the real machine grew dual writes 🟢 Fixed (2026-11-09)

**The original diagnosis (wrong, discarded)**: the original text wrote that "§5 and SKILL.md each add their own, verbatim identical" is a hard requirement,
which contradicts "one fact stored in one place"; the fix was "pick one as authoritative, the other becomes a pointer".

**Why the original diagnosis was wrong** (measured on 2026-11-09):

1. **The "verbatim identical" rule was never written in the spec** — the whole document mentions it only in this section.
   [4 · Dispatch and Receipt](../00-core-mechanisms/4-dispatch-and-receipt.md) §3.2 talks about **routing by the nature of the content**: "anything that will be used more than once, write it as an exclusive skill;
   anything used only once, write it into §5" — that is division of labour, not dual writing.
2. **"Pick one as authoritative" breaks the spec** — if §5 became the sole authority,
   then "practices that will be used more than once" all get crammed into the "append-only §5", while the exclusive skill (the container that actually gets reused)
   becomes a pointer — the spec's original "§5 is accumulation, the exclusive skill is distillation" is overturned.
3. **The cited evidence is outdated** — the original text cites 郵件處理's §5 "each adding five, verbatim identical";
   on 2026-11-09 the measurement shows that scene's §5 has 5 sections and SKILL.md has 11 — they have long since stopped being five-to-five symmetric.

**The real root cause (measured)**: **the routing criteria were never implemented**.

| Layer | Actual state |
|---|---|
| Spec §3.2 | Has routing criteria (practice → skill / fact → §5) |
| `verify-receipt.mjs` | Strings §5 and the skill **into the same haystack**; a hit in either place passes — it cannot tell which one it should have gone to |
| `派單.mjs 退回` | But writes "(**verbatim comparison**)" — the opposite of the verifier's own comment (do not compare verbatim) |
| The real machine | So the scene copies verbatim as the dispatch demanded ⇒ it is forced to copy the same passage twice |

★ **The dispatch sentence is the real cause**: `派單.mjs` is **the copy the scene will actually read** (the body of the dispatch that was sent out),
`verify-receipt.mjs` is only for acceptance. If the dispatch says copy it verbatim, it copies it verbatim.

**Measured evidence (2026-11-09)**: the 郵件處理 scene has **4 groups** of "accumulable artifact registration" passages
that are **verbatim identical after whitespace removal** in §5 and `email/SKILL.md` (1054 / 751 / 397 characters,
plus 1 group with 9/11 overlapping lines), while the headings **already write pointers** ("做法見 SKILL.md" / "事實見 §5")
— the pointer was written, but the body was not slimmed down.

**Fix**:
1. Change `派單.mjs 退回`'s "verbatim comparison" back to agreement with the verifier (≥ 8-character common substring), and note the routing criteria,
   explicitly saying "do not copy it into both places" (real machine commit `5c3dc521`).
2. The real machine's §5 and exclusive skill route per spec §3.2: **every bullet still exists, it is just no longer copied into both places**
   (郵件處理 scene commit `06ea982`).
3. The pointer sections are slimmed down into real pointers (only the single line "see X").

**Acceptance (measured)**:
- The union of the 99 bullets is identical before and after (**0 lost, 0 added**)
- 4 groups of verbatim duplication → **0 groups**
- 郵件處理's 13 real receipts: verification result **0 changes** (9 pass, 4 fail; the 4 failures are pre-existing format problems, not caused by this change)
- Scene memory `check --all`: all 24 scenes pass

> **Cross-scene references are out of scope for this gap**: 音效配樂's accumulable artifact is referenced by one copy in the speech-synthesis scene;
> the two scenes are **independent git repos** and their skills are invisible to each other; speech synthesis has no mechanism to read another scene's memory —
> that is within the scope of the "cross-scene readable shared area" mechanism gap (see gaps 23 / 24), not fixed here.

---

## 7. How to use this list

**When you fix one, change its status here**, and add:
- a summary of the fix
- the acceptance method (how you prove it is fixed)
- the date it was actually fixed

> **The value of this doc grows with time** —
> every entry fixed and every entry found brings it closer to "what this system really looks like".
> That is far more useful than a pretty-looking architecture diagram.

---

> ⬅️ **Back**: [Implementation README](README.md) ｜ **Previous**: [3 · Maintenance Manual](3-maintenance-manual.md) ｜ **Related**: [2 · Handover and Validation](2-handover-and-validation.md)

# 7 · Session Switch: a repeatable, self-checking atomic operation

> **A "session switch" must be a scene A, not a manual procedure people have to memorise.**
> Because if one place is missed (the old session was not really archived, the three places were not synced), the next session start does not line up —
> **and the symptoms are all identical** ("switch to this scene and the AI acts like a different person"), while the root causes differ.
>
> This doc turns it into: **preconditions → four steps → mechanical self-check**.

---

## 1. When you should switch

| Situation | Should you switch? |
|---|---|
| You see the context pressure hit the line (the percentage the tool reports, ⚠ and the like) | ❌ **No**. Hitting the line auto-compresses; the task can continue |
| After compression it **still** reports a hard error like "context limit exceeded / 413" | ✅ Yes (a real deadlock) |
| The user explicitly says "switch session / archive and start a new one" | ✅ Yes (the user decides) |
| It just "feels like the session got a bit long" | ❌ Don't — switching mid-way = throwing the unfinished work to the next session |
| The scene has changed topic | ✅ Yes (the old topic's context is interference for the new one) |

> **The criterion accepts only the pressure output that actually appeared in front of you.**
> Historical numbers in a handover doc or a summary belong to the session that wrote them; they cannot be used to judge the present.

> **"Hitting the line auto-compresses" is engine behaviour, not a guarantee of this methodology.**
> Re-test it when you switch engines — see task E of the [3 · Maintenance Manual](3-maintenance-manual.md).

---

## 2. The four steps

```
① Write the handover first        ← this step IS the handover, don't skip it
   Overwrite §0's "progress / next step / blocker"
   (If you can't write "next step" ⇒ this round was wasted)

② New session + archive the old one   ← engine side
   New session: same name, cwd = the scene directory
   Old session: renamed to "Archived · <original name> · <date>" + **really archived**

③ Sync three places                  ← ★ do this immediately after the engine side
   ① the sessionId in the scene config json
   ② the session id column in the identity index table
   ③ the handover signature in §0

④ Self-check                      ← run the tool
   node switch-session.mjs check --root <root> --scene <name> --new-session-id <id>
```

### 2.1 Step ①: the handover is a precondition, not an after-the-fact patch

**Memory lives in files, not in sessions.** A session switch without a handover = a broken memory thread.

| What you missed | Symptom |
|---|---|
| Switched without writing §0 | The new session opens blank; nobody knows where the last round got to |
| §0 written as a weekly report | It blows the 4 KB hard limit, and the new session still does not know the next step |

### 2.2 Step ②: "renaming ≠ archiving" (the easiest trap)

A trap found by measurement, where **the two results look identical but the mechanisms are completely different**:

| Rename only | Real archiving |
|---|---|
| The title becomes "Archived · X · date" | The title changed **＋ it disappeared from the list** |
| **It is still in the list**, and the user will click into it next time | It is not in the list any more |
| You thought it was archived; it was not | It really was archived |

**The engine has no `session/archive|delete|remove|trash` (all 404).**
Archiving ＝ **renaming ＋ `workspace/archiveSession`** (retry with `stopActivity` when there is activity).

> ★ **Archiving yourself only ever half-succeeds.**
> The engine refuses to archive a session that is "currently running" (it is running this very turn) ⇒ the result is only a name change.
> **The correct move is to archive it from another session / script.**
>
> This is also why a session switch must be a scene A rather than a manual procedure — **in a manual procedure the person is in that very session.**

#### The four measured engine-side conclusions (2026-11-03, DSH)

| Question | Measured result | Conclusion |
|---|---|---|
| After archiving, is the old session still in `session/list` | **Yes** | `archivedSessionIds` only affects the **UI sidebar**, not `session/list` |
| Can the old session be removed from the workspace's `sessionIds` | **No** (the engine puts it back) | That is correct — the old session does belong to that workspace, it is just archived |
| Does the new session have to be pinned | **Yes** | Not pinned ⇒ the panel cannot find it |
| **There are two ways to archive** | **① rename＋archive**／**② archive only** | See below |

> ★★ **There are two ways to archive; deciding "is it archived" must take the OR of both.**
>
> | Approach | Who does it | Characteristic |
> |---|---|---|
> | ① Rename to "Archived · X · date" ＋ `archiveSession` | The session-switch tool, this tool | The title carries the prefix |
> | ② **Only** `archiveSession`, no rename | The old cleanup tool | The title is unchanged; only the engine knows |
>
> Looking at only one of them misses cases: title only ⇒ you miss ②; `archivedSessionIds` only ⇒ **the list you read is stale**
> (the engine rewrites that file on every archive, and the tool reads it before the action).
>
> **Correct rule: the title prefix OR the archived list — either one holding means it is archived.**

#### Un-archiving

The engine has `workspace/unarchiveSession` (verified working) ⇒ a mis-archived session can be rescued.
But it returns the **entire** list ⇒ after the call you must re-verify the state of the other sessions.

> **★ "The old session is still in session/list" is not a bug.** The session is still on disk and still readable,
> it just no longer appears in the sidebar. **Archiving is not deleting** — that is exactly the property it should have.

### 2.3 Step ③: three places, not "two places plus a memo"

| # | Location | Who writes it |
|---|---|---|
| ① | The `sessionId` in the scene config (the panel json) | Engine side |
| ② | The session id column in the identity index table | Engine side |
| ③ | The handover signature in §0 | Human / tool |

> **The symptom of missing any one of them is identical** (switching scenes feels like a different person), **but the root cause differs** —
> **so check all three together; do not guess from the symptom which one you missed.**
> This is exactly why `switch-session.mjs check` exists.

**The format of the §0 handover signature** (written into `handover-rules.json`, never hardcoded in a script):

```
This handover was written by session <sessionId> on <date>
```

### 2.4 Step ④: the self-check is mechanical

```bash
node 03-executable-tools/switch-session.mjs plan --root <workbench-root> --scene <scene-name>
node 03-executable-tools/switch-session.mjs check --root <workbench-root> --scene <scene-name> --new-session-id <id>
```

`plan` = the preconditions (can we switch) ＋ printing the five steps the engine side has to do ＋ printing the three sync locations.
`check` = the mechanical acceptance after switching (the three agree ＋ `check` passes ＋ §0 is under the hard limit).

---

## 3. The tool

### 3.1 What `plan` blocks

| Check | Blocks if it fails? |
|---|---|
| The scene directory exists | ✅ Blocks |
| §0 has all five subsections | ✅ Blocks |
| §0 has a readable "next step" | ✅ Blocks |
| §0 is not already over the hard limit (switching means writing a signature, so it only gets bigger) | ✅ Blocks |
| The identity index card can be read | ⚠ Warns |
| The scene config's sessionId can be read | ⚠ Warns |

> ★ **"§0 has no next step" is a hard block.**
> Switching sessions means throwing the work away — **if you cannot write the next step, this round has not ended, so you should not switch.**
>
> ★ **"§0 will go over the hard limit after switching" is also a hard block.**
> Because switching writes a handover signature (a few dozen characters) ⇒ a §0 that is already at the line will blow the limit at the moment of the switch,
> and by then the new session already exists, so **you have to go back and redo it**.
> So it has to be blocked **before** the switch. Measured: scene D's §0 was originally 4068 B,
> and after the switch it became 4156 B ⇒ over the limit ⇒ you must first move the history into §5 and only then switch.

### 3.1b ★ "The three places agree" does not mean "the session is still alive"

Hit by measurement on 2026-11-03: **all three places agreed perfectly, but the panel pointed at a session the engine had already archived.**

| Symptom | The same as "one place out of sync"? |
|---|---|
| Switching scenes feels like a different person | **Exactly the same** |
| Root cause | **Not the same** — this time all three were right; that session itself was dead |

⇒ So you have to **check them separately**:
- The three places agree ⇒ the file layer (`switch-session.mjs check`)
- Is the session still alive? ⇒ the engine layer (the engine state file, see [Dispatch and Recovery Interface](../00-core-mechanisms/7-dispatch-and-recovery-interface.md))

`scene-memory.mjs check` reads the engine state file, so **an archived session ⇒ it blocks outright**.

### 3.2 What `check` blocks

| Check | Blocks if it fails? |
|---|---|
| §0 has all five subsections | ✅ Blocks |
| §0 has a next step | ✅ Blocks |
| All three places have a session id | ✅ Blocks |
| The three are **the same** id | ✅ Blocks |
| When `--new-session-id` is given, all three equal it | ✅ Blocks |
| §0 ≤ 4 KB | ✅ Blocks |
| `scene-memory.mjs check` passes | ✅ Blocks |
| The session bound to the panel **has already been archived by the engine** | ✅ Blocks (`scene-memory.mjs check` reads the engine state file) |

### 3.3 Why "missing one place" also counts as inconsistent

The **symptom of missing one sync is exactly the same as a wrong sync**.
So the check logic is: **all three must have a value, and it must be the same id** — not "the places that have a value just have to agree with each other".

---

## 4. Loose sessions (the ones with no scene panel)

A session that is not in the scene table has no "panel id" to fill in, but it still needs a handover.
The approach: **a temporary handover file ＋ the same scene A** (using the session name instead of the scene name).

> **Conclusion: a "session switch" is a repeatable, self-checking atomic operation**,
> no matter whether the session has a scene.

---

## 5. Fork, not create new

If it is just "this section is too long, but I want to keep the results from the first half", you can **fork from an earlier message**:
a fork only takes the history before the fork point — roughly "move the first half into a new session".

| | Switch session | Fork |
|---|---|---|
| How much history it takes | None at all | All of it before the fork point |
| Good for | Changing brains, changing topic | Half-done work, a full context |
| Same work either way | Write back to three places ＋ self-check | Write back to three places ＋ self-check |

> After a fork the **new session has a new id**, so the three places still have to be synced and still have to be self-checked.

---

## 6. When you really should "archive" to a file

Switching sessions ＝ swapping the **identity**; the old session's **full chat transcript** has a different destination —
that is the [6 · Archive Layer](6-archive-layer.md), not this doc.

```
Switching a session  ⇒  the old session leaves (archived engine-side)
           ＋ the full chat transcript lands in session-archive/ (done by the tool, see the archive layer)
```

> **Only doing both is complete.** Switching without filing away means the full chat transcript is only a black box inside the engine —
> and the engine will change version (measured: 23 of 30 sessions are already unreadable).

---

## 7. Common mistakes

| Symptom | Root cause | Fix |
|---|---|---|
| The old session was renamed but is still in the list | Renamed without really archiving | Run `workspace/archiveSession` from **another** session / script |
| Switching scenes feels like a different person | The three places were not synced | Run `switch-session.mjs check` and see which one it reports |
| The new session opens blank | Switched without writing §0 | Write §0 first, then switch |
| After the switch `check` is all red | The switch broke the memory file structure | `scene-memory.mjs handover` fills in the missing §0 subsections (only the missing ones) |
| Archiving yourself only half-succeeded | The engine refuses to archive a running session | Archive from outside |

---

> ⬅️ **Back**: [Implementation README](README.md) ｜ **Previous**: [6 · Archive Layer](6-archive-layer.md) ｜ **Related**: [3 · Scene Memory](../00-core-mechanisms/3-scene-memory.md) · [2 · Handover and Validation](2-handover-and-validation.md)

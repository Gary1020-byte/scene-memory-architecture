# Must Read for Beginners: This Is a **Method**, Not an Install Package

> In one sentence: **what is shared here is "one method + one tool". The tool runs directly, but whether it "can do work" depends on wiring it to your own content.**
>
> If you expect "download → double-click → one all-purpose AI workbench", **this repository will disappoint you**.
> Please spend 3 minutes reading this page before deciding whether to go on.

---

## Zero, first know what problem this method solves

> **Capability is not in the model, it is in the accumulation.** Intelligence is given by the model; skill is grown by you.

Mainstream multi-agent frameworks chain work through message passing; that is fine for one-off tasks.
But when the same kind of work has to be done repeatedly, two problems surface:

- **A sub-agent starts from zero every time** — it has no event history, only an editable role setting; change it and still no experience accumulates
- **Skills pile up into a mess** — because a skill is a global list, not the answer to a situation

What this method gives you is **a carrier that can be rewritten and version-controlled** (the scene),
plus the loop that makes it keep accumulating (dispatch → receipt → accumulable artifact → write back → next time).

> The full problem analysis is in [`00-core-mechanisms/1-accumulation.md`](00-core-mechanisms/1-accumulation.md).

---

## One, what works as-is, what you must tune yourself

| part | copy and use? | what you must do yourself |
|---|---|---|
| **The structure spec of scene memory** | ✅ the structure can be copied as-is | the content is **your** memory — an empty template will not grow memory by itself |
| **The tool** (`scene-memory.mjs`) | ✅ runs directly | point it at your workbench root; you build the scenes yourself and `git init` them yourself |
| **The workflow validator** (`verify-workflow.mjs`) | ✅ runs directly | the workflow definition has to go into `<workbench-root>/workflows/` |
| **The negative acceptance script** | ✅ runs directly | —— |
| **The templates** (memory file, locator card, dispatch format) | 🟡 the skeleton is usable | all of the content is yours |
| **Engine behaviour** (`.git` boundaries, dedicated skill mounting) | ❌ depends on your engine | your engine version must have this behaviour, otherwise these mechanisms cannot land |
| **The dispatch channel** (engine RPC) | ❌ varies by engine | the channel details (how to wake it up, how to collect the receipt) must be written for your engine |

**Conclusion**: read it as a **method + reference implementation**, not as an **install package**.

---

## Two, the six things you are most likely to trip on (knowing them in advance saves hours)

### 1. Forgot `git init` ⇒ the scene boundary fails

A scene directory **must** have its own `.git/`. Without it:
- The engine cannot find the project root ⇒ **none of this scene's dedicated skills get loaded**
- But **the scene constitution is still chain-loaded** ⇒ the symptom is not obvious
- It shows up as "this scene seems to have gotten dumber", "it does not know how to do this"

> The validation tool blocks this (`scene directory missing .git`), but you have to run `check` first to find out.

### 2. §0 written as a weekly report

The most common mistake. Written as "today I did 1, 2, 3, 4, 5 things, each with three paragraphs":
- Over the 4 KB hard limit
- And a new session still does **not know what to do next**

> **§0 answers exactly four questions**: who am I / where am I / what is next / where am I blocked.

### 3. No handover written before switching sessions

This is the first thing the whole methodology is trying to eliminate, but **it is the easiest to forget at the start**.
Symptom: the new session starts from scratch; you think the AI is stupid, but there was no handover.

### 4. Believing that "the check passed" means it is safe

Running only the happy path = no verification. **The validation tool must prove "it fails when it should fail"** —
so this repository ships with the [negative acceptance script](03-executable-tools/negative-acceptance.sh); run it once and you will know whether the tool really blocks.

### 5. Rules written in more than one place

Hard limits, index locations, paths… when the same value has two definitions, they will fork eventually.
And the **symptom is extremely unobvious** (the message went into the old board, the recipient never got it, but nothing looks wrong).
→ See [known gap #3](02-implementation/4-known-gaps-and-todo.md).

### 6. The receipt only says "all normal"

The second most common mistake. A receipt is not a report, it is a **delivery** —
all three parts are mandatory: **Diff Set · Accumulable Artifact · Next Handoff**.

Especially the **accumulable artifact**: writing "all went well" or just pasting numbers means this job was wasted.
Because **the learning did not stay behind, next time still starts from zero**.

> ⚠️ Currently **no tool blocks this** (see [known gap #13](02-implementation/4-known-gaps-and-todo.md)).
> You have to remember this hard limit yourself.

---

## Three, who it suits / who it does not

**Suits**:
- people willing to change their own setup, who can read markdown and a bit of shell
- people used to thinking in terms of the file system (rather than "just say a sentence to it")
- people who treat "debugging" as a normal part of the flow
- people already using multiple AI agents and troubled by "they interfere with each other"

**Does not suit**:
- people who want a one-click install package
- people who do not want to touch the file structure
- people who expect "the AI will handle everything" (the AI can help you change things, but **you have to describe your environment first**)

---

## Four, the suggested order of adoption (every step has a visible acceptance criterion)

| step | what to do | acceptance criterion (**only a visible one counts as passed**) |
|---|---|---|
| 0 | read this page + [`overview.md`](overview.md) | you can say in your own words why "**capability is not in the model, it is in the accumulation**" matters |
| 1 | run the tool's self-acceptance | `bash negative-acceptance.sh` shows **15 passed, 0 failed** |
| 2 | run the demo-workbench | `node scene-memory.mjs list --root 04-templates/demo-workbench` produces output |
| 3 | build **your own** scene (`git init` + copy templates + edit the locator card) | `check` all green, exit code 0 |
| 4 | write the first §0 | not much content, but **all four questions have answers** |
| 5 | switch sessions once, **writing the handover first** | the new session picks up without re-explaining |
| 6 | add a second scene | the two scenes' memories **do not interfere** (run the isolation check once) |
| 7 | only then dispatch and collect receipts | the dispatch you sent **comes back with a receipt**, and the receipt **carries an accumulable artifact** |
| 8 | dispatch a different job and see | this time **it really is faster than last time** (because §0 and `§5` have accumulated) |
| 9 | once you have three or more scenes chained into one line | only then write the [workflow](04-templates/workflow-template.md) and get `verify-workflow.mjs` to pass |

> **Step 8 is the real acceptance of this method.** The first seven steps only prove "the mechanism runs";
> step 8 proves "accumulation really happened" — if the second time is exactly as fast as the first,
> then your accumulable artifact never landed.

> The order is not arbitrary: **each step is the premise of the next**.
> Skipping a step usually ends with "everything is off, but I do not know where to start looking".

---

## Five, three pieces of mindset advice

- **Understanding "why it is done this way" matters more than copying the code**
  Every design here exists to fix one specific incident.
  Copy the code but change the premise, and the incident comes right back.
- **Connect one piece at a time**
  Turning on multiple scenes + dispatch + tools at once means you cannot tell whose fault a problem is.
- **When something breaks, first ask "where is the acceptance criterion"**
  A change with no observable landing point (did the timestamp move, the log, the screen) is a change that did not happen.

---

## Six, ⚠️ this document will get stale

This method grew out of **real use**, so it:
- has known gaps ([the list is here](02-implementation/4-known-gaps-and-todo.md), some are not fixed yet)
- has designs that were trade-offs at the time and may change later

> **When you change the architecture, please update this document and record an entry in [`changelog.md`](changelog.md).**
> A methodology that does not record its changes becomes a lie after six months.

---

⬅️ **Back**: [README](README.md) ｜ **Next**: [Overview](overview.md) or [Core mechanisms](00-core-mechanisms/)

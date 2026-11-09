# 2 · Workflow Map

> **This piece answers a very practical question: which workflows do I have to build? Which scenes does each one need?**
>
> The criteria and the spec are in [5 · Workflow](../00-core-mechanisms/5-workflow.md); this is **the concrete list and the priority order**.
> Engine-neutral; the engine-side implementation record lives at `<workbench-root>/`.

---

## One, the criteria: what counts as "one workflow", what counts as "one scene"

| | Scene | Workflow |
|---|---|---|
| Identity | **Long-term identity** | **The choreography of a scene** |
| Boundary decided by | **Responsibility** | The deliverable |
| Lifetime | Always there | Each run is a new run |
| Criterion | This kind of work **comes back repeatedly**, and every time it uses the same set of files, the same set of rules, the same domain knowledge | There is **something transferable** between two or more scenes |

> ★ **The difference between a scene and a piece of work**: a scene exists long-term; a piece of work has a clear end point.
> **Project memory goes under the scene** —— when the project ends, the scene stays.

---

## Two, the five workflows we have right now

### A · Material → slides／report page → narration script → MP4 → acceptance ✅ Built

| | |
|---|---|
| Scenes | `scene F`（`sc-f`）、`scene G`（`sc-g`） |
| Workflow definition | `workflows/slides-to-video.yaml` |
| Spec | [8 · Content to Shot Spec](../02-implementation/8-content-to-shot-spec.md) |
| Measured case | `ai-agents-report`（2026-10-27, 4:30, Chinese voiceover + subtitles, −16 LUFS） |
| Status | Scenes built, workflow defined, spec checked against a measured run once (v1.3) |

**The key insight of this chain (from the measurement)**:

> **The video is not converted out of the report HTML.** The two lines share **material** (`content.md`) and **design tokens**,
> **they do not convert into each other** —— converting loses things (the report page's tables do not fit in 1080p, the video's rhythm does not work on a single page).

### B · Course study 🟡 The shared prerequisite is built

| Scene | Status | Explanation |
|---|---|---|
| `exam-bank`（past-exam question bank） | ✅ Built | **Shared across courses**: scope → question-type map → question bank → formula flashcards → question-by-question review |
| Per-course scenes (subjects A～E) | 🔜 To build | One scene per course (that course's domain memory, progress, past exam questions) |

> ★ **Each course maps to one teaching skill, and that skill is itself the prototype of the scene.**
> One course ＝ one scene (that course's domain memory, past exam questions, formula table, question-type map).

**Why the "past-exam question bank" is pulled out as one shared cross-course scene**: past exam questions are work that is **cross-course but follows the same set of rules**
(scope → map → bank → review). Putting them in each course's scene makes every course do its own thing, and the map format stops being consistent.

**To do**: migrate the progress files from the vault into the scenes' `project-memory/`,
and let each scene's §5 collect the "question-type map" (which questions are not done, which chapters are not on the exam this term).

> ★ The exam scope **has to be re-checked**, do not reuse the old notes —— a cancelled class (typhoon day) pushes the course order back.
> Measured: the old data-structures notes listed Hash Tables as pre-exam, but it was actually pushed to 11/13 → out of scope.

### C · Daily input → vocabulary → review 🟡 The scene already exists

| | |
|---|---|
| Scene | `English learning`（**already exists**） |
| Tools | `English input` skill（grabs an article at 07:05 every day → pushes → reports → writes into the vault）、`English speaking` skill |
| To add | The scene memory has to collect the "low-friction action"（read 3 sentences ＋ write down 1 word）、the trigger timing、the vocabulary writing rules |

### D · Daily digest → push ✅ Built

| | |
|---|---|
| Scene | `daily-digest`（daily briefing）✅ |
| Tools | `productivity/scheduled-digest-pipeline` skill、`daily-brief-bot`（public repo）、digest dashboard（khroma four colours）、Hermes cron（4 related entries） |
| Criterion | **It has its own set of rules（layout, colours, push timing, source list）**, so it becomes a scene of its own —— not a project of A's `slide design` |

**Two hard limits**: ① The output is always **plain text**（the mailbox does not render markdown）; ② **A failed schedule has to be reported**, do not skip it silently.

### E · Product release (repo audit → public) ✅ Built

| | |
|---|---|
| Scene | `release`（product release）✅ |
| Tools | `public-repo-hygiene` skill、`software-development/github-project-development` skill（eight-stage methodology） |
| To do | The methodology is already in the repo; the scene has turned the "audit checklist" into accumulable memory. **What is left**: turn the checklist into a re-runnable script |

**★ The most important sentence on this chain**: **after a force-push, the old commits and old blobs can still be read through the
GitHub API.** "Already force-pushed" ≠ "already irreversibly removed" —— irreversible removal needs GitHub Support
to clear the cache, or deleting and recreating the repo (irreversible, ask the machine owner first).

### F · Observation (making the transmission mechanism visible) ✅ Built

| | |
|---|---|
| Scene | `orchestrator`（`master`）✅ |
| Interface | `dsh-scene-workbench`（public repo）—— a native Cordis client plugin for DSH, the two tabs on the right sidebar |
| What this chain produces | The 3D memory-neuron overview: nodes ＝ scenes／private memory／shared documents, **edges ＝ the actual flow of cross-scene dispatches and receipts** |
| Boundary | **The orchestrator is an observation post, not a second router** —— the routing itself is in the repo's `路由.mjs` ＋ `路由表.json` |

> The retired "command" scene is a **dark node** in the 3D diagram: it sent 19 / received 15, it was the biggest initiator in the history.
> Hiding it is the same as deleting the story of "how the mechanism grew".

---

## Three, priority order

| Priority | Workflow | Status | Why |
|---|---|---|---|
| **1** | **A slides → video** | ✅ Built | You yourself said it matters most; the seam of the chain is the clearest (the material is the shared language); it has been checked against a measured run |
| 2 | **B course study** | 🟡 Shared prerequisite built | The prototype of the per-course scenes already exists (the skill is the embryo), but **the progress files are scattered in the vault** and have to be migrated first |
| 3 | **C daily input** | 🟡 Scene already exists | cron is already running, the only thing missing is turning it into a scene ＋ receipt |
| 4 | **D daily digest** | ✅ Built | The layout and push timing follow their own rules, so it becomes a scene of its own |
| 5 | **E product release** | ✅ Built | The methodology is already in the repo; the scene turns the audit checklist into accumulable memory |
| 6 | **F observation (3D overview)** | ✅ Built | It makes the transmission mechanism visible; the routing itself is still in the repo |

---

## Four, the three questions to ask before opening a scene

| # | Question | Why |
|---|---|---|
| 1 | Will this thing **come back repeatedly**? | One-off tasks should not open a scene (work that runs once and ends only adds maintenance burden) |
| 2 | Does it use the **same set of files, the same set of rules**? | Only the same set of rules is worth accumulating into memory; otherwise it is just another directory |
| 3 | Where is its **responsibility boundary** against the existing scenes? | An unclear boundary ⇒ two scenes end up editing each other's memory, and finally nobody trusts any of it |

> ★ **Question 3 is the easiest one to trip over.** A's two lines share material, but they **do not convert into each other** ——
> if that was not thought through at the start, it grows into "one scene handles everything",
> and then the scene memory holds two different things and nobody can read it.

---

## Five, what to verify after each workflow is built

| # | Acceptance | Tool |
|---|---|---|
| 1 | The scene is registered consistently everywhere | `一致性稽核.mjs` |
| 2 | The scene check is all green | `scene-memory.mjs check --all` |
| 3 | The workflow definition passes validation | `verify-workflow.mjs` |
| 4 | **The chain really runs, and it runs meaningful work** | `鏈式呼叫.mjs --task` |
| 5 | **Every hop has its accumulable artifact on disk** | Look in the scene's `project-memory/` |

> ★ **Items 4 and 5 are the evidence that "the work is meaningful".**
> The first three are all green but item 4 only replies "no operation started" ——
> that is called **spinning**, not running.

---

> ⬅️ **Back**: [Architecture Overview README](README.md) ｜ **Related**: [5 · Workflow](../00-core-mechanisms/5-workflow.md) · [8 · Content to Shot Spec](../02-implementation/8-content-to-shot-spec.md) · [5 · New Scene Spec](../02-implementation/5-new-scene-spec.md)

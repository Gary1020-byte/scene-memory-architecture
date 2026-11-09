# 3 · Scene Memory vs Semantic Memory

> **One-line positioning**: this doc is the **selection view** of [6-two-memory-systems.md](../00-core-mechanisms/6-two-memory-systems.md) —
> that doc explains "they are two different layers"; this doc explains "**faced with a concrete requirement, which side do you put it on, and how do you stop the two sides from bleeding into each other**".
>
> 📌 **Measurement note**: all semantic-layer numbers in this doc are **locally measured values** (Hindsight semantic memory service, local Docker deployment),
> measured **2026-10-31 / 2026-11-01**. Scene memory layer numbers are locally measured workbench values.

---

## 1. Positioning of the two layers (one line each)

| | Scene memory | Semantic memory |
|---|---|---|
| **Metaphor** | **ledger** | **wiki** |
| **Question it answers** | where **now**, who owes what | what was learned **before**, how it was solved last time |
| **Form** | one handover file ≤ 4 KB (§0) + project memory + the shared layer's five boards | tens of thousands of fact nodes (measured: a single bank has **14 489** fact nodes) |
| **Who writes** | humans + tools, actively | the machine auto-extracts every N turns |
| **Coverage** | **narrow** — only what you actively write in | **broad** — everything ever discussed gets in, without relying on discipline |
| **Recall timing** | read §0 first, **precise and with zero network requests** | prefetch every turn (measured ceiling **2 048 tokens**) |
| **Isolation** | **strong**: each scene is an independent git repo; the model cannot see other scenes | **weak**: by default multiple profiles share one store |
| **Auditable** | `git log` all there, diffable, blameable | the extraction result itself is **not diffable** (you need server-side logs to infer) |
| **Failure mode** | handover not written → the next person misses a step | extraction wrong → the error **stays in memory long-term** and is later recalled as fact |
| **Cost** | zero network requests | every extraction burns tokens (measured: a single retain queues for about **18.8 s** of wall clock) |
| **Can a human save the day** | **yes**: Markdown, human-readable and human-editable | **harder**: you have to write a separate correction document to override it |

> **One-line summary**:
> **Keep only the ledger and the agent does not get smarter; keep only the wiki and you forget who was halfway through yesterday's job.**

---

## 2. Measured numbers for the semantic layer: failure rate and its shape

The biggest risk in the semantic layer is that **failure is silent**. So the failure rate must be an observable number, not "should be rare".

### 2.1 Failure rate (measured value, snapshot 2026-10-31 09:27 UTC)

| metric | value | basis |
|---|---|---|
| **Overall failure rate** | **about 0.89 %** | 22 failures ÷ 2 465 total operations (failed ÷ total) |
| Failures ÷ successes | 0.90 % | 22 ÷ 2 443 (completed) |
| **Extraction-type operations only** | **1.30 %** | 22 ÷ 1 692 (retain + batch_retain, excluding consolidation) |
| Consolidation-type only | **0 %** | 0 ÷ 804 |
| Measurement snapshot | 2026-10-31 09:27 (UTC) | at that moment completed = 2 443, failed = 22, total 2 465 |

> ⚠️ **This is a snapshot value, not a constant.** As the service accumulates operations the denominator changes; the 2026-11-01 re-measurement gives
> completed = 2 482, failed = 22, total 2 504 ⇒ overall failure rate **0.879 %** (failure count unchanged, denominator changed).
> **Always cite the measurement time**, otherwise readers two months from now will think the number is wrong.

> ⚠️ **State the basis clearly**: 0.89 % is the failure rate over **all operations** (both extraction and consolidation).
> If you look at **extraction alone** (retain + batch_retain), the failure rate is **1.30 %**, higher than the overall basis.
> When citing this number, cite the basis with it, otherwise you will understate it.

> **This 0.89 % looks small, but look at how it is distributed** — that is the point.

### 2.2 Failures are not random, they come in **clusters** (measured)

| observation | data | meaning |
|---|---|---|
| Failures concentrate in a few days | the 22 failures are spread across **5 days**: 10-17 (10), 10-18 (2), 10-28 (4), 10-29 (4), 10-30 (2); the other 16 days had **zero failures** | failures are **event-driven**, not daily |
| The 22 failures are really **11 real failures** | every failure records one `retain` and one `batch_retain` (parent/child, same event) | **do not read 22 as 22 separate incidents** |
| Very few documents affected | **5** documents have a `document_id`; plus 6 early failures (10-17 / 10-18) with no `document_id` | failures cluster in a few files, not systemic |
| The main failure cause is **upstream rate limiting**, not broken extraction logic | of the 22, **18 are HTTP 429** (`Token Plan usage limit reached`), **4 are TimeoutError** | extraction failure ≠ wrong content; mostly **no quota, no response** |
| Failures **retry 3 times** before giving up | of the 22, 11 have `retry_count = 3` and 11 have `retry_count = 0` | there is a retry mechanism, but it still gives up afterwards |
| The scale of each failure is small | every failure message is `1/1 chunks failed` — **each failure event loses exactly 1 chunk** | the loss is local, not the whole document missing |

### 2.3 What this number means for decisions

> **A 0.89 % failure rate is not by itself a reason to "not use semantic memory".**
> The reason is the **shape of the failure**:
>
> - Failures come in **clusters** ⇒ your real failure rate is not 0.89 %, it is "**0 % normally, 40 % on some random day**".
> - Failures are **silent** ⇒ on that 40 % day you thought you had memory, and you did not.
> - Failures are caused by **upstream quota** ⇒ they have nothing to do with how well you write, and you **cannot control them**.
> - What failures leave behind is **blank space** (content that should have been extracted never entered the store), but the bigger risk is **wrong content that got in** —
>   that class does not even count in the failure rate, because it "succeeded".
>
> ⇒ **Judging whether the semantic layer is healthy cannot be done from the failure rate alone; it depends on "is there an observable failure rate at all".**
> The number must be pullable on a schedule and visible to a human (a feasible approach, measured: the semantic service exposes two fields, `failed_operations` and `operations_by_status`, directly queryable).

---

## 3. How to cure cross-talk: three levels

"Cross-talk" = a domain fact written by scene A also comes out when scene B recalls.
Three levels, **from strongest to weakest** (most thorough isolation, mildest override), **but not a choose-one — they are three separate switches**.
**If you can stop at level ①, do not go further.**

### Level ①　bank isolation — the path is the boundary

| item | content |
|---|---|
| **Approach** | different scenes use **different banks**; `mapPathToBank` maps each scene path explicitly to its own bank (longest prefix wins) |
| **Example config** | see the `mapPathToBank` snippet below |
| **Effect** | clean isolation: what scene A writes, scene B **cannot recall** |
| **Cost** | you lose cross-scene recall (to share across scenes, give the shared layer its own dedicated bank) |
| **Local reality (2026-11-01)** | the semantic service has **only 2 banks in practice** (both general purpose, not scene-specific); there are **no** per-scene banks; a shared-layer bank like `wb-shared` **does not exist currently** (the query returns `not found`) |

```jsonc
// config template snippet (shape, not the local reality)
"mapPathToBank": {
  "<workbench-root>/scenes/<scene-a>":   "coding-agent::<scene-a>",   // ← one bank per scene
  "<workbench-root>/scenes/<scene-b>":   "coding-agent::<scene-b>",
  "<workbench-root>/scenes/<scene-c>":   "coding-agent::<scene-c>",
  "<workbench-root>/scenes/_shared-memory": "wb-shared"               // ← fixed landing spot for cross-scene recall facts
}
```

### Level ②　source tagging — remember "which scene this fact came from"

| item | content |
|---|---|
| **Approach** | when sharing one bank, **record the source at retain time**: `source = <scene-name>` (in implementation, a source tag like `retainTags`), so recall can filter by source |
| **Effect** | keeps cross-scene recall capability while making it clear **which scene** a recalled item came from — no cross-talk, only **disambiguation** |
| **Prerequisite (important)** | **the filter mechanism must actually exist**. Tagging a source that cannot be filtered is the same as not tagging |
| **Cost** | you must force the source to be written in the retain flow; a record missing the source field becomes a "sourceless fact" and must be identifiable at recall time |

> ⚠️ **Source tagging vs isolation**:
> Tagging is "know the source but do not block"; isolation is "cannot see it at all".
> **Need cross-scene experience shared → tag; do not need it → isolate.**
> Do not use tagging to pretend it is isolation — tagging only makes things **identifiable**, not **unrecallable**.

### Level ③　override — the scene layer can override the global injection config

| item | content |
|---|---|
| **Approach** | the global layer sets **defaults**; the scene layer can **override** what is injected globally (e.g. do not recall a given bank in this scene, do not enable a given tool, add this scene's filter conditions at recall time) |
| **Effect** | achieves **local isolation** without touching global config; changing global config affects every scene |
| **This is a native pattern of this architecture** | the two constitutions are layered exactly this way: global `AGENTS.md` (injected every turn) + scene `AGENTS.md` (only inside that scene's tree) |
| **Prerequisite** | an override must be **explicitly declared** (not "override happens if unmentioned") — otherwise nobody knows a scene's behaviour was changed |
| **Cost** | too many overrides cause **drift**: the global layer changes, the scene layer does not follow, and behaviour differs (⇒ overrides must be visible to `check`) |

### 3.1 How to choose between the three levels

| your situation | stop at which level | reason |
|---|---|---|
| Scenes **should not** see each other's domain facts | **① isolation** | least effort, most thorough. Without a filter mechanism, ① is the only safe choice |
| Scenes **occasionally** need to share experience, and the sharing is public | **① + ②** | give the shared layer a dedicated bank; keep everything else isolated |
| You already share one store and cannot split it soon | **② first** | tag sources so "origin" is identifiable, then schedule the split |
| A scene has special needs (does not recall global defaults) | **③** | override is the exception channel, not the default path |

> **A half-done split is the worst state**: the store is split, but the config was not switched and the content was not moved,
> so the result is "thought it was isolated, but it was not" — **worse than not doing it, because it makes you stop being alert**.

### 3.2 Three early signs of cross-talk (you can check these yourself)

| sign | likely cause | how to check |
|---|---|---|
| Scene A's proper nouns appear in scene B's recall results | level ② was not done, or the filter did not take effect | sample 5 recall results at random and check for cross-scene proper nouns |
| "Thought it was isolated, but it was not" | level ① only did the config, no content moved | check whether the actual number of banks matches the number of banks that hold content |
| Behaviour after an override does not match expectations | the level ③ override was not declared, or the global layer changed and the scene did not follow | overrides must go into `check`; humans cannot be relied on to remember |

---

## 4. Requirement → which kind of memory (selection table)

| requirement | pick | why | what it looks like when misfiled |
|---|---|---|---|
| After a session switch, know "where we are" | **Scene memory** | this is **state**, it must be precise, there must be exactly one answer | stuffed into semantic memory → recall is similarity-based, and you get "I think we mentioned it last time…" |
| Know "what to do next" | **Scene memory** | this is an **instruction**, it cannot be ambiguous | stuffed into semantic memory → recall ranking puts it in 5th place |
| Know "what is blocked and who owes what" | **Scene memory** | this is a **todo**, it has an owner and a due date | stuffed into semantic memory → nobody will ever look at it |
| Judge "is this task actually done" | **Scene memory** | you need a **verifiable landing point** (file, number, diff) | stuffed into semantic memory → the model says "it looks complete" |
| Will two agents step on each other's memory | **Scene memory** | you need **physical isolation** (independent git repos) + sovereignty rules | relying only on semantic-layer tagging → the recall layer is not the write layer |
| Audit "who broke the memory and when" | **Scene memory** | `git log` + `git blame` | the semantic layer has no diff capability |
| A human must take over and still be able to edit | **Scene memory** | Markdown, human-readable and human-editable | the semantic layer needs a correction document to override |
| Six months later, same class of question, you cannot remember how it was solved | **Semantic memory** | this is **experience**, it must accumulate across sessions automatically | keeping only scene memory → the agent does not get smarter |
| "How was that last bug solved" | **Semantic memory** | the semantic layer recalls across scenes and sessions | scene memory coverage is narrow; six months later that file may have been archived |
| You do not want to hand-write a handover every time, it feels tedious | **Semantic memory** (but **state still has to be written**) | broad coverage, zero discipline required | ⚠️ this is the cell most likely to fool yourself: state still requires scene memory |
| You want to know "why does this agent answer that way" | **Both** | the scene layer gives the **current rules**, the semantic layer gives the **past experience** | keeping only one layer leaves half the answer missing |
| You want the agent to get better with use | **Semantic memory** (+ scene memory as the floor) | accumulating experience is the semantic layer's gift | throwing progress in too → recall produces noise |
| Sharing "how we did it before" across scenes | **Semantic memory** (+ the shared-layer bank of level ①) | you need "findable", not "openable" | recording experience on the shared-layer board → a board is newest-first, not a knowledge base |

---

## 5. The most common misuse: putting "progress / next step / blocker" into semantic memory

> **This is the one mistake this doc most wants to kill.**

### 5.1 Symptoms

| should be | actually put into semantic memory |
|---|---|
| §0 subsection 2 "Current Projects" table | "this project is 60 % done" |
| §0 subsection 4 "Next Steps / Blockers" | "next we should go handle that receipt problem" |
| shared-layer todo board | "someone still owes a disk health check" |

### 5.2 Why it is guaranteed to break (mechanism-level reasons)

| reason | explanation |
|---|---|
| **Recall relies on similarity, not on "this is the newest"** | the semantic layer has no "newest first" ordering guarantee. The "next step" you wrote may compete with a similar passage from three months ago, and **the ranking is not under your control** |
| **No single answer** | the scene layer's §0 has **exactly one** copy (overwritten in place). The semantic layer has **hundreds** of semantically similar sentences, all of which are "true" — the model must pick one, and if it picks wrong it acts wrong |
| **Cannot fail-closed** | the scene layer can block mechanically (missing §0 subsection ⇒ `check` errors ⇒ no session switch allowed). The semantic layer has **no "missing means you may not start work" gate** |
| **Extraction failures leave holes** | measured failure rate is about **0.89 %** (see §2.1), and it happens **in clusters**. On that day the "next step" was not extracted → at recall time that slot is empty → **the model does not know that it does not know** |
| **Errors become facts** | an incorrectly extracted "next step" is not a failure, it is a **success**. It stays in memory long-term, gets recalled, and is treated as current fact |
| **Humans cannot edit it** | the scene layer is Markdown, a human fixes it in five seconds. The semantic layer needs a correction document to override |

### 5.3 So what do you do

| approach | right? |
|---|---|
| Write "progress / next step / blocker" into **§0 subsection 4** (≤ 4 KB hard limit, measured) | ✅ |
| At the same time, sink **conclusions and reusable practices** into **project memory** (≤ 8 KB) and the **semantic layer** | ✅ |
| Write "next step" only in the semantic layer, nothing in the scene layer | ❌ recall ranking is not under your control, and there is no fail-closed |
| Write "next step" on the shared-layer todo board and **also** write "next step: see row N of the todo board" in §0 subsection 4 | ✅ pointer pattern — avoids two definitions of the same thing |

> **The criterion in one line**:
> **"Does this thing need a single, newest answer?"**
> Yes ⇒ scene memory. No (several answers are fine, being findable is enough) ⇒ semantic memory.

---

## 6. How the two layers combine (division of labour, not either/or)

```
┌─ Scene memory ＝ source of truth ─────────────────────────────┐
│  handover, acceptance criteria, landing points, audit — all in files │
│  who may write: only this scene; whose memory you change is yours to change │
└──────────────────────────────────────────────────┘
              ↕ only summaries go out, nothing is written back
┌─ Semantic memory ＝ recall layer ──────────────────────────┐
│  makes cross-scene, cross-session things "findable"          │
│  rather than "found by digging through files"                │
└──────────────────────────────────────────────────┘
```

| rule | what breaks when you break it |
|---|---|
| **State separated, experience shared and source-tagged** | sharing one store without tagging the source ⇒ cross-scene cross-talk |
| **The semantic layer only reads summaries, never writes state back** | writing state back ⇒ two sources of truth for state ⇒ split |
| **Extraction failures must be visible** | silent failure ⇒ errors stay in memory long-term and are later recalled as fact |
| **The semantic layer is an index, not the substrate** | content that exists only in the semantic layer and was never persisted is always treated as an **unverified lead**; when files and the semantic layer conflict, **the files win** |

> The last rule has a concrete local counterpart: the semantic service's locally measured bank data and the scene files are **two separate things**,
> and the scene files are the source of truth. **An index may be wrong; the source of truth may not.**

---

## 7. Neither side is perfect (honest list)

| layer | known problem | status |
|---|---|---|
| Scene memory | no automatic routing ("who should do this job" relies on model judgement) | 🟡 fix known, work not started |
| Scene memory | the receipt has no timeout detection ("nobody picked it up" goes unnoticed) | 🟡 fix known, work not started |
| Scene memory | the memory root path can split (board splits, messages silently dropped) | 🔴 unfixed |
| Scene memory | a missing `.git` degrades silently (symptoms are not obvious) | 🔴 unfixed |
| Scene memory | no native dispatch / receipt (relies on messages + manual confirmation) | 🟡 fix known, work not started |
| Semantic memory | extraction failures happen **in clusters** (measured 0.89 %, concentrated in 5 days) | ⚠️ accepted by design |
| Semantic memory | wrong extraction pollutes long-term and, having "succeeded", **does not count toward the failure rate** | ⚠️ accepted by design |
| Semantic memory | the tool layer **cannot read across banks** (none of the 8 tools take a bank parameter), so cross-scene recall requires calling the REST API yourself | ⚠️ known limitation |
| Between the layers | the semantic layer writes state back | ⛔ forbidden by rule |

> **Selection is not picking the one without holes, it is picking the one where the hole you care about is not.**

---

## 8. Remember it in one line

> **Scene memory is the ledger, it answers "now"; semantic memory is the wiki, it answers "before".**
> **Want "unique, precise, auditable, human-handover-able" ⇒ ledger; want "findable, accumulating, cross-session" ⇒ wiki.**
> **With unclear division of labour, the two together are messier than either alone.**

---

> ➡️ **Next**: [4-selection-criteria.md](4-selection-criteria.md) (should you adopt this method? how far?)
> ⬅️ **Back**: [Comparisons and Selection README](README.md) ｜ **Related**: [6-two-memory-systems.md](../00-core-mechanisms/6-two-memory-systems.md) (mechanism side) · [2-comparison-with-a2a.md](2-comparison-with-a2a.md)

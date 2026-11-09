# 8 · Cross-Scene Dispatch (mailbox and routing)

> **This piece fills in the segment that [4 · Dispatch and Receipt] and [7 · Dispatch and Recovery Interface] did not cover:**
> workflow-driven dispatch already has a contract (a dispatch is a file, the engine is the courier),
> but **when a scene on its own decides it needs help** —— where does it write, and who delivers it ——
> that path had no contract.

---

## Zero, why this piece exists

Measured (2026-11-03, DSH workbench, 10 scenes):

| Measurement | Number |
|---|---|
| Total cross-scene notifications | 71 |
| **With an explicit initiator** | **29** |
| Without an initiator (only "who it was sent to") | **42** |
| Of the 29 with an initiator, the initiator was the **same** scene | **19 (the command scene)** |
| After the command scene was retired, transmissions with an explicit initiator | **0** |

**Conclusion**: the command scene was not just a router, it was also **the only spontaneous transmitter**.
After it was retired, transmission between scenes degraded from "scene to scene" into "human (Hermes) to scene" ——
every single message needed somebody to knock on the door before it got handled.

And the messages themselves have no initiator: `發消息.mjs` does not even have a `--from` argument,
so out of 42 records there is no way to tell who said what.

---

## One, the five links of the chain

```
  Scene A ─①produce dispatch→ routing table ─②write to disk + double write→ mailbox ─③wake→ Scene B's resident session
                                                      │
        ⑤landing acceptance ← ④collect receipt + normalize ←──────────────┘
```

| # | Link | Spec | Status (2026-11-03) |
|---|---|---|---|
| ① | Produce the dispatch (four-part set) | [7] §1.2 | ✅ |
| ② | Routing (who it should go to) | **this piece §Two** | ✅ (new) |
| ③ | Write to disk ＋ double write ＋ wake | [4] §4 | ✅ |
| ④ | Collect the receipt ＋ landing acceptance | [7] §2, [4] §7 | ✅ (this piece adds the "spontaneous" leg) |
| ⑤ | Must be able to send back a failure | **this piece §Four** | ✅ (new) |

**★ Miss any one link and the whole chain is "a scene writing a note on the wall".**

---

## Two, routing: mechanical first, semantic as backup

### 2.1 The routing table lives in the shared layer

`scenes/_shared-memory/路由表.json` (the engine-side file keeps its own naming):

```json
{
  "version": 1,
  "路由": [
    { "項目": ["簡報", "報告頁", "deck"], "owner": "簡報設計" },
    { "項目": ["影片", "剪輯", "mp4", "旁白"], "owner": "影片剪輯" }
  ]
}
```

### 2.2 The matching rules

1. **Mechanical first**: match the dispatch's "What ＋ Criteria" against the keywords, **longer keywords win** (so "editing" does not shadow "video editing").
2. **If nothing hits, hand it to the model** —— the engine side signals "no mechanical hit" with **exit code 3**,
   **do not guess an owner yourself**. This is the fix for the failure mode listed in [4] §8 ("dispatched to the wrong scene ｜ no routing table, relying on judgement in the moment").

> ★ The routing table **must be synced whenever a scene is added** —— if the routing table is missing one entry, that kind of work gets judged as "hand it to the model".

### 2.3 The routing table is not the router

**The routing table only answers "who should take this work", not "how this work should be done".**
The latter is the owner scene's responsibility. The moment the routing layer starts doing the work, the boundary blurs (see [4] §6).

---

## Three, spontaneous dispatch: the mailbox

### 3.1 Why there has to be a mailbox

Workflow-driven dispatch has a landing point (`runs/<run-id>/receipts/dispatch-<n>.md`),
but **a scene's spontaneous dispatch has no run** —— it is not a step of any workflow.

⇒ Spontaneous dispatch lands in the **shared layer's mailbox**: `scenes/_shared-memory/派單/<收件場景>/<派單id>.md`.

### 3.2 The double write (channel B)

When a dispatch is produced it is written to **two places at the same time**:

| Where it is written | Why |
|---|---|
| The shared layer's `_跨場景通知.md` | It leaves a trail. Everybody can see it. |
| The receiving scene's `## 0 - Notifications` | **The recipient can see it themselves.** |

> ★ [4] §6, third rule: "**written ≠ effective**, effective requires an observable landing point."
> Writing only to the board and not into the other side's memory file is exactly "the message was written into the old board and the recipient's memory file never received it" ——
> that is how the real incident happened. **The double write is not redundancy, it is the condition of effectiveness.**

### 3.3 A dispatch must carry the initiator

**Both the dispatch file and the board line must record the initiator.** A transmission record without an initiator is useless:
after the fact you cannot audit it, cannot hold anyone accountable, and cannot draw the transmission graph (that is where the 42 ownerless lines in the 3D overview came from).

---

## Four, collecting receipts and sending failures back

### 4.1 The collection leg (the hole in [4] §7)

`session/prompt` is asynchronous, **so when does a message count as complete?**

| Approach | Explanation |
|---|---|
| **A. Polling** (adopted) | The `running` flag of `session/list` ＋ `session/page` to read the content; collect when you see `turn/end` or `running=false` |
| B. Event stream | The WebSocket endpoint, heavier |

**A timeout must not mean you throw it away** —— the receipt may arrive late. ⇒ Record the "seq before sending" when dispatching,
so you can later run a "collect" on its own to fish that receipt back out.

### 4.2 The engine side converts the format when it lands it ([7] §2.3)

The receipt format a scene writes back is not necessarily compliant (it may use bold, it may use Simplified Chinese, it may number the heading first).
**The engine side normalizes it when it lands it**, do not let both sides guess:

```
**④ Diff Set (new this time)**   →   ## Diff Set
**⑤ Accumulable Artifact ★**             →   ## Accumulable Artifact
```

### 4.3 A failure has to be sendable

When a receipt is blocked by validation ("the accumulable artifact did not land"), there has to be a **new dispatch with criteria** that sends it back,
rather than chasing the other side in a conversation.

**Sending back ≠ chasing.** Sending back is: a dispatch that spells out "which items are missing, where to write it, what counts as landed".

---

## Five, how the accumulable artifact counts as "landed" (two traps in the validator)

The landing check in `verify-receipt.mjs` hit two traps, both fixed on 2026-11-03:

| Trap | Symptom | Fix |
|---|---|---|
| **The landing text is taken with a flat `parseSections`** | The `###` subsections under §5 "dig the content away" ⇒ obviously it was written in, yet it is judged as not landed | Take the whole raw block of §5 (including its `###` subsections) as the landing text |
| **Verbatim comparison** | The receipt uses Simplified Chinese, the memory uses traditional (or the scene reworded it) ⇒ it is necessarily judged as not landed | Change it to "**longest common substring ≥ 8 characters**" —— file paths, commands and identifiers always recur |

> ★ Stepping back: **the landing check has to prove "it really is there", not "it is there word for word".**
> Verbatim comparison quietly swaps the red line from "did it land" into "was it copied word for word", which is not what the red line means.

★ **A third trap (only found on 2026-11-09): the dispatch copy did not keep up.**
> The validator was changed, but **`派單.mjs 退回` still said "（逐字比對）"** ——
> and the dispatch is **the copy the scene actually reads** (the dispatch body that goes out), the validator is only used for acceptance.
> The scene follows the dispatch and does "verbatim" ⇒ it is forced to copy the same content into two places (one in §5, one in SKILL.md) ⇒ a double-write point grows.
> Measured: the mail-handling scene had 4 groups of paragraphs that were verbatim identical on both sides; the heading pointed at the index long ago but the body was copied whole.
>
> ⇒ **When you change the validator, change the dispatch copy too** —— the scene follows the dispatch, not the validator.

---

## Six, failure modes

| Symptom | Root cause | Fix |
|---|---|---|
| Scenes are not talking to each other | Only messages, nobody wakes the recipient | Add the dispatch leg (wake) ＋ the collection leg |
| The notification record does not show who spoke | The message has no initiator field | Record the initiator in both the dispatch and the board line |
| The message was written but the recipient does not know | Only written to the board, not double written into the memory file | The double write is the condition of effectiveness, not redundancy |
| Dispatched to the wrong scene | No routing table | Put the routing table in the shared layer, only hand it to the model when there is no hit (exit code 3) |
| A late receipt is treated as no receipt | It is dropped when you stop waiting | Record the "seq before sending", collect later if needed |
| An accumulable artifact pasted in the receipt counts | No landing check | Receipt validation reads the scene memory to confirm the landing |
| It landed but was judged as not landed | The validator compares verbatim ＋ cannot reach the subsections | This piece §Five |

---

> ⬅️ **Back**: [Core Mechanisms README](README.md) ｜ **Related**: [4 · Dispatch and Receipt](4-dispatch-and-receipt.md) · [7 · Dispatch and Recovery Interface](7-dispatch-and-recovery-interface.md) · [5 · Workflow](5-workflow.md)

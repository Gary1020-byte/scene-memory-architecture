# 2 · Comparison with the A2A Protocol

> **One-line positioning**: A2A solves "**how do agents across organizations find each other and hand off work to each other**";
> scene memory dispatch solves "**how do several agents on the same machine, under the same rules, avoid stepping on each other**" —
> the two sit at different problem levels, not two answers to the same hole.
>
> 📌 **Sources**
> A2A side: from the official A2A documentation (`a2a-protocol.org`), retrieved **2026-11-01** (spec v1.0.x, Linux Foundation / Agentic AI Foundation).
> Scene memory side: from hands-on measurement on a local DSH workbench, measured **2026-10-31 / 2026-11-01**.

---

## 1. The core proposition of each (in one line)

| | Scene memory dispatch | A2A protocol |
|---|---|---|
| **Core proposition** | state **lives in files**, routing **asks the file system** | capabilities **are discoverable**, tasks **have a lifecycle** |
| **Three core objects** | file · directory routing · git repo | **Agent Card · Task · Message / Artifact** |
| **What a dispatch is** | leaving a record in the shared layer + a dispatch four-part contract (What · Criteria · Output Location · Receipt Format) | the other agent creates a `Task` (unique id, `status`, `artifacts`, `history`) |
| **How you find the other party** | the directory is the address: `<workbench-root>/scenes/<scene-name>/` | **Agent Card**: JSON self-description (identity, endpoint URL, skills, auth), served at `/.well-known/agent-card.json` |
| **Who is authoritative** | the **file** is authoritative, the agent is just the executor | the **agent endpoint** is authoritative, an artifact is an output |

> **The true point of divergence**: "where state lives, and who has the final say".
> Scene memory dispatch puts state in **files a human can open directly, diff, and blame**;
> A2A puts state on the **server side** (the Task object is held by the agent's A2A Server),
> and the client gets an id, a status code, and an artifact link.

---

## 2. The nine-dimension comparison (the body of this doc)

| dimension | Scene memory dispatch | A2A protocol | who wins |
|---|---|---|---|
| **① Task description** | one **dispatch four-part contract**: `What · Criteria · Output Location · Receipt Format`. Criteria must be verifiable ("list items that can release ≥ 1 GB, each labeled with path and size") | `Message` (`messageId` + `role` + `parts`) or a plain `Task`; free content types (text / file / structured data) | Each has strengths. The dispatch four-part contract is **strong at "definition of done"**; A2A `Message` is strong at **type freedom and cross-language** |
| **② State storage** | files. `§0` handover section (≤ **4 096 bytes** hard limit, measured), project memory (≤ 8 KB), shared-layer board / todo / index | **Server side**. `Task.status` (`submitted`→`working`→…→`completed`/`canceled`/`rejected`/`failed`), `artifacts`, `history`, `metadata`; `contextId` chains multiple Tasks | Files win on **auditability**; A2A wins on **complete lifecycle semantics** (including interrupt states like `input-required` / `auth-required`) |
| **③ Wake-up mechanism** | both channels in parallel: **channel A engine RPC** (`session/prompt` queues without interference, `session/page` fetches the other party's recent messages to reconcile, `session/cancel` interrupts), **channel B file messages** (written into the shared-layer board + recipient's §0 notifications) | **push / polling / streaming**, pick one: Request/Response (polling), SSE streaming (`TaskStatusUpdateEvent`/`TaskArtifactUpdateEvent`), **Push Notification** (the other party hooks a webhook callback) | A2A wins on **cross-machine push and long-task resumption**; files win on **zero network, receivable even when the other party is asleep** (offline delivery) |
| **④ Receipt** | **one dispatch = one receipt**; the receipt must carry a **Diff Set** ("diff from the previous round: / +1G, free 4.0→2.5Gi, swap −0.1G"), ≤ 10 lines / ≤ 2 KB; receipts are written into files ⇒ **diffable, blameable** | `Artifact` (with `artifactId`, name, parts) + Task status transitions; **versioning is the client's business** — the spec explicitly says the agent does not track artifact changes | Files win on **the receipt itself being a readable diff**; A2A wins on **artifacts having formal types and a retrieval path** |
| **⑤ Boundary enforcement** | **a fact, not a promise**. Each scene = its own git repo; the engine walks up from cwd to the first directory containing `.git` and treats it as the project root, loading **only** that tree's `AGENTS.md` and `.dsh/skills/` ⇒ another scene's constitution / skills / memory are **invisible to the model** | **Opaque Execution**: the other agent's internal logic, memory, and proprietary tools are not exposed; trust boundaries are drawn by **HTTPS + credentials + authorization** (`securitySchemes`, OAuth2 / Bearer) | Scenes win on **isolation being a structural fact** (not a prompt request); A2A wins on **cross-organization authorization and privacy** |
| **⑥ Audit** | `git log` all there, one repo per scene; plus a pre-handover snapshot into the archive (append-only, rollback-able); a write audit log | **Message logs are split across both sides** (client and server keep one each); traceability relies on enterprise features like tracing / monitoring built separately | Files win **by an order of magnitude**. This is the difference between "can you blame whoever broke it" and not |
| **⑦ Cross-organization** | ❌ **not good at it**. Premises: same machine, same rules, one person who can read it | ✅ **built for it**. Cross-vendor, cross-framework, cross-organization, cross-language; a Curated Registry serves as the capability directory | A2A wins outright |
| **⑧ Implementation cost** | low. **Zero network requests, zero servers, zero registries**; the scene boundary = `git init`; the validation tool is executable (`check` / `stamp` / `handover`), and its exit code can be called from CI | **You need a whole server stack and a registry**: one A2A Server per agent (HTTP endpoint), one Agent Card, an auth setup, and where needed **deploying and maintaining a Curated Registry service** (the spec itself does **not** define a standard registry API) | Files win (on the same machine) |
| **⑨ When to use which** | small scale, same machine, same person (or same small team), same rules; **state must be precise, auditable, and handover-able to a human** | you genuinely need **cross-organization / cross-vendor / cross-language** collaboration; **third-party agents** must be plugged in; you need **asynchronous long tasks**, push, SLAs (timeouts / retries / compensation) | Clear division of labour |

---

## 3. A2A's four objects, mapped one by one onto scene memory

| A2A object | what it is | the **closest** thing in scene memory | the gap (honestly stated) |
|---|---|---|---|
| **Agent Card** | JSON self-description: identity, service endpoint, skills (`id`/`name`/`inputModes`/`outputModes`), auth method; served at `/.well-known/agent-card.json` | `locator-card.md` + `identity-card.md` (tool-generated, ⛔ hand edits fail validation) | The scene version **does not describe endpoints or auth**, because they are shared on the same machine; it also **does no capability-directory lookup** |
| **Task** | a stateful work order: unique id, `contextId`, `status`, `artifacts[]`, `history[]`, `metadata` | §0 subsection 2 "Current Projects" table (project / memory file / status / next step) | The scene version **has no formal state machine or lifecycle semantics**; it relies on "§0 subsection 4: Next Steps / Blockers" + the board |
| **Message** | one round of communication: `messageId` + `role`(user/agent) + `parts[]` | the dispatch four-part contract (free-form markdown) + one line on the shared-layer board | The scene version **has no structured schema**, no `messageId`, no `role` field (this is [known gap #10](../02-implementation/4-known-gaps-and-todo.md)) |
| **Artifact** | a concrete result of the task: `artifactId` + name + `parts[]` | **the persisted file itself** (`project-memory/<project-id>.md`, etc.), with the path named in the receipt | The scene version's outputs **have no typed metadata**, they rely on human-readable paths; the upside is **what you get is a usable file** |

> **Three things worth copying** (the idea, not the architecture):
> ① **Number your dispatches** (corresponding to `taskId`) — right now matching relies on timestamps alone; a receipt citing a dispatch id would be more accurate;
> ② **Proactive ack + timeout escalation** (corresponding to `pushNotifications` and Task timeout states) — maps to [known gap #2](../02-implementation/4-known-gaps-and-todo.md) "the receipt has no timeout detection";
> ③ **Formal state machine semantics** — `submitted/working/input-required/completed/canceled/rejected/failed`
> this set of names is harder to argue about than "done / not done".

---

## 4. What scene memory dispatch is **not good at** (honest list)

This section is the point of the doc. **A methodology doc that only writes its own good side becomes marketing.**

| # | not good at | why (mechanism-level reason) | symptoms when you hit it | what to do |
|---|---|---|---|---|
| **1** | **Cross-machine** | the whole dispatch chain rests on "the file system is the routing table": `.git` boundaries, shared-layer board, file messages. If the files are not on the same machine there is no "same table" | the message is written but the recipient never sees it; board timestamps stop moving | route the dispatch channel over A2A / RPC, **but the memory layer can stay file-based** (memory on disk, dispatch over the network) |
| **2** | **Cross-organization** | the scene boundary = "the same set of rules" = the same `AGENTS.md` and the same validation tool. When the other party is another company with another set of rules, "scene sovereignty" and "⛔ request only, never modify the other party's memory" no longer hold | the other agent writes directly into your memory; or ignores your four-part contract outright | adopt A2A: declare capabilities via Agent Card, draw trust boundaries with credentials |
| **3** | **Asynchronous long tasks** | the scene side has no timeout detection ([known gap #2](../02-implementation/4-known-gaps-and-todo.md)), no retries, no resumption. A task running for three days leaves the receipt genuinely "on the table" | dispatched and never heard back; humans chase it manually | either adopt A2A (Task lifecycle + push), or add timeout detection first |
| **4** | **Third-party agents involved** | a third-party agent will not follow your file conventions and will not run your `check`. The five subsections of §0, the "≤ 4 KB" limit, the sha256 fingerprint — **none of it can be enforced on it** | a third-party agent writes a memory file with no §0 and your validation goes all red | route the third-party agent through A2A as an **external service**; your scene only deals with its artifacts |
| **5** | **Formal task state machine semantics** | the file side carries state in markdown paragraphs, so machine parsing requires writing a tool first ([known gap #10](../02-implementation/4-known-gaps-and-todo.md)) | to get "a list of all in-flight tasks" you have to write a parser yourself | use structured prefix markers, but **keep it human-readable** — memory is for humans |

> ⚠️ **The lesson in item 5 matters more than the previous four**:
> Scene memory dispatch is **not** a degraded A2A; it **asks a different question**.
> The first four are "does not apply once you switch scenes"; the fifth is "I want more even inside one scene" —
> the latter you can fix yourself (write the tool); the former can only be answered by switching protocols.

---

## 5. When to switch to A2A (switch signals)

| signal | explanation | severity |
|---|---|---|
| Scenes must cross machines | the shared file system premise is gone | 🔴 must switch |
| An external third-party agent has to plug in | the other party will not follow your file conventions and will not run your validation | 🔴 must switch |
| You need asynchronous long tasks (crossing days / weeks) | file messages cannot hold up; you need push and resumption | 🟠 should switch |
| You need service-level SLAs (timeouts, retries, compensation, alerting) | the current receipt has no timeout detection | 🟠 should switch |
| You need a cross-organization capability directory | "who can do what" must be queryable and authorizable | 🟠 should switch |
| You need a formal task state machine and concurrency tracking | many tasks in parallel, unified state tracking needed | 🟡 you can add it yourself |

> **Switching is expensive**: every scene memory, every audit trail, every "a human can take over" capability on the file side
> rests on one thing: **"the file is the only interface"**.
> Switching protocol = replacing the entire memory model. **Think before you switch.**

### 5.1 The other way round: when you should **not** adopt A2A

| signal | verdict |
|---|---|
| All scenes are on the same machine | ❌ A2A is too heavy. The boundary is already given by the file system (`.git` boundaries), audit is already given by git, and "finding the other party" needs no Agent Card — **the directory is the address** |
| You just want "receipts and timeouts" | ❌ Fix [known gap #2](../02-implementation/4-known-gaps-and-todo.md) first. Standing up a whole server stack + registry for one dispatch table is a bad ratio |
| The team is still sharing one machine | ❌ Same as above. Get the scene boundaries and validation right first |
| You want "cross-scene recall of things discussed before" | ❌ That is not A2A's problem, it is **semantic memory**'s problem → see [3-scene-memory-vs-semantic-memory.md](3-scene-memory-vs-semantic-memory.md) |

---

## 6. The two are not competitors (one diagram)

```
cross-organization / cross-vendor / cross-language / third-party agents
        │
        ▼
┌───────────────────────────────┐
│  A2A: capability discovery + task lifecycle │  ← solves "who is the other party, how far along is the job, did it come back"
│  Agent Card · Task · Artifact  │
└───────────────────────────────┘
        │  dispatch / receipt travels here
        ▼
┌───────────────────────────────┐
│  Scene memory: files + directory routing + git │  ← solves "who owns what, where state lands, can you audit the books"
│  §0 · locator card · project memory · board   │
└───────────────────────────────┘
```

> **The two can be layered**: use A2A for the cross-organization layer;
> within each agent's own scope, state is still managed with files.
> **Do not give up the file layer just to do A2A** — you would lose both audit and "a human can take over".

---

## 7. Two-sentence conclusion

> **First, a small same-machine workbench: scene memory dispatch is enough.** A2A's servers and registry exist
> for "crossing boundaries"; with no cross-boundary need, they are pure cost.
>
> **Second, if you really are doing cross-organization collaboration: then you need A2A.** But even then, do not throw away the file layer —
> A2A manages "how work is handed off"; scene memory manages "where my state lands and who wrote this entry".

---

## 8. Comparison at a glance (quick reference)

| what you want to know | which section |
|---|---|
| How the core objects map onto each other | §1 · §3 |
| The full nine-dimension comparison | **§2** |
| The weaknesses of scene memory dispatch | **§4** |
| Signals for switching to A2A | §5 |
| Ideas you can copy from A2A | end of §3 · note in §4 |

---

> ➡️ **Next**: [3-scene-memory-vs-semantic-memory.md](3-scene-memory-vs-semantic-memory.md) (ledger vs wiki: how to choose, how to combine, how to cure cross-talk)
> ⬅️ **Back**: [Comparisons and Selection README](README.md) ｜ **Related**: [4-dispatch-and-receipt.md](../00-core-mechanisms/4-dispatch-and-receipt.md) · [4-known-gaps-and-todo.md](../02-implementation/4-known-gaps-and-todo.md)

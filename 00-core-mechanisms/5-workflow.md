# 5 · Workflow —— how scenes are strung into one line

> One scene is one thing. A workflow is **the order and the hand-off between several things**.
>
> A dispatch is **one hop**; a workflow is **many hops, and it keeps hopping by itself**.

---

## 1. Why a workflow is needed

Without a workflow, cross-scene work depends on the machine owner giving instructions hop by hop:

```
Owner → Scene A → (owner replies) → Scene B → (owner replies) → Scene C
```

Every hop needs a human to catch it, and **the information in between is relayed by that human**. If the human misses one, the chain breaks there.

With a workflow:

```
Owner starts once → A → B → C → one final receipt
```

The hand-offs in between are decided by the workflow definition, not by a human in the moment.

> **A workflow moves "who takes over from whom" out of a human's memory and into a file.**
> That is the same move as a scene moving "state" out of a conversation and into a file.

## 1 and a half, engine-side implementation: chained calls (measured 2026-11-03)

> The minimal form of a workflow on the engine side: **the scenes are strung into one chain in order, and each hop carries the previous hop's conclusion plus who the next hop is.**
> Corresponding tool: `<workbench-root>/工具/鏈式呼叫.mjs`; the engine-neutral part on the repo side is in the [workflow definition format](../04-templates/workflow-template.md).

### Why one hop at a time, and not "call them all at once"

| | Call all at once | Hop by hop |
|---|---|---|
| Five scenes | Everyone talks at the same time | They take turns |
| Reading the answers back | You cannot tell who handed to whom | Every hop gets the previous hop's conclusion |
| Hand-off | Each scene has to guess who is next | **The orchestrator states who is next** |

### Each hop's message carries four things (miss one and the chain spins)

```
① You are hop N (of M)
② The previous hop's conclusion (for hop one: "you are the first hop, read §0 first")
③ Who is next (for the last hop: "summarize the whole chain")
④ Reply with: status ＋ [Next Handoff] hand-off
```

### Measured result (5 hops: Scene A → Scene B → Scene C → Scene D → Scene E)

| Hop | Scene | Answer quality |
|---|---|---|
| 1 | Scene A | ✅ Read §0, raised three items awaiting a decision, wrote a concrete hand-off |
| 2 | Scene B | ✅ Read §0, pointed out the 11-02 worksheet was not generated because cron hit a 429 |
| 3 | Scene C | ⚠️ "State is identical to the previous hop, no operation started" |
| 4 | Scene D | ⚠️ "This is a hop-4 hand-off relay, no actual operation performed" |
| 5 | Scene E | ✅ **Saw through the whole chain**: "the chain as a whole is essentially spinning" |

> ★ **Spinning is not a bug, it is correct behaviour.**
> The message only said "reply with your status", it dispatched no task ⇒ the scene read its own §0, found no work, and reported honestly.
> **Hop 5 proactively pointed out that the chain advanced nothing**——that is exactly "do not rely on trust, read the evidence".

### Two implementation traps

| # | Symptom | Root cause |
|---|---|---|
| 1 | The answer read back is an intermediate output like "read" | The assistant emits intermediate messages with only tool-calls ⇒ **take the longest one with real text** |
| 2 | `session/create` reports `accepts workspaceId or cwd, not both` | The engine does not accept both ⇒ pick one |

---

## 2. What a workflow is, and what it is not

| Is | Is not |
|---|---|
| The **order, entry conditions, criteria and failure strategy** of several scenes | A piece of code |
| A **file** (the shared layer's fifth board) | A resident executor |
| One launch ＝ one **chain** | A container that binds all the scenes together |

**What separates it from "queueing three scenes in a row"** is two things:

- **Branches**: what situation takes a different path
- **Failure handling**: where it stops when it breaks, and whether a human must step in

Without those two it is just a sequence; with them it is a workflow.

## 3. The workflow definition (the shared layer's fifth board)

The workflow definition lives in the shared layer, and **what is shared is the definition, not the state**.

```
shared/
├── _scene-identity-index.md      ← Board 1: where things are
├── _cross-scene-notifications.md ← Board 2: what happened
├── _todo.md                      ← Board 3: what to do
├── conflicts.md                  ← Board 4: two places disagree
└── workflows/                    ← Board 5: ★ the plan (what to do, in what order, by what criteria)
    ├── disk-check-and-cleanup.yaml
    └── weekly-review.yaml
```

> **Why it has to be its own board instead of being stuffed into the announcements board or the to-do list?**
> The announcements board is the **current situation**, the to-do list is **items**, a workflow is the **plan**——it has order, conditions and branches,
> and stuffing it into any one of them flattens it. The update rate differs too: a workflow moves once a month, the to-do list moves ten times a day.

### The fields of a workflow definition

```yaml
id: disk-check-and-cleanup
name: Disk check → cleanup → report
version: 1
steps:
  - scene: scene C
    purpose: Find the cleanable items
    criteria: List items that free ≥ 1 GB, each with path and size
    output: scenes/scene C/project-memory/disk-check-<date>.md
    needsConfirmation: false
  - scene: scene C
    purpose: Clean up
    criteria: Actually free ≥ 1 GB and list what was deleted in the receipt
    needs: The cleanup list from the disk check
    needsConfirmation: true          # ★ irreversible ⇒ set a gate
  - scene: scene A
    purpose: Produce the report
    criteria: The report is on disk and its first line is on the shared board
    needs: The cleanup result
    needsConfirmation: false
failureStrategy: stop-and-wait      # stop-and-wait | continue | rollback
branches:
  - when: step 1 found nothing ≥1GB to clean
    then: skip step 2 and go straight to step 3
```

| Field | Purpose | What breaks without it |
|---|---|---|
| `steps[].scene` | Which scene executes this hop | No target |
| `steps[].purpose` | What this hop is for | It reads like a wish |
| `steps[].criteria` | **What counts as this step being done** (verifiable) | There is no way to judge whether the receipt is true |
| `steps[].output` | Where the output is written | The output scatters and later hops cannot pick it up |
| `steps[].needs` | What this hop needs from the previous hop | The hop starts from nothing and repeats itself |
| `steps[].needsConfirmation` | Whether this step is a gate | Irreversible operations get run automatically |
| `failureStrategy` | What to do when it breaks | It breaks halfway and nobody knows |
| `branches` | Conditional paths | It can only go straight |

> **The `criteria` field is the core of the whole definition.** Without criteria, a workflow's "done" is just a feeling.

## 4. Gates: what should stop and what should not

A workflow runs **forward automatically** by default. Only two situations make it stop:

### Case one: this step is marked as a gate (`needsConfirmation: true`)

It stops and waits for a human to look before continuing. **Where a gate belongs** —— any one of three criteria is enough:

| Criterion | Example |
|---|---|
| **Irreversible** | Deleting files, sending outward, publishing |
| **Costs unrecoverable resources** | Money, external quota, a notification to a third party |
| **The output is taken as fact downstream** | The list you just deleted with will be used by later steps to delete more |

**No gates on intermediate steps.** Checks, drafting, tidying up a list are re-runnable steps; putting a gate there turns the workflow into per-hop confirmation —— and then it loses its point.

> **Safety should not depend on "ask a human every step"; it should depend on "stop when it breaks".**
> Per-hop confirmation hands the decision to stop to a human who then has to exercise it every single time; stopping only at gates interrupts you only when judgement is actually needed.

### Case two: any step fails or its receipt misses the criteria ⇒ stop right there

This is **mandatory**, it does not rely on a setting (fail-closed, the same philosophy as the whole architecture).

## 5. The execution lifecycle

### Start (only the machine owner can start it)

```
① Read the workflow definition → parse steps, criteria, failure strategy, branches
② Pre-check (fail-closed, refuse to start if any item fails)
     · every scene exists
     · every scene has a boundary (independent git repository)
     · every step's criteria is non-empty
     · the entry step's entry condition already holds
③ Create the execution state (orchestrator-private, one per run)
```

### Every hop

```
④ The orchestrator opens a new conversation and binds this step's scene
     → this conversation automatically reads that scene's §0 at the opening (carrying the accumulation)
⑤ Dispatch ＝ the dispatch four-part set ＋ the previous hop's accumulable artifact (if any)
⑥ Execute inside the conversation
⑦ Before closing, write:
     · the §0 handover (overwrite in place, for the next conversation)
     · the receipt three-part set (see below)
⑧ Close the conversation
⑨ The orchestrator validates the receipt:
     · were the criteria met?
     · is the accumulable artifact non-empty?
     · ★ read the scene memory, confirm that accumulable artifact really landed
⑩ Pick the next hop by the branch conditions → back to ④
```

> **That last part of step ⑨ is the key of this design.**
> The orchestrator does not merely collect the receipt, it goes and reads the scene's memory file to confirm the accumulable artifact really got written in.
> That turns "a receipt must carry an accumulable artifact" from a **slogan** into **something mechanically verifiable**——
> and it also guards "⛔ never edit the other side's memory" for free: acceptance only reads, the write must be done by the scene itself.

### Stopping and resuming

| Situation | Behaviour |
|---|---|
| A step fails / the receipt misses the criteria | **Stop right there**, write clearly "where it is stuck, what it is waiting for" |
| The step is a gate | Run it, then stop and wait for human confirmation |
| The orchestrator restarts mid-way | Resume from the execution state, **the hop that already finished does not re-run** |
| The end | Produce one final receipt for the machine owner |

## 6. Where the execution state lives

**Not in the shared layer** (that is the plan), **not in the scene private layer** (that is one scene's memory, a run belongs to the orchestrator). So it needs its own layer:

```
<workbench-root>/
├── shared/                    ← L1 shared layer: plan and current situation (everyone reads the same copy)
│   ├── _scene-identity-index.md
│   ├── _cross-scene-notifications.md
│   ├── _todo.md
│   ├── conflicts.md
│   └── workflows/<workflow-id>.yaml
│
├── scenes/<scene-id>/           ← L2 scene private layer: the long-term identity of one thing
│
├── runs/<run-id>/               ← ★ L3 execution layer: orchestrator-private (the state of this run)
│   ├── execution-state.md          ← where it got to, where it is stuck, what it is waiting for
│   └── carry.md            ← the carrier that passes each hop's accumulable artifact down
│
├── tools/                      ← L4 tool layer
└── docs/                       ← L5 doc layer
```

The execution state has four values:

| State | Meaning | How it is left |
|---|---|---|
| **running** | It is running normally | It advances on its own once the next hop completes |
| **waiting-for-gate** | This step is a gate; it stops and waits for a human | `resume --gate-passed` |
| **stopped** | A step failed or the receipt did not pass (fail-closed) | `resume` after it is fixed |
| **completed** | Every step is done | — |

| | Workflow in the shared layer | Run in the execution layer |
|---|---|---|
| Content | **Definition**: steps, criteria, branches | **State**: which hop, where it is stuck |
| Lifecycle | Long-lived, revised version by version | One per launch, archived when it ends |
| Who writes | Machine owner | Orchestrator |
| Who reads | Everyone | Orchestrator (readable and editable by humans) |

> **One workflow can have many runs; each run has its own private state.**
> The definition is shared, the executions run independently —— the same shape as "one scene can have many projects".

## 7. Can one scene be used by several workflows at the same time

Yes. **What gets occupied is not the scene, it is the conversation.**

A scene is files, memory, a boundary; it is not an execution resource. What actually runs is a conversation. So "the same scene referenced by two workflows" is not a conflict —— **each workflow opens its own conversation.**

There is exactly one real conflict: **who overwrites `§0` at closing time.**

| Approach | Rule | Verdict |
|---|---|---|
| **A · Serialize** | Only one run per scene at a time, later ones queue | The default. Simple and reliable |
| **B · Split the writes** | The accumulable artifact goes through an append channel (`§5 Decisions and Pitfalls`, which is append-only anyway); overwriting `§0` needs arbitration | Only turn it on when you need parallelism |

**A is the default, B is an optional optimization.** B's arbitration rule can be one sentence: **`§0` is written only by the one that finishes last; the others just append their accumulable artifact to `§5`.**

Reason: `§0` exists to "tell the next conversation the current state", `§5` exists to "accumulate understanding". The two serve different purposes, so **when they conflict, protecting `§5` (the accumulation) matters more than protecting `§0` (the live state).**

> By the way: `§5 Decisions and Pitfalls` is marked "append only" —— that design started out as just a hygiene habit;
> in the new architecture it has become **the main accumulation channel**.

## 8. Dispatch vs workflow

| | Dispatch | Workflow |
|---|---|---|
| Number of hops | **One** | **Many** |
| Who decides the next hop | A human | **The workflow definition** |
| How the information in between travels | The next hop goes and looks | **The previous hop's accumulable artifact** |
| End condition | One receipt | One final receipt (each hop has its own) |
| Human involvement | Every hop | **Only at gates and on failure** |

The two are not competitors, they are **two granularities of the same mechanism**:

```
Dispatch   ＝ one step of a workflow
Workflow   ＝ dispatches chained, plus order, branches and failure strategy
```

## 8.5 This thing has tools guarding it

However good the spec is, without a tool enforcing it, it is only a request to remember. There are three tools for that:

```bash
# ① Is the workflow definition valid
node 03-executable-tools/verify-workflow.mjs --root <workbench-root>

# ② Run: start → hop by hop → collect the receipt (★ block it and stop in place if acceptance fails)
node 03-executable-tools/run-workflow.mjs start  --root <workbench-root> --workflow <id>
node 03-executable-tools/run-workflow.mjs step   --root <workbench-root> --run <run-id>
node 03-executable-tools/run-workflow.mjs receipt --root <workbench-root> --run <run-id> --receipt <file>
node 03-executable-tools/run-workflow.mjs resume --root <workbench-root> --run <run-id> [--gate-passed]

# ③ Validate a receipt on its own (★ includes "did the accumulable artifact land in the scene memory")
node 03-executable-tools/verify-receipt.mjs --root <workbench-root> --scene <scene-name> --receipt <file>
```

End-to-end acceptance (12 items, including deliberately broken cases):

```bash
bash 03-executable-tools/workflow-acceptance.sh
```

> **This version of the executor is offline**: it does not really call the engine, it writes what each step should do into files and advances the state machine.
> That is deliberate —— **engine neutrality**. The engine-specific version only has to swap "produce the dispatch" for "really dispatch it";
> the state machine and the acceptance logic carry over unchanged.

---

## 9. Failure modes

| Symptom | Root cause | Fix |
|---|---|---|
| The workflow is stuck, nobody knows where | No execution state file | The execution state must record "where it is stuck, what it is waiting for" |
| It breaks and keeps running | No fail-closed | Stop on failure, do not rely on a setting |
| Too many gates on intermediate steps | Gate overuse | Only set a gate for irreversible / resource-consuming / output-taken-as-fact steps |
| Two workflows overwrite each other's `§0` | Serialization was not defined | A is the default; use B when running in parallel |
| After a restart it runs from the beginning | The execution state did not record completed steps | Mark each hop in the execution state when it finishes |
| The accumulable artifact is only in the receipt, never landed | No acceptance | `verify-receipt.mjs` blocks it (landing acceptance) |
| **After a run stops you cannot get back in** | The spec only said "stop and wait", not how to continue | `run-workflow.mjs resume` |

## 10. One sentence to remember

> **A workflow is the choreography of scenes, not a program.**
> **The definition lives in the shared layer, the state lives in the execution layer; by default it runs forward, and only gates and failures stop it.**

---

> ➡️ **Next**: [6 · The Division of Labour of Two Memory Systems](6-two-memory-systems.md) (file school vs semantic school)
> ⬜ **Previous**: [4 · Dispatch and Receipt](4-dispatch-and-receipt.md) ｜ **Back**: [Core Mechanisms README](README.md) ｜ **Related**: [1 · Accumulation](1-accumulation.md) · [2 · Scene](2-scene.md)

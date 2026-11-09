# Workflow Template

> A workflow definition lives in the shared layer's fifth board: `shared/workflows/<workflow-id>.yaml`
> Copy one, edit it, then run the validation.

---

## 1. Minimum viable (works even with a single step)

```yaml
id: disk-check-and-cleanup
name: Disk check → cleanup → report
version: 1
steps:
  - scene: scene C
    purpose: find the items that can be cleaned up
    criteria: list the items that can release ≥ 1 GB, each labeled with path and size
    output: scenes/scene C/project-memory/disk-check-<date>.md
    needsConfirmation: false
failureStrategy: stop-and-wait
```

---

## 2. Full skeleton

```yaml
id: disk-check-and-cleanup
name: Disk check → cleanup → report
version: 1
description: check the disk every quarter, clean up the space that can be released, then produce a report
entry: Disk check

steps:
  - scene: scene C
    purpose: find the items that can be cleaned up
    criteria: list the items that can release ≥ 1 GB, each labeled with path and size
    output: scenes/scene C/project-memory/disk-check-<date>.md
    needsConfirmation: false

  - scene: scene C
    purpose: clean up
    criteria: actually release ≥ 1 GB, and list in the receipt what was deleted
    output: scenes/scene C/project-memory/disk-cleanup-<date>.md
    needs: the cleanup list from the disk check
    needsConfirmation: true

  - scene: scene A
    purpose: produce the report
    criteria: the report is written to disk, and its first line is written on the shared board
    output: scenes/scene A/project-memory/disk-report-<date>.md
    needs: the cleanup result
    needsConfirmation: false

failureStrategy: stop-and-wait

branches:
  - when: step 1 found no ≥1GB cleanable
    then: skip step 2 and go straight to step 3
```

---

## 3. Field reference

| Field | Required | What it does | What breaks if it is missing |
|---|---|---|---|
| `id` | ✅ | Workflow identity | The execution state cannot find a match |
| `name` | ✅ | The name for humans | — |
| `version` | ✅ | Incremented on each revision | You do not know which version ran |
| `steps[].scene` | ✅ | Which scene executes this hop | No target |
| `steps[].purpose` | ✅ | What this hop is supposed to do | Like a wish, not a task |
| `steps[].criteria` | ✅ | **What counts as this step being done** (verifiable) | The receipt cannot be judged true or false |
| `steps[].output` | ✅ | Where the product is written | The output scatters; the next hop cannot pick it up |
| `steps[].needs` | — | What this hop consumes from the previous hop | Information breaks between hops |
| `steps[].needsConfirmation` | — | Whether this hop is a gate | Irreversible operations get run automatically |
| `failureStrategy` | ✅ | What to do when something breaks | It breaks halfway and nobody knows |
| `branches` | — | Conditional paths | Only a straight line is possible |

---

## 4. How to mark a gate

**Set `needsConfirmation: true` in only three situations**:

| Criterion | Example |
|---|---|
| **Irreversible** | deleting files, sending outward, publishing |
| **Consumes unrecoverable resources** | money, outward quotas, notifications to third parties |
| **The output will be taken as fact downstream** | the list of deletions is used by later steps to delete things |

**Do not set gates on intermediate steps.** Health checks, drafting, tidying lists — steps you can just run again;
setting a gate on them only turns the workflow into hop-by-hop confirmation —— which defeats the purpose.

> **Safety should not rest on "ask a human every step", it should rest on "stop when it breaks".**
> Hop-by-hop confirmation hands the decision to stop to a human who has to exercise it every time; stopping only at gates
> interrupts only when a real judgement is needed.

---

## 5. Where the execution state lives

```
<workbench-root>/runs/<run-id>/
├── execution-state.md      ← where it got to, where it is stuck, what it is waiting for
└── carry.md                ← the carrier that passes each hop's accumulable artifact onward
```

**Not in the shared layer** (that is the plan), **not in the scene's private layer** (that is one scene's memory).
A workflow can have many runs; each run has its own private state.

---

## 6. Three things to confirm before you write

1. **Is each hop's `criteria` verifiable?** "Cleaned up properly" is not a criterion;
   "actually released ≥ 1 GB, and listed in the receipt what was deleted" is.
2. **Is the irreversible hop gated?**
3. **Can the previous hop really produce each hop's `needs`?** The previous hop's accumulable artifact must be written clearly enough.

---

> ⬅️ **Back**: [Template README](README.md) ｜ **Related**: [5 · Workflow](../00-core-mechanisms/5-workflow.md) · [4 · Dispatch and Receipt](../00-core-mechanisms/4-dispatch-and-receipt.md)

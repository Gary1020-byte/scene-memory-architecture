# Execution State Template

> This is the **private state of one execution**, not the plan.
> The workflow is **defined** in the shared layer (`workflows/<id>.yaml`); this file is "how far this particular run got".
>
> Mixing them ⇒ the execution state splits into several copies, and nobody can read the authoritative one.

---

## 1. Template

```markdown
# Execution State · <workflow-name>

> This file is the **private state of this particular execution** (not the plan). The workflow is defined in the shared layer.
> If you close it midway, it crashes, or someone else takes over ⇒ this file is what lets them pick it up.

- workflow: <workflow-name>
- run id: <workflow-name>-<date>-<sequence>
- startTime: <YYYY-MM-DD HH:MM:SS>
- updatedTime: <YYYY-MM-DD HH:MM:SS>
- status: <running / waiting-for-gate / stopped / completed>
- currentStep: <N>

## Step Progress

| index | scene | status | receipt |
|---|---|---|---|
| 1 | <scene-name> | <pending / running / completed> | <receipt-file-name> |

## blocker

- <none / where it is stuck, and on what>

## nextAction

<the one sentence concrete enough to just do it>
```

---

## 2. The four status values

| Status | Meaning | How to leave it |
|---|---|---|
| **running** | Normal progress | Advances automatically after the next hop completes |
| **waiting for gate** | This step is a gate; stop after it and wait for a human | `resume --gate-passed` |
| **stopped** | A step failed or the receipt was rejected (fail-closed) | Fix it, then `resume` |
| **completed** | All steps are done | — |

---

## 3. The blocker must state three things

```
- Where it is stuck: <which step, which file>
- What it is waiting for: <who is doing what / what information is missing>
- Why: <one sentence>
```

> Writing only "it is stuck" is the same as writing nothing. The next person (or you in three months) can pick it up
> only when they can see "where it is stuck, what is missing".

---

## 4. The structure of this directory

```
runs/<run-id>/
├── execution-state.md      ← this file
├── carry.md                ← the carrier that passes each hop's accumulable artifact onward
├── workflow.yaml           ← a snapshot of the definition at launch (changing the definition does not affect this run)
└── receipts/
    ├── dispatch-1.md       ← the dispatch of each hop
    ├── dispatch-2.md
    ├── receipt-1.md        ← a copy of the receipt that came back
    └── receipt-2.md
```

> **Why the workflow snapshot is stored**: after the definition changes, which version should the run that is
> currently going use? The answer is "the version at launch"——so the snapshot has to travel with the run.

---

## 5. Confirm before you write

1. Does the current step match the number of steps in the workflow definition?
2. Are the receipt files of the completed steps all in `receipts/`?
3. Does the blocker state clearly "where it is stuck, what it is waiting for"?

---

> ⬅️ **Back**: [Template README](README.md) ｜ **Related**: [5 · Workflow](../00-core-mechanisms/5-workflow.md) · [Carry File Template](carry-template.md)

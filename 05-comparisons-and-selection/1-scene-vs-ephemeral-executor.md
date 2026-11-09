# 1 · Scene vs Ephemeral Executor

> This doc answers one specific question: **every mainstream framework has sub-agents (ephemeral executors), so why do we still need a scene?**
>
> The answer is not "sub-agents are bad". Sub-agents are excellent at what they are good at.
> What this doc is about is **whether the two suit the same kind of work** — and where the real difference lies.

---

## 1. First, what sub-agents are good at

| sub-agent advantage | explanation |
|---|---|
| **Isolation** | Its context is clean, it does not pollute the main conversation |
| **Cheap** | Dispatching one is one task; no resident thing to keep alive |
| **Parallel** | Several subtasks run at once; total time is the slowest one |
| **Context does not explode** | The main line only gets the conclusion, never the pile of exploration in between |

**All four of these are true, and plenty of work should use a sub-agent.** A one-line query, a one-off refactor, an exploration that needs an independent context — none of these should open a new scene.

## 2. Where the real difference is

Three points. All of them hold.

### Difference one: does it have its own event history

A sub-agent's definition **can be edited** — role settings, system prompt, tool list are all editable.
But what it records is "**what this role is**", not "**how this thing was done last time**".

| | sub-agent | scene |
|---|---|---|
| Role settings | yes, editable | yes (locator card + identity card) |
| **History of this work** | **none** | yes (`§0` handover, `§5` Decisions and Pitfalls) |
| Project/task progress | only in the current context | persisted to disk, survives across sessions |

> **So the claim "a sub-agent is not editable" is wrong.** What is wrong is treating "role settings" as "experience" —
> role settings say who it is, experience says what it has done. **Only the latter accumulates.**

### Difference two: does accumulation flow back

Experience produced by a sub-agent stays, by default, **in that one round's context**. It is gone when the session ends.

To flow back, someone has to actively write it into some file. **Mainstream frameworks give no place for that** — not that permissions are missing, but that the very idea of "that place" is missing.

What a scene does: **the receipt must carry an accumulable artifact, and write it back into the scene memory.**
This works because a scene is by definition "a thing that persists long-term and can be rewritten".

### Difference three: who is the substrate

| | sub-agent | scene |
|---|---|---|
| Condition of existence | the round in which it is summoned | **depends on no single call** |
| After it leaves | nothing remains | the files are still there, next time picks up |
| Who holds it | nobody (it is temporary) | **the orchestrator** |

> **The ephemeral executor is a correct design — it was always meant to be used and discarded.**
> The problem was never "it is not good enough", it is "do not put the expectation of accumulation on it".

## 3. So when do you use which

| nature of the work | use | reason |
|---|---|---|
| One-off query, isolated exploration | **ephemeral executor** | isolation + cheap; opening a scene is too heavy |
| The same kind of work **keeps coming back** | **scene** | needs accumulation, needs to remember how it was done last time |
| Must stay alive across sessions | **scene** | a sub-agent's context does not cross sessions |
| Results must be auditable and rollback-able | **scene** | a scene has git history |
| Lots of parallel, unrelated work | **ephemeral executor** | the boundary cost of a scene is not worth it |
| One run needs a long ordered chain | **scene + workflow** | a workflow is the orchestration of a scene, not of a sub-agent |

> **The criterion in one line: is this work's value greater than "how it was done last time"?**
> No → sub-agent. Yes → scene.

## 4. They are not mutually exclusive: a scene already contains sub-agents

This is the most misunderstood part. **A scene is not a replacement for a sub-agent, it is its holder.**

```
Orchestrator (holds the scene)
  ├─ dispatch work to the scene ──▶ the scene opens its own conversation,
  │                                  spawns an ephemeral executor when needed
  │                                      ↑
  │                                 ephemeral executor: use and discard,
  │                                 output returns to the scene
  ↓
  accumulable artifact written back to scene memory  ← ★ accumulation happens
                                                          here, not on the
                                                          ephemeral executor
```

When a scene executes one thing, it can internally break out ephemeral executors to handle several subtasks in parallel.
**The difference is only the last step: the outputs of those subtasks must be collected back into the scene.**

> This also answers the question "will a scene be too dumb":
> A scene is not smarter than a sub-agent, it just **remembers more**.
> And "remembers more" is more useful than smart on work that keeps coming back.

## 5. Why not a cross-agent protocol like A2A

A workflow looks a lot like "agents dispatching work to each other" — but the direction is reversed.

| | protocols like A2A | workflows in this architecture |
|---|---|---|
| Collaborating parties | **different substrates** (agents of different organizations) | **different scenes inside the same substrate** |
| What is passed | tasks, state, artifacts | **accumulable artifacts** |
| Relationship | commission, parties don't know each other | **one scene system, shared rules and ledger** |
| Basis of trust | protocol and credentials | **the same files, the same rules** |
| How humans intervene | usually cannot get in | read the files anytime, change them anytime |

> **A workflow is a relay inside one substrate; A2A is a delegation between different substrates.**
> What you need is not cross-substrate trust, it is division of labour and accumulation inside one substrate.
> (Full comparison in [2-comparison-with-a2a.md](2-comparison-with-a2a.md))

## 6. What this architecture is not good at

An honest list:

| not good at | explanation |
|---|---|
| **One-off short tasks** | the cost of opening a scene is far higher than spawning a sub-agent |
| **Many mutually independent parallel tasks** | a scene has a boundary cost, a sub-agent does not |
| **Cross-organization, cross-trust-domain collaboration** | that is A2A's turf, do not force-fit |
| **Real-time fluid conversation** | scenes talk through files, not through conversation |
| **Work you do not intend to accumulate** | that is the sub-agent's slot, do not cram it in |

## 7. Remember it in one line

> **A sub-agent starts from zero every time; a scene starts from where it left off.**
> **The former excels at one-offs, the latter at work that keeps coming back.**
> **To choose, first ask: is this work's value greater than "how it was done last time"?**

---

> ➡️ **Next**: [2-comparison-with-a2a.md](2-comparison-with-a2a.md)
> ⬅️ **Back**: [Comparisons and Selection README](README.md) ｜ **Related**: [1-accumulation.md](../00-core-mechanisms/1-accumulation.md) · [5-workflow.md](../00-core-mechanisms/5-workflow.md)

# Carry File Template

> **The carrier that passes each hop's accumulable artifact onward.**
> In a workflow, information flows between hops through this file——not through scenes talking to each other.

---

## 1. Template

```markdown
# Carry File · <workflow-name>

> The carrier that passes each hop's accumulable artifact onward. The next hop's dispatch quotes what is in here.

## Step 1 Accumulable Artifact

- <method / criteria: how to do it next time>
- <pitfall: what you will trip over next time>

## Step 2 Accumulable Artifact

- <method / criteria>

## Step 3 Accumulable Artifact

(not yet executed)
```

---

## 2. What it is, what it is not

| Is | Is not |
|---|---|
| **The channel that carries things across hops**——the next hop's dispatch brings in the previous hop's accumulable artifact | An announcement in the shared layer (that is the board's job) |
| One copy per execution (travels with the run) | Part of the workflow definition (that is the plan) |
| Its content comes from the receipt's "Accumulable Artifact" section | A summary written by hand |

> **How it differs from scene memory**: scene memory is **that scene's** accumulation (it exists across runs);
> the carry file is the transmission **inside this particular workflow** (it is sealed when the run ends).
> You need both——scene memory makes "doing the same kind of work next time" faster, the carry file makes "this chain
> continues downwards" connect.

---

## 3. Why scene A may not write directly into scene B's memory

Because of **scene sovereignty**: each scene writes only its own memory.

Cross-scene transmission takes two routes, and neither breaks sovereignty:

```
① Carry file (inside the workflow, private to the run) —— the relay in progress
② Scene memory §5 (exists across runs) —— the long-term accumulation
```

The first is "where this chain has got to right now", the second is "what I learned from this kind of work".
**Do not mix them**——mixing produces "A's stuff written into B's memory, and B does not even know whose it is".

---

## 4. Confirm before you write

1. Does every step have its own section? (for steps not yet executed, write "(not yet executed)")
2. Does the content come from the receipt's "Accumulable Artifact" section? (not a separate set you invented)
3. Did you also push state information (numbers, progress) in here? **Those belong to the Diff Set, not here.**

---

> ⬅️ **Back**: [Template README](README.md) ｜ **Related**: [5 · Workflow](../00-core-mechanisms/5-workflow.md) · [Execution State Template](execution-state-template.md)

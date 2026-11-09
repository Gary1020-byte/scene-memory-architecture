# 6 · The Division of Labour of Two Memory Systems —— the difference between a ledger and a wiki

> On the same machine, the same problem has two kinds of answer:
> one is the "**file school**", where the state is written by humans and validated by tools; the other is the "**semantic school**", where the memory is extracted by the machine itself.
>
> Both are right, and they **do not answer the same question at all**.

---

## 1. Two schools

| | Scene memory (file school) | Semantic memory (semantic school) |
|---|---|---|
| Core proposition | Memory is **in files**, not in the session | Memory is **extracted automatically** by the machine from the conversation |
| Who writes | Humans + tools write actively | The machine extracts every N turns |
| Unit of memory | One 4 KB handover file | Tens of thousands of fact nodes |
| Question it answers | **Where are we now, who owes what** | **What did we learn before, how did we solve it last time** |
| When it is recalled | Read §0 before a meeting, precise and free | Prefetch every turn, capped at 2048 tokens |
| Isolation | Strong: each scene is its own git repo | Weak: multiple profiles share one store |
| Auditable | `git log` holds everything | Server-side log; the extraction result itself **cannot be diffed** |
| Failure mode | Handover not written → the next person taking over misses a step | Extraction error → the error stays in memory long-term |
| Cost | Zero network requests | Every extraction burns tokens |
| Can a human rescue it | Yes: Markdown, readable and editable | Harder: you have to write a correction file to cover it |

---

## 2. The problems each one solves

### Three problems the file school solves

**First: you lose your memory when you switch windows.**
Same scene, same thing, ask it again in a new session and it starts over from scratch.
If memory grows inside the context, it is really a "conversation tail" —— cut the tail and the state is gone.

**Second: memory gets stomped on.**
Two agents handle the same project at the same time and each writes to the same memory. Who overwrote whom? Unknown. You cannot even find out afterwards.

**Third: no way to know whether it is done.**
"I think I finished" is not evidence. It has to be verifiable.

> What these three have in common: **none of them is a problem of model capability; they are problems of where memory lives and where its boundaries are.**

### Three problems the semantic school solves

**First: broad coverage.** Everything that was talked about enters memory automatically, without relying on discipline.
**Second: zero maintenance cost.** No handover file to write, no check to run.
**Third: it gets better with use.** A question you met the first time, asked again half a year later, and it may answer with last time's approach directly.

### The cost of the semantic school

- **Noise in memory**: extracted facts are not necessarily accurate.
- **Failures pollute long-term**: when extraction breaks, errors sit quietly in memory and later get recalled and treated as fact.
- **It has to be correctable by hand**: when you find that the memory is wrong, you have to write a separate correction file to cover it, which is more trouble than editing a file.

---

## 3. The insight: this is the difference between a ledger and a wiki

Once you lay them side by side you see that they are **not two implementations of one thing, but two layers**:

| | Role | Metaphor |
|---|---|---|
| **Scene memory** | Answers "**now**" | **Ledger** —— it survives switching models, switching sessions, the agent dying |
| **Semantic memory** | Answers "**before**" | **Wiki** —— what this agent knows better and better the more it is used |

Many people agonize over "files or a vector store", and the reason is that they treat "memory" as one thing.
In real workflows:

> **Ledger only, and the agent does not get smarter; wiki only, and you forget who did half of yesterday's job.**

**The trade-off principle, simple enough to copy straight over:**

> **If you want "precise state, auditable, a human can take over" → files.**
> **If you want "broad coverage, no discipline needed, experience accumulates" → semantics.**

---

## 4. How to use them together (division of labour, not either/or)

```
┌─ Scene memory ＝ source of truth ─────────────────────────────┐
│  Handover, criteria, landing points, audit —— all in files      │
│  Who can write: only this scene; whose memory you change is whose │
└───────────────────────────────────────────────────────────────┘
              ↕ only summaries go out, nothing is written back
┌─ Semantic memory ＝ recall layer ─────────────────────────────┐
│  Makes things across scenes and sessions "searchable"          │
│  instead of "having to go through the files"                   │
│  Recall can be filtered (by scene / by tag / by source)        │
└───────────────────────────────────────────────────────────────┘
```

**The key to combining them is not breaking the boundaries**:

| Rule | Why |
|---|---|
| **State stays separate, experience is shared and tagged with its source** | When sharing one store, every fact needs a source tag, otherwise recall cannot be filtered |
| **The semantic layer only reads summaries, it never writes state back** | The moment it writes back, state has two sources of truth → it splits |
| **Extraction failure has to be visible** | Silent failure leaves errors in memory long-term; the failure rate must be an observable number |

---

## 5. A real lesson about cross-layer contamination

When several profiles share one semantic store, **cross-layer contamination** happens:
a specialised fact that one scene wrote comes back out when an unrelated scene recalls.

**Two ways to handle it**:

| Approach | Effect | Cost |
|---|---|---|
| **Separate stores** (one per profile) | Clean isolation | You lose cross-profile recall |
| **Shared store + source tags** (`retainTags` marks the source) | Keeps cross-profile recall, and recall can be filtered | It requires the filtering mechanism to actually exist |

> **The approach consistent with the scene memory boundary model: keep state separate, share experience and tag its source.**
>
> Half-doing separate stores is the worst state: the stores are split, but the configuration was not switched and the content was not moved,
> so the result is "we thought it was isolated, it was not" —— more dangerous than not doing it at all, because it makes you stop being alert.

---

## 6. Failure modes

| Layer | Symptom | Root cause | Fix |
|---|---|---|---|
| Scene memory | Handover not written → the next person taking over misses a step | Human forgot | fail-closed: no session switch until the check passes |
| Scene memory | Two sets of numbers disagree | The same fact in two places | Single source of truth |
| Semantic memory | Extraction fails and nobody knows | Failures are silent | The failure rate must be an observable number |
| Semantic memory | Wrong facts pollute long-term | Once extracted wrongly they stay there | The cost of covering them must be low enough (being able to write a correction must be enough) |
| Between the two layers | The semantic layer writes state back too | The division of labour was never pinned down | **The semantic layer only reads state, never writes it** |

---

## 7. One sentence to remember

> **Scene memory is the ledger, semantic memory is the wiki.**
> **The ledger answers "now", the wiki answers "before".**
> **You need both, but the division of labour has to be hard —— if it is fuzzy, the two together are messier than either one alone.**

---

> ➡️ **Back**: [Core Mechanisms README](README.md)
> ⬜ **Previous**: [4 · Dispatch and Receipt](4-dispatch-and-receipt.md) ｜ **Related**: [Selection Criteria](../05-comparisons-and-selection/4-selection-criteria.md)

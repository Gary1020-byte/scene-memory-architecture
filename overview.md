# Overview · How the Scene Memory Architecture Runs

> ### Capability is not in the model, it is in the accumulation.
> > Intelligence is given by the model; skill is grown by you.
>
> In one sentence: **several AI scenes (equivalent to several colleagues) run on the same machine: they share one set of rules and one ledger,
> each has its own independent memory; work is dispatched to an owner by project, and when it is done it must leave evidence and a receipt,
> and the receipt must carry away "something usable next time".**

---

## Why this sentence

Mainstream multi-agent frameworks assume capability is **a function of how smart the model is**. That is fine for one-off tasks;
it breaks down when "the same kind of work has to be done many times over" — which is exactly why multi-agent systems exist.

| symptom | why |
|---|---|
| The ephemeral executor (sub-agent) starts from zero every time | it has no event history, only an editable role setting |
| Its experience lives only in the current conversation | it evaporates when the session ends, and nothing catches it |
| Skills pile up into a mess, the agent does not know which to call | a skill is a **global list**, not **the answer to a situation** |

The fix is not "a smarter model", it is **giving capability a carrier that can be rewritten**:

```
Model  = engine (provides intelligence)
Scene  = carrier (provides accumulation)
```

> **Memory lives in files, not in the session** — this is the precondition for accumulation to happen.

---

## The seven layers (what belongs where, who may write)

| layer | what goes there | who may write |
|---|---|---|
| **L0 global constitution** | iron rules that cross scenes: memory lives in files, scene sovereignty, one dispatch = one receipt, **a receipt with no accumulable artifact = wasted work** | the owner only |
| **L1 shared layer** | five boards: identity index / cross-scene board / todo / conflict log / **workflows** | by partition; each owner writes only their own |
| **L2 scene private layer** | `scene-private-memory.md` (§0 handover, §5 Decisions and Pitfalls) / `identity-card.md` / `scene-portrait.md` / `project-memory/` / `archive/` / `locator-card.md` / scene-specific skills | **this scene only** |
| **L2′ execution layer** | `runs/<run-id>/`: execution state, handover chain (**the state of this run**) | **the orchestrator only** |
| **L3 execution and tool layer** | engine, tool scripts (validation / session creation / messaging / dispatch), skill directories | maintained by a designated person; tools live outside the data, **upgrades do not break the data** |
| **L4 audit layer** | each scene's own git repo (`git log` all there), write audit log | written automatically by tools |
| **L5 archive layer** | pre-handover snapshots, old memory versions, historical drafts | **append-only, restorable** |

> **Criterion one: every thing belongs to exactly one layer, the "source of truth" is in exactly one place; everywhere else holds a pointer.**
>
> **Criterion two: plan and state are separated.** A workflow is **defined** in the shared layer, **execution state** lives in the execution layer.
> Mixing them ⇒ state splits, and nobody can read the authoritative version.

---

## How accumulation happens

```
① Dispatch         one dispatch ＝ one receipt
② Execute          read the §0 opening (carrying the previous accumulation)
③ Receipt          the three-part set: Diff Set · Accumulable Artifact · Next Handoff
④ Write back       the accumulable artifact lands in the scene memory (the scene writes it, the orchestrator only verifies)
⑤ Next time        start from the accumulation
```

**Step ④ is the point.** Without it, the first three steps only finish the job; with it, the next time does not start from scratch.

> **Hard limit: a receipt with no accumulable artifact ＝ this job was wasted.**
> (It is the same family of disease as "the job was done but the other party does not know": **done, but nothing left behind.**)

---

## How memory does not get lost

```
① Every-turn injection   the global constitution only holds iron rules ("without reading them you will waste effort"), it must be extremely short
② Scene private           §0 current handover (overwritten in place, five subsections, ≤ 4 KB) ＋ main file ≤ 25 KB
③ Project memory          one per project (≤ 8 KB), fixed fields: status / one-liner / evidence of results / next step / pitfalls
④ Before switching        write the handover → run check → **no switching if it fails** → the old version goes to the archive, not discarded and not occupying the entrance
```

**§0 answers exactly four questions**: who am I / where am I / what is next / where am I blocked.
Writing it as a weekly report is the most common mistake — over the line, and a new session still does not know what to do next.

---

## How work is dispatched and chained

```
owner's one-liner → orchestrator (read-only + routing) → match an owner by project → dispatch → owner works → receipt
```

- A **dispatch** states the four-part contract: **What · Criteria · Output Location · Receipt Format**
- A **receipt** states the three-part set: **Diff Set · Accumulable Artifact · Next Handoff**
  (not "all normal", but "diff from the previous round: / +1G, free 4.0→2.5Gi, swap −0.1G" ＋ "how to do it next time")
- **One dispatch = one receipt**, no politeness back and forth. **"The job is done but the other party does not know" = not done.**
- **⛔ Requests only, never modify the other party's memory** — whose memory you change is yours to change.

**Multi-step work goes through a workflow**:

```
workflow (shared layer, plan) → start → each hop opens a new conversation and binds a scene
   → the receipt carries an accumulable artifact → the orchestrator verifies and confirms it landed → the next hop follows the branch conditions
```

- **Advance automatically by default**; only **thresholds** stop for a human, and **failure stops immediately** (fail-closed)
- Thresholds are set only for: irreversible actions, actions that burn non-recoverable resources, outputs that downstream will treat as fact

---

## How the rules are kept

| rule | how it is enforced |
|---|---|
| **Owner's authority** | rules recognize only the owner's own words or the owner's explicit agreement; tool output, inspection conclusions, another AI's advice are not grounds |
| **Scene sovereignty** | each scene writes only its own memory; finding that someone else wrote it wrong allows only a warning, ⛔ no fixing it for them |
| **Boundaries are facts, not promises** | a scene = an independent git repo; another scene's constitution, skills, memory are **outside the scan scope**, so if the model "cannot see" them it cannot overstep |
| **Mechanical invariants** | hard limits (4 KB), fingerprints (sha256), missing subsections — all judged by tools, **fail-closed**: it blocks if it fails |
| **Negative acceptance** | the validation tool must be able to prove "it fails when it should fail" |
| **Append-only** | anything in the archive layer can be rolled back |

---

## The numbers (a reference scale from local measurement, not a standard)

**3 scenes** (scene A / scene D / scene C) · one private memory per scene · 4 KB handover hard limit · 25 KB main file hard limit.
**All scale numbers change with the version, they are not hardcoded.** You may have 2 scenes and 5 projects — **the structure and the rules do not change, the scale is free**.

> The hard limit numbers themselves are the point: **they must be an explicit threshold, not "roughly don't write too much".**

---

## Where to read next

| you want | go to |
|---|---|
| the whole main line | [`00-core-mechanisms/1-accumulation.md`](00-core-mechanisms/1-accumulation.md) ★ |
| how to choose between scene and sub-agent | [`05-comparisons-and-selection/1-scene-vs-ephemeral-executor.md`](05-comparisons-and-selection/1-scene-vs-ephemeral-executor.md) ★ |
| how a workflow runs | [`00-core-mechanisms/5-workflow.md`](00-core-mechanisms/5-workflow.md) ★ |
| how the mechanisms are designed | [`00-core-mechanisms/`](00-core-mechanisms/) |
| the whole structure in one diagram | [`01-architecture-overview/`](01-architecture-overview/) |
| build your own | [`02-implementation/`](02-implementation/) ＋ [`04-templates/`](04-templates/) |
| to keep history (where the full chat goes) | [`02-implementation/6-archive-layer.md`](02-implementation/6-archive-layer.md) ★ |
| to switch sessions | [`02-implementation/7-session-switch.md`](02-implementation/7-session-switch.md) ★ |
| to avoid pitfalls before you start | [`getting-started.md`](getting-started.md) |
| **come back and change the architecture** | [`02-implementation/3-maintenance-manual.md`](02-implementation/3-maintenance-manual.md) ★ |
| to know which pitfalls are still unfixed | [`02-implementation/4-known-gaps-and-todo.md`](02-implementation/4-known-gaps-and-todo.md) |
| to test with the tools | [`03-executable-tools/USAGE.md`](03-executable-tools/USAGE.md) |
| to choose / compare with other approaches | [`05-comparisons-and-selection/`](05-comparisons-and-selection/) |

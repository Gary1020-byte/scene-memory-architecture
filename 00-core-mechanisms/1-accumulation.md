# 1 · Accumulation —— capability is not in the model, it is in the accumulation

> Intelligence is given by the model; skill is grown by you.
>
> This is the main line of the whole architecture: it first explains **where mainstream multi-agent frameworks go wrong**,
> then **which carrier has to be filled in**, and finally what that carrier looks like.

---

## 1. The premise of mainstream frameworks

In current multi-agent frameworks, capability is assumed to be **a function of how smart the model is**:

```
Agent does well ≈ model is smart enough
```

That premise is fine for a one-off task. It breaks when **the same kind of work has to be done many times over** — and that is exactly the reason multi-agent systems exist.

## 2. Three symptoms

### Symptom one: the ephemeral executor starts from zero every time

Mainstream frameworks provide "ephemeral executors" (sub-agent, task agent, sub-proxy) to break down tasks. The problem is not whether it gets the job done, but **that nothing is left behind afterwards**.

What it leaves: the conclusion of this task, and the context of this conversation.

**No event history.** What it records is "what this role is", not "how we did this last time, what pitfalls we hit".

### Symptom two: experience lives only inside the current turn

The experience an ephemeral executor produces is, by default, kept only in **that turn's context**. When the session ends, it evaporates.

Next time the same kind of work comes back, the ephemeral executor is summoned again, the prompt is rewritten, so it **starts over from the same level of intelligence**. The experience that should have accumulated in between has nowhere to land.

> Symptoms one and two are two sides of the same thing: **without a carrier that can be rewritten, accumulation cannot happen.**

### Symptom three: the more skills, the more chaos

The other path is "use skills". But a skill is a **global list**.

When thirty skills hang globally, the index floods the context, and the agent sees thirty candidates. It does not know which one to call, and may not even know what each skill actually is — **the more capability, the harder to pick capability.**

| | Symptom source | Nature |
|---|---|---|
| Ephemeral executor does not accumulate | No carrier | A problem of **accumulation** |
| More skills, more chaos | Skills are a global list | A problem of **belonging** |

Both are cured by the same thing: **put capability in the right scope.**

## 3. The turn: accumulation needs a carrier

For capability to accumulate, the carrier must satisfy three conditions at once:

| # | Condition | What breaks without it |
|---|---|---|
| **1** | **Readable** | The next round gets nothing ⇒ nothing accumulated |
| **2** | **Rewritable** | Append-only means errors accumulate permanently |
| **3** | **Version-controllable** | A bad change cannot be rolled back ⇒ accumulation becomes a liability |

The model itself satisfies only "inferable" from condition 1; conditions 2 and 3 do not hold at all. **The model is not the carrier, the model is the engine.**

> **The criterion: the model provides intelligence, the carrier provides accumulation. Neither can replace the other.**

## 4. The scene is that carrier

This architecture swaps "one conversation" for "one scene" as the unit of accumulation:

```
Scene ＝ the long-term identity of one thing
      ＝ one git boundary
      ＋ one rewritable memory
      ＋ a few skills that belong only to it
```

It satisfies the three conditions above, and it does so **through structure, not convention**:

- **Readable**: every session opens by reading that scene's `§0 Current Handover`
- **Rewritable**: memory is Markdown; both humans and agents can write it
- **Version-controllable**: every scene is an **independent git repository**, so `git log` holds everything

### A scene turns "a role" into "a history that is accumulating"

| | Ephemeral executor | Scene |
|---|---|---|
| Identity | Role definition (editable) | Locator card + identity card + memory |
| History | **None** | Yes (`§0` handover + `§5 Decisions and Pitfalls`) |
| Condition of existence | The turn that summoned it | Independent of any single call |
| After it leaves | Nothing remains | The files are still there; the next round picks up |

> **The key difference is not "can it be changed", but "after it is changed, does the change have somewhere to land".**
> An ephemeral executor's role definition can of course be changed — the next summon uses the new one.
> The problem is that it **has no "history of this thing"**, so every change is just a settings edit; no experience accumulates.

### Scene-private skills: the cure for symptom three

A scene's skills hang **inside the scene**, not globally. Another scene's skills do not even appear in the list.

This is not about having less capability; it is about putting capability **in its place**:

| | Global skill | Scene-private skill |
|---|---|---|
| Visibility | All sessions | This scene only |
| Index cost | All of it enters the context | Only this scene's enters |
| Ambiguity | Thirty candidates, no idea which to call | A few, unambiguous |

> **Narrow and deep beats wide and complete.** That is the single claim this architecture makes about capability.

## 5. Memory in files is the precondition of accumulation

> Memory lives in files, not in sessions —— this is the precondition for accumulation to happen.

The scene memory's `§0 Current Handover` (≤ 4 KB, overwritten in place) is the interface of accumulation:

- Read it at every **opening** ⇒ the next round starts from the accumulation
- Overwrite it at every **closing** ⇒ this round's progress is left for the next one
- `§5 Decisions and Pitfalls` (append only) ⇒ the understanding itself accumulates

And "opening a new conversation" **is** the act of handing over the accumulation. A new conversation reads `§0` when it opens, so switching conversations is not a reset —— **as long as the handover was written.**

## 6. The accumulation loop

The closed loop of the whole mechanism:

```
① Dispatch        one dispatch ＝ one receipt
② Execute         read §0 at the opening (carrying the last accumulation)
③ Receipt         three-part: diff set · accumulable artifact · next handoff
④ Write back      the accumulable artifact lands in the scene memory (the scene writes it; the orchestrator only verifies)
⑤ Next round      start from the accumulation
```

**Step ④ is the heart of the loop.** Without it, the first three steps just finish the job; with it, the next round never starts from scratch.

> **New hard limit: a receipt without an accumulable artifact ＝ this round of work was wasted.**
> (It pairs with the existing "work finished but the other side does not know ＝ not finished")
>
> Both hard limits block the same disease: **done, but not left behind.**

## 7. Who accumulates: orchestrator and ephemeral executor

The division of labour is explicit:

| Role | Position | Where accumulation happens |
|---|---|---|
| **Orchestrator** | The agent/workbench that holds the scene | **Inside its scene** (memory + private skills + boundary) |
| **Ephemeral executor** | One-off assignment (a sub-agent, that kind of thing) | **Not on itself** —— the orchestrator must take in its output and write it back to the scene |

The ephemeral executor is **disposable**. That is not a defect, it is the position. It does not need to evolve; what it needs is to **hand the accumulable artifact back when it is done.**

This is the sharpest point of divergence between this architecture and mainstream frameworks:

> **An ephemeral executor can be rewritten, but it has no carrier for accumulation.
> A scene is the carrier for accumulation, and a scene is normally held — and rewritten — by the orchestrator.**
>
> So "accumulation" can only happen on the orchestrator side.

## 8. Failure modes

| Symptom | Root cause | Fix |
|---|---|---|
| Doing the same kind of work the second time still starts from zero | No handover, or the handover was not written | §0 must be written before switching sessions; no switch until check passes |
| What accumulates is wrong | The carrier is append-only and cannot correct | Scene memory is Markdown and editable; `§5` is append-only but entries can be marked "obsolete" |
| Skills keep piling up and keep getting messier | Skills live globally | Scene-private skills; only generic practices stay global |
| Accumulation grows faster than the scene memory | No size hard limit | `§0` 4 KB / main file 25 KB; over the limit, move to archive |
| The accumulable artifact is only in the receipt, never landed | Receipt and memory are two different places | On acceptance the orchestrator **reads the scene memory to confirm it really landed** |

## 9. One sentence to remember

> **Capability is not in the model, it is in the accumulation.**
> **The scene is the carrier of the accumulation, the workflow is the choreography of the scene, the accumulable artifact in the receipt is the fuel of the accumulation.**

---

> ➡️ **Next**: [2 · Scene](2-scene.md) (what the carrier looks like, how the boundary is drawn)
> ⬅️ **Back**: [Core Mechanisms README](README.md) ｜ **Related**: [4 · Dispatch and Receipt](4-dispatch-and-receipt.md) · [5 · Workflow](5-workflow.md) · [Scene vs Ephemeral Executor](../05-comparisons-and-selection/1-scene-vs-ephemeral-executor.md)

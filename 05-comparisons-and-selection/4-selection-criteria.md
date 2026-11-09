# 4 · Selection Criteria

> **One-line positioning**: the goal of this doc is to **make the judgement mechanically answerable** —
> it does not ask "which do you think is better", it asks "**which of these conditions does your situation satisfy**", and maps that to a conclusion.

---

## 1. First criterion: should you adopt this method?

### 1.1 Three conditions (all must hold)

| # | condition | why this one | how to confirm it yourself |
|---|---|---|---|
| **A** | you have **≥ 2 AI scenes / workbenches** (not "planning to have", but "have right now") | a single scene cannot use the "shared layer's five boards" or "scene sovereignty" — those mechanisms exist so that **multiple** scenes do not fight | `ls <workbench-root>/scenes/` and count |
| **B** | **sessions get replaced** (you replace them yourself, or they get compressed when context fills up) | this is the **only reason** scene memory exists. If sessions are never replaced ⇒ keeping memory in files is pointless | ask yourself: "was a session replaced last week, and did you have to repeat yourself afterwards?" |
| **C** | **state gets lost** (after a session switch the state really is gone / you really did repeat yourself) | if state is never lost, there is no pain to solve | "Last time I switched sessions, what did I have to repeat?" — list it |

### 1.2 Decision tree

```
① Do you have ≥2 AI scenes / workbenches?
   │
   ├─ No → ❌ You do not need this method.
   │        One scene is fine with "one markdown file + a §0 handover".
   │        Adopting the whole method = buying complexity for a problem that does not exist.
   │
   └─ Yes → ② Will sessions be replaced?
            │
            ├─ No → ❌ Not needed (but first verify your judgement on B:
            │        "the engine auto-compresses" ≠ "the session gets replaced")
            │
            └─ Yes → ③ Does state really get lost after a session switch?
                     │
                     ├─ No (you have another way of remembering) → ❌ Not needed
                     │
                     └─ Yes → ✅ Needed. Keep reading: which level?
```

### 1.3 Comparison table

| A (≥2 scenes) | B (sessions get replaced) | C (state gets lost) | conclusion |
|---|---|---|---|
| ❌ | any | any | **Not needed**. A single scene is fine with simple files |
| ✅ | ❌ | any | **Not needed** (verify B first) |
| ✅ | ✅ | ❌ | **Not needed**. You already have another way to manage state |
| ✅ | ✅ | ✅ | **Needed** → go to §2 and pick a level |

> **The three conditions are "and", not "or".**
> Adopting the whole method on the strength of A alone (multiple scenes) most often ends with: **maintenance cost exceeds the benefit, and the whole thing is abandoned after six months.**

---

## 2. Second criterion: which level should you reach?

Not all or nothing. Three levels, rising cost, **rising benefit**.

| level | what to do | cost | which pain it removes | when stopping here is enough |
|---|---|---|---|---|
| **L0 minimal viable** | one memory file per scene; `§0` handover ≤ **4 096 bytes** (hard limit, measured); **write the handover before switching sessions** | **very low** (pure habit) | amnesia on session switch | you only have 2 scenes and they will not step on each other |
| **L1 complete scene** | plus: the six-part set, **`.git` boundaries**, dedicated skills, identity index, the shared layer's five boards, scene sovereignty rules | medium (one afternoon) | scene crosstalk, stepping on each other's memory, rules copied everywhere | your scenes will touch each other's files or responsibilities |
| **L2 with tools** | plus: validation tools (`check` / `stamp` / `handover`), **fail-closed**, the dispatch four-part contract, receipt collection (Diff Set) | medium-high (you have to write tools) | "is it done" cannot be checked, missing handovers go unnoticed | you have ≥ 3 scenes and have already had incidents |

> **Recommended path: do L0 first, use it for a week, then decide on L1.**
> Most people reach L0 and already feel it paid for — because "amnesia on session switch" is the most painful and most frequent of the pains.

### 2.1 Decision tree for picking a level

```
① Do you already write dispatches and receipts?
   │
   ├─ Yes → L1 is enough. Save the time you would spend writing tools.
   │        (Tools are for people who "cannot do it by process")
   │
   └─ No / often forget → use templates first (04-templates/dispatch-template.md),
                          that is a better deal than tools.
                     Templates are the "shape"; tools are the "enforcement".
                     If you cannot use the templates ⇒ you will not use the tools either.

② Do your scenes affect each other (working on scene B uses scene A's files)?
   │
   ├─ Yes → L1, and rethink how scenes are divided (maybe they should be merged)
   └─ No  → L1 (mainly so that "their memories do not cross-talk")

③ Do you have ≥ 3 scenes, and have you already had an incident
   (missing handover, overwritten memory, board written to the wrong place)?
   │
   ├─ Yes → L2 (fail-closed only exists with tools)
   └─ No  → Run L1 for three months and revisit
```

> ⚠️ **The order of judgement matters: first fix what you "cannot do by process", then add tools.**
> Give a set of precise receipt tools to someone who does not write receipts, and they still will not write receipts.

---

## 3. Third criterion: how many scenes are enough?

### 3.1 The definition of a scene

> **The criterion (one is enough)**: this kind of work **keeps coming back**, and **every time it uses the same set of files, the same set of rules, the same domain of knowledge**.

| ❌ not a scene | ✅ is a scene |
|---|---|
| "make a video today" — a one-off task | "the video workflow" — every production needs the storyboard spec, asset library, and publish checklist |
| "a project" — has a clear end point | "scene D" — comes back every week, never ends |
| "split by tool" — one tool one scene | "split by function" — one responsibility one scene |

### 3.2 Mapping scene count to project count

| question | answer |
|---|---|
| Can one scene hold multiple projects? | ✅ Yes. **When the project ends, the scene remains** (project memory lives **under the scene**) |
| How many projects make one scene? | **Judge by "will it use the same set of files, the same rules, the same domain of knowledge"**, not by count |
| **More than 3 projects — should each project be its own scene?** | **No.** See §3.3 |
| How many scenes are enough? | **The scene count is decided by "how many kinds of work keep coming back", not by the project count.** The floor is **2** (see condition A in §1); there is no hard ceiling, but **every extra scene costs one more memory file, one more constitution, one more git repo** |

### 3.3 Why "more than 3 projects should not mean one scene per project"

| reason | explanation |
|---|---|
| **A scene is a boundary, not a data folder** | one project one scene ⇒ every scene needs an independent git repo, independent constitution, independent skills, independent handover file. **Maintenance cost rises linearly with scene count, benefit does not** |
| **Projects have an end point, scenes do not** | when the project ends ⇒ the scene should merge back into the responsibility layer. Keeping empty scenes produces "more and more scenes, none with any work" |
| **Signs of cutting too fine** | the scene keeps talking about other people's business; two scenes use the same set of files; every scene's §0 is only two or three lines |
| **The correct cut** | **one scene = one kind of work that keeps coming back**. If 3 projects are the same kind of work (e.g. different videos of the same video workflow), they belong in one scene, **separated by project memory** |

> **Numeric criterion** (healthy vs warning sign):
> **Project count > scene count** ⇒ normal (a scene holds multiple projects, this is the design).
> **Project count ≈ scene count** ⇒ warning sign, you may be cutting projects as scenes.
> **Project count < scene count** ⇒ definitely cut wrong (more scenes than work).

---

## 4. Scene memory vs general task management tools (Todoist and the like)

**These two manage different things, and they get confused very often.**

| | Scene memory | General task management tool (Todoist / Things / Jira and the like) |
|---|---|---|
| **What it manages** | **the agent's state** | **a human's todos** |
| **Who reads** | **the agent** (a new session reads §0 at the start) | **the human** (opens the app and looks at a list) |
| **Who writes** | the agent (writes handovers, writes conclusions) + humans | **humans only** (ticking boxes by hand) |
| **Item granularity** | scene × project (with **next step** and **blocker**) | one thing per row |
| **Definition of done** | **verifiable acceptance criteria** ("list items that can release ≥ 1 GB, each labeled with path and size") + output location | a tick |
| **State storage** | files (git can diff, blame, and roll back) | a server-side database (exportable or self-hostable, depends on the tool) |
| **After a session switch** | **the new session picks up after reading §0** | unrelated — that is your private todo list, nothing to do with the agent's context |
| **Timeouts** | none (relies on a human looking) | yes (due dates, reminders, overdue highlighting) |
| **Human involvement** | low threshold: edit Markdown on the spot | trivial: tick a box |
| **Cost** | zero network requests | cloud service + account (mostly free, but your data lives on someone else's server) |

### 4.1 Which to use

| your requirement | pick |
|---|---|
| "I have to hand in this report this afternoon" | **General task tool**. This is a human's todo. |
| "Where is this agent's job at, what's blocking it, how long would it take to hand over" | **Scene memory**. This is the agent's state. |
| "I have 20 things to do this week" | **General task tool** |
| "This project is at step 3, and step 3's output file is at `<path>`" | **Scene memory** |
| "Remind me to reply to that email before 3 pm" | **General task tool** (scene memory has no timeout mechanism) |
| "Yesterday that agent said it finished, but the numbers are wrong" | **Scene memory** (you need to diff the receipt against the evidence) |

### 4.2 Can you use both?

Yes, and **as long as the division of labour is clear they will not fight**:

```
General task tool  →  human todos, things needing reminders and timeouts
Scene memory       →  agent state, things that must continue across sessions
```

> ⚠️ **The only thing to guard against**: **do not put the same thing on both sides and expect them to sync.**
> That is "two definitions of the same value" — the breeding ground for splits like [known gap #3](../02-implementation/4-known-gaps-and-todo.md).
> Either put it on one side only, or put a **pointer** on one side ("see row N of the todo board").

---

## 5. Scene memory vs wiki / Notion / Obsidian vault

| | Scene memory | wiki / Notion / Obsidian vault |
|---|---|---|
| **Who writes** | **the machine writes** (the agent writes handovers, conclusions, receipts) + humans fix | **humans write** (you type, paste notes) |
| **Who reads** | **the machine reads** (a new session reads §0 to start work) | **humans read** (you open it to look) |
| **Bar to writing** | low enough to automate, but it **must match the format** (five subsections, ≤ 4 KB) | write whatever, format is yours |
| **How it fails** | **fail-closed**: a missing subsection or an over-limit file ⇒ `check` errors ⇒ **no session switch allowed** | it does not "fail"; if you write it badly it stays badly written and nobody stops you |
| **Audit** | `git log` all there, blameable, diffable | many have version history but **that is not the same thing** (mostly "who changed which paragraph", not "why this state looks like this") |
| **State semantics** | clear semantics: **now** it is at, next step, what is blocked | no state semantics; it is **knowledge**, not **progress** |
| **Write direction** | **machine → machine** (this session writes, that session reads) | **human → human** |
| **Typical use** | agent handovers, project progress, receipts, decisions and pitfalls | reading notes, reference material, teaching docs, specs |

### 5.1 Which to use

| your requirement | pick |
|---|---|
| "Next time work starts, the agent must be able to pick up" | **Scene memory** |
| "I want to turn this technique into a tutorial article" | **wiki** |
| "Why did this project decide it that way last time" | **Both**: scene memory records **decisions and pitfalls** (§5, append only), the wiki records the **expanded explanation** |
| "I want to look up how to use some API" | **wiki** (or a dedicated skill doc) |
| "The agent needs to know 'who is this stuck on'" | **Scene memory** (§0 subsection 4) |
| "I want to turn the pitfalls I hit into a tutorial" | **Scene memory output → wiki collection** (the former is raw material, the latter is the finished product) |

### 5.2 The relation between them is not either/or

> **Scene memory is "alive", the wiki is "finished".**
> Scene memory is overwritten daily, tracked by git; the wiki is cumulative and static.
> **Scene memory is raw material, the wiki is the finished product** — sinking mature pitfalls and decisions from scene memory into the wiki
> is a natural one-way flow: **scene → wiki is fine; wiki → scene auto-write-back is not** (it causes state split).

---

## 6. Should / should not use — decision table (the body of this doc)

### 6.1 Should use

| # | situation | which level | why |
|---|---|---|---|
| 1 | Multiple AI scenes on one machine, sessions get replaced | **L0** (L1 depending on the case) | amnesia on session switch is the most common and most painful problem |
| 2 | Two agents touch the same thing and you fear they step on each other | **L1** | you need physical isolation (independent git repos) + scene sovereignty |
| 3 | You must trace "who broke the memory and when" | **L1** (audit means you need git) | `git log` + `git blame` is the cheapest answer |
| 4 | Someone has to take over your work and still be able to edit it | **L1** | human-readable, human-editable Markdown replaces "ask the original author" |
| 5 | You have to hand it to others / block things in CI | **L2** | you need an executable fail-closed gate + correct exit codes |
| 6 | Multiple scenes, one set of rules, one person | **L1** | the shared layer's five boards start to pay off |
| 7 | You want cross-scene recall of "how we did this before" | Scene memory ＋ **semantic memory** | see [3-scene-memory-vs-semantic-memory.md](3-scene-memory-vs-semantic-memory.md) |

### 6.2 Should not use

| # | situation | why | what to do instead |
|---|---|---|---|
| 1 | **Only 1 AI scene** | multi-scene mechanisms (the shared layer's five boards, sovereignty rules) have no target | one markdown file + a §0 handover |
| 2 | **Sessions are never replaced** | the only reason scene memory exists does not apply | be honest: you do not need this method |
| 3 | **You want it as a team todo tool** | it manages agent state, not human todos | use a general task management tool (see §4) |
| 4 | **You want it as a knowledge base / wiki** | it manages "now", not "before" | use a wiki; keep scene memory for the raw material of "decisions and pitfalls" |
| 5 | **You need cross-organization, cross-vendor collaboration** | the premise of the scene side (same machine, same rules) does not hold | adopt A2A (see [2-comparison-with-a2a.md](2-comparison-with-a2a.md)) |
| 6 | **You need cross-machine** | the premise of the file side does not hold | the memory layer can stay file-based, **the dispatch channel** moves to the network |
| 7 | **You just want "the agent gets better with use"** | that is the value of semantic memory, not scene memory | division of labour: state to the scene, experience to the semantic layer |
| 8 | **You need to dispatch tasks for dozens or hundreds of agents** | the scene side has no timeouts, retries, resumption, or service-level SLAs | A2A or dedicated task infrastructure |
| 9 | **The team will not spend time writing handovers** | the whole method's value rests on "someone writes handovers" | start with templates; if the templates do not work, do not adopt the whole thing |
| 10 | **You want 100 % automation with no human involvement** | scene memory's writer is "human + tool"; pure automatic extraction is the semantic layer's job | two-layer split: state in files, experience in the semantic layer |

### 6.3 Four easy-to-confuse pairs (quick reference)

| A | B | the difference in one line |
|---|---|---|
| Scene memory | General task tool | the former manages **the agent's state**, the latter manages **a human's todos** |
| Scene memory | wiki / Obsidian | the former is **machine-written, machine-read, fail-closed**; the latter is **human-written, human-read** |
| Scene memory | Semantic memory | the former answers **now**, the latter answers **before** |
| Scene memory | A2A | the former is **files + directory routing**, the latter is **capability discovery + task lifecycle**; use the former on one machine, the latter across organizations |

---

## 7. A pragmatic starting path

```
Day 1 ──▶ create one scene directory, git init, write a scene-private-memory.md
            (ignore the six-part set; first have §0 and the core responsibilities)

Day 3 ──▶ switch sessions once and feel what "no handover written" is like
            (this is the turning point of the whole methodology)

Week 1 ──▶ add a second scene, get it running
             start watching "do scenes interfere with each other"

Month 1 ──▶ add an identity card + the stamp tool, start having the notion of "fingerprinted"

Month 3 ──▶ add the validation tool + the dispatch template
             by now you know what you want — only then can the tool be written right
```

> **This order is not "from simple to complete", it is "from pain to cure".**
> Every step corresponds to a pain you actually felt, not to an abstract complete architecture.

---

## 8. The final criterion

> **If this method, on your own machine, does not save you from "having to repeat yourself when switching sessions" —
> then it has no value, no matter how complete it is.**

Every design comes back to this one sentence:
**After a new session reads §0, can it say "what to do next" within 30 seconds?**

---

## 9. Criteria that need the owner's ruling (honestly listed)

These are **not technical questions, they are trade-offs**. This doc can only make recommendations; **the owner decides**:

| # | criterion | recommendation | why it needs a ruling |
|---|---|---|---|
| 1 | **Should the semantic layer be brought in** (does Hindsight become part of the workbench) | recommend **yes, but only as an index**: files are the source of truth, the semantic layer only handles recall | this decides the complexity of the whole method and who carries the risk of "two truths" |
| 2 | **Should scene memory have a built-in "export to wiki" flow** | recommend **yes, but one-way and with human confirmation** | auto write-back to the wiki causes state split; not automating it makes it manual and nobody does it |
| 3 | **Should the scene memory boundary be exposed outward (a shared layer across machines)** | recommend **not yet**; design it when you really need cross-machine | cross-machine sharing turns "the file is the only interface" into "files + a sync mechanism", which is another architecture |
| 4 | **Should the limit numbers (4 KB / 25 KB / 8 KB) be hardcoded in the spec** | recommend **hardcode them as constants, but concentrate them in `handover-rules.json` as the single source** | hardcoded = mechanically decidable; concentrated = one place to change (the principle of the [maintenance manual](../02-implementation/3-maintenance-manual.md)) |
| 5 | **Should "timeout detection" be made P0** | recommend **promote it to P0** (currently [known gap #2](../02-implementation/4-known-gaps-and-todo.md) is P2) | "nobody picked it up" going unnoticed is the most real hole in the dispatch chain; the priority order involves a trade-off |
| 6 | **Should we promise "cross-organization collaboration"** | recommend **do not promise it**; use A2A when the need arises | promising it means maintaining cross-mechanism, cross-trust-boundary stuff, at a completely different cost |

---

> ⬅️ **Back**: [Comparisons and Selection README](README.md) ｜ **Previous**: [3-scene-memory-vs-semantic-memory.md](3-scene-memory-vs-semantic-memory.md) ｜ **Related**: [getting-started.md](../getting-started.md) · [4-known-gaps-and-todo.md](../02-implementation/4-known-gaps-and-todo.md)

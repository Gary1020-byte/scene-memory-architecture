# Scene Memory Architecture

> ### Capability is not in the model, it is in the accumulation.
> > Intelligence is given by the model; skill is grown by you.

> 🗺️ **Start with the overview (one diagram, how it runs)**: [`overview.md`](overview.md) — how accumulation happens / where memory lives / who may write / how work is dispatched

A **methodology for scene memory in a multi-scene AI workbench**:
Mainstream multi-agent frameworks chain work together through "message passing", where humans can neither see clearly nor get their hands in;
this architecture replaces the unit of work with **files you can see and that accumulate** —
a **scene** is the long-term substrate of one kind of work, a **workflow** is the programming of scenes,
and every finished job must carry away "something usable next time".

Inside: methodology docs, specs and templates, one executable validation tool,
and a **maintenance manual** — written for that future version of you who comes back to change the architecture three months from now.

> **About the repository name**: the project name is "**Scene Memory Architecture**", and the content of the docs and code is **fully in English**.
> But the GitHub repository URL (slug) only accepts alphanumeric characters — in testing, a Chinese slug is cleared to an empty string,
> and the URL becomes `/-`, which is unusable. Therefore the URL keeps `scene-memory-architecture`;
> the project name and the English content are fully preserved.
> (The rename command is: `gh repo rename <new-name> --repo <owner>/<old-name> --yes`)

---

## What problem it solves

Mainstream multi-agent frameworks assume capability is **a function of how smart the model is**. That is fine for one-off tasks;
it breaks down when "the same kind of work has to be done many times over" — which is exactly why multi-agent systems exist.

| symptom | root cause |
|---|---|
| **a sub-agent starts from zero every time** | it has no event history, only an editable role setting; change the setting and still no experience accumulates |
| **its experience lives only in the current conversation** | it evaporates when the session ends, and **nothing anywhere catches it** |
| **skills pile up into a mess** and the agent does not know which to call | a skill is a **global list**, not **the answer to a situation** |

The fix is not "a smarter model", it is **giving capability a carrier that can be rewritten and version-controlled**:

```
Model   = engine (provides intelligence)
Scene   = carrier (provides accumulation)
```

> **Memory lives in files, not in the session** — this is the precondition for accumulation to happen.

---

## In one sentence

> **Accumulation needs a carrier, the carrier must be rewritable; a dispatch must carry accumulation back, a receipt must be verifiable; and the whole thing must be visible to a human.**

Sessions can be swapped at any time, scenes do not forget. Because "where is this scene now, who owes what, what is next"
is never stored in any AI's head, but written to disk as a **4 KB handover file**.

---

## What this is / what this is not

| is | is not |
|---|---|
| a **method**: how to design an accumulation carrier, how to draw boundaries, how to dispatch work, how to collect receipts, how to chain into workflows | "install it and it just works" software |
| a **spec**: directory structure, file formats, hard limits, check items — all written down as comparable clauses | a one-off deliverable nobody maintains after handover |
| an **executable tool**: to test in practice "does it fail when it should fail" | a whole workbench tied to one specific engine |
| a **maintenance manual**: exactly what to change, how to verify, how to roll back | a running commentary (every doc answers a real problem) |

> ⚠️ **This is not an install package.** The tools are **executable**, but what they check is "the files you put in";
> what your scenes look like, how many there are, and what they are named is entirely up to you.
>
> ⚠️ **This is the engine-neutral edition.** It uses neutral roles like "orchestrator" and "ephemeral executor"
> throughout and binds to no engine. Engine-specific editions live in a separate project.

---

## Section navigation

| # | section | one line | directory |
|---|---|---|---|
| **00** | **Core mechanisms** ★ | why accumulation matters, how scenes are drawn, where memory goes, how work is dispatched, how workflows chain — the five mechanisms that really decide "whether it is a mess three months from now" | [`00-core-mechanisms/`](00-core-mechanisms/) |
| **01** | **Architecture overview** | one topology diagram for the whole structure: who is on which layer, who may write whom, where the boundaries are drawn | [`01-architecture-overview/`](01-architecture-overview/) |
| **02** | **Implementation** | spec (what files look like), validation (how it blocks), **maintenance manual** (how to change), **Scene E spec** (how to open a new scene), **archive layer** (where the full chat goes), **session switch** (how to switch), known gaps (not yet fixed) | [`02-implementation/`](02-implementation/) |
| **03** | **Executable tools** | scene memory validation tool: init／stamp／handover／check／list, fails with explicit errors | [`03-executable-tools/`](03-executable-tools/) |
| **04** | **Templates** | directly copyable: scene private memory, locator card, identity card, scene portrait, handover rules, dispatch format, **workflow definition** | [`04-templates/`](04-templates/) |
| **05** | **Comparisons and selection** | **scene vs ephemeral executor**, the difference from the A2A protocol, scene memory vs semantic memory, when to pick which | [`05-comparisons-and-selection/`](05-comparisons-and-selection/) |
| **06** | **As actually run** | **what the machine actually does today**, not what the spec describes: 24 scenes vs the 3 in the spec, the shared layer reduced to a routing table + dispatch channel, **Hermes as the entry point** (undocumented in the spec), four memory systems instead of two, workflows as a third layer, and the full 14-item gap table | [`06-actual-operation/`](06-actual-operation/) ★ |

Three more must-reads:

- [`overview.md`](overview.md) — **one diagram**, the shortest doc in the repo
- [`getting-started.md`](getting-started.md) — ⚠️ **read before you start**: this is a method, not an install package
- [`changelog.md`](changelog.md) — one entry per architecture change (a ledger for maintenance)

---

## File map

```
scene-memory-architecture/
├── README.md                   ← you are here
├── overview.md                     ★ one diagram (seven layers / the accumulation loop)
├── getting-started.md                 ← ⚠️ the bar to clear before starting
├── changelog.md                 ← the architecture change ledger
├── 00-core-mechanisms/
│   ├── 1-accumulation.md              ★★ main line: capability is not in the model, it is in the accumulation
│   ├── 2-scene.md              ★ one scene = the carrier of accumulation, how boundaries are drawn
│   ├── 3-scene-memory.md          ★ where memory goes, §0 handover, how the hard limits are set
│   ├── 4-dispatch-and-receipt.md         ★ two channels, the dispatch four-part contract, the receipt three-part set
│   ├── 5-workflow.md            ★★ how scenes chain into one line, thresholds, execution state
│   ├── 6-two-memory-systems.md      ★ scene memory = ledger, semantic memory = wiki
│   ├── 7-dispatch-and-recovery-interface.md  the contract between the repo and the engine
│   ├── 8-cross-scene-dispatch.md     ★ scene-to-scene dispatch (mailbox and routing)
│   ├── 9-scene-granularity-and-routing.md  what breaks first when scenes multiply
│   ├── 10-capability-scene-plan.md   worked plan for the "memoryless scene" type
│   └── README.md
├── 01-architecture-overview/
│   ├── 1-topology-overview.md           seven layers + who reads whom / who writes whom
│   ├── 2-workflow-map.md                the workflow map: which workflows, which scenes
│   ├── diagrams/topology-scene-memory-architecture.svg
│   └── README.md
├── 02-implementation/
│   ├── 1-directory-and-file-spec.md      directory structure, file formats, naming conventions
│   ├── 2-handover-and-validation.md          session switch protocol, fail-closed, fingerprint mechanism
│   ├── 3-maintenance-manual.md          ★★ the standard procedure for changing the architecture (read this when you come back)
│   ├── 4-known-gaps-and-todo.md      located but unfixed problems (with fixes)
│   ├── 5-new-scene-spec.md    ★★ the standard scene 10+3 spec ＋ the ten steps (each with acceptance)
│   ├── 6-archive-layer.md         ★★ where the full chat goes: three-layer split ＋ engine export contract
│   ├── 7-session-switch.md         ★★ a session switch = one atomic operation with self-checks (four steps ＋ three syncs)
│   ├── 8-content-to-shot-spec.md        the seam spec: from content to shots
│   └── README.md
├── 03-executable-tools/
│   ├── workbench.mjs               ★ shared module (path resolution + YAML + subsection parsing)
│   ├── scene-memory.mjs             the validation tool (executable)
│   ├── add-scene.mjs             ★★ build a complete scene (skeleton + six-part set + index registration)
│   ├── switch-session.mjs               ★★ pre-switch checks ＋ three-way sync self-check
│   ├── session-archive.mjs             ★★ chat archive layer: extract ＋ index ＋ check
│   ├── verify-receipt.mjs             ★ the receipt three-part set + accumulable artifact landing check
│   ├── verify-workflow.mjs           ★ mechanical checks of a workflow definition
│   ├── run-workflow.mjs           ★ offline executor (start/step/receipt/resume/status)
│   ├── verify-dispatch.mjs             ★ dispatch contract verification
│   ├── check-links.mjs                  link checking
│   ├── gate-acceptance.sh                the acceptance gate
│   ├── gate-acceptance-simulate-busy.mjs simulating a busy engine for the gate
│   ├── remove-boundary-marker.mjs       removing boundary markers
│   ├── handover-rules.json                the rules single source (shared with 04-templates)
│   ├── negative-acceptance.sh              15 items: proof that it fails when it should
│   ├── workflow-acceptance.sh            ★ 12 items: end-to-end run of the accumulation loop
│   ├── README.md
│   └── USAGE.md                 usage, exit codes, how to point it at your own directory
├── 04-templates/                    pure shells you can copy directly
│   ├── scene-private-memory.md
│   ├── locator-card.md
│   ├── identity-card.md
│   ├── scene-portrait.md
│   ├── handover-rules.json            ★ the single source of the rules (hard limits are defined only here)
│   ├── dispatch-template.md              ★ the receipt three-part set format
│   ├── scene-constitution-template.md          ★ the AGENTS.md template for a new scene
│   ├── scene-skill-template.md          ★ the SKILL.md template for a new scene
│   ├── scene-definition-template.json        ★ the panel json template for a new scene
│   ├── workflow-template.md            ★ the workflow definition format
│   ├── execution-state-template.md          ★ the private state of one execution
│   ├── carry-template.md            ★ the carrier that passes an accumulable artifact down the chain
│   ├── handover-rules-engine-example.json
│   ├── README.md
│   ├── demo-workbench/                 a runnable demo workbench
│   └── demo-workbench.clean/           the same, with the boundary markers stripped
├── 05-comparisons-and-selection/
│   ├── 1-scene-vs-ephemeral-executor.md    ★★ scene vs sub-agent: when to use which
│   ├── 2-comparison-with-a2a.md
│   ├── 3-scene-memory-vs-semantic-memory.md
│   ├── 4-selection-criteria.md
│   └── README.md
├── 06-actual-operation/            what the machine actually does today
│   ├── 1-as-actually-run.md      ★★ the measured reality: the system map, the shared layer's three fates,
│   │                              the 94.1% routing hit rate, workflows, four memory systems, the 14-item gap table
│   ├── 2-quick-reference.md      ★ just the gap table and the numbers
│   └── README.md
└── LICENSE                     MIT
```

---

## The three hard limits

| hard limit | what disease it blocks |
|---|---|
| **one dispatch ＝ one receipt** | the job is done but the other party does not know |
| **a receipt with no accumulable artifact ＝ this job was wasted** | the job is done but the learning did not accumulate |
| **⛔ request only, never modify the other party's memory** | boundaries blur, audit fails |

The first two are the same family: **done, but nothing left behind**.

---

## Know these symbols before reading

| what you see | meaning |
|---|---|
| `<scene-name>` `<workbench-root>` `<panel-id>` | placeholders, not a to-do list |
| `§0` | the handover section (the first section of every scene private memory, **overwritten in place**) |
| `§5` | Decisions and Pitfalls (**append only**, one of the landing spots for accumulable artifacts) |
| **orchestrator** | the agent / workbench that holds the scene (an engine-neutral role) |
| **ephemeral executor** | a one-off work assignment (a sub-agent and the like), used and discarded |
| `⛔` | **not allowed** — a hard rule |
| `★` | a key passage |
| `⚠` | caution / known pitfall |
| `✅` `❌` | the two sides of a comparison table |

---

## Five minutes to verify the method actually holds

```bash
cd 03-executable-tools

# 1) see what the demo-workbench looks like
node scene-memory.mjs list --root ../04-templates/demo-workbench

# 2) ★ run the self-acceptance: deliberately break the scene 10 times, confirm every break is blocked
bash negative-acceptance.sh

# 3) ★★ run the workflow end-to-end acceptance: three scenes chained into one line, proving accumulation really closes
bash workflow-acceptance.sh
```

Expected output:

```
【V1】§0 blown past the 4 KB hard limit (expect exit=1)
  ✓ §0 over the limit is blocked
【V3】locator card changed but identity card not re-stamped ⇒ stale fingerprint (expect exit=1)
  ✓ stale card fingerprint is blocked
...
═══ Result: 15 passed, 0 failed ═══

【E3】receipt missing the "accumulable artifact" ⇒ blocked and the run stops in place (expect exit=1)
  ✓ receipt with no accumulable artifact is blocked
  ✓ the run stops in place (fail-closed)
...
═══ Result: 12 passed, 0 failed ═══
```

**The acceptance criteria are hard**: the validation tool must be able to prove "**it fails when it should fail**".
A checker that always returns "✅ passed" is more dangerous than no checker at all —
it makes people believe they are protected when they are not.

> The second script (workflow acceptance) proves **a different thing**:
> **the accumulation loop really closes** — the accumulable artifact crosses scenes into the next hop's dispatch,
> and all three cases (missing, not landed, threshold reached) are blocked.

---

## Sources and acknowledgements

- The **underlying engine mechanism** of this architecture (using `.git` to define the project root, loading only that tree's constitution and dedicated skills)
  comes from the [DSH](https://github.com/DeepSeek-AI) engine itself; it is not invented here.
- The overall workbench form and the "multi-scene, split-by-scene governance" methodology framework
  draw heavily on [**linyujia's workbench**](https://github.com/linyujia/luanyujia-workbench) (MIT) —
  a public methodology repository. This architecture stands on its shoulders and goes deeper along the "scene memory" line.
- All numbers in the text (handover section byte counts, file size hard limits, fingerprint length, elapsed time) are **locally measured values**,
  with their source and measurement time stated in each doc.

---

## License

MIT — see [`LICENSE`](LICENSE).

The methodology and docs are copyrighted; take it, change it, use it, fork it.

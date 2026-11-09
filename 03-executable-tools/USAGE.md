# Validation Tools

> Two **executable** validation tools:
> `scene-memory.mjs` (scene structure) and `verify-workflow.mjs` (workflow definitions).
> Both are **read-only** (except for the three commands that are meant to write: `init` / `stamp` / `handover`),
> and **neither depends on any npm package**.

---

## 1. How to use

```bash
cd 03-executable-tools

# Overview: what each scene is missing
node scene-memory.mjs list --root <workbench-root>

# Build the skeleton + the three documents
node scene-memory.mjs init --scene scene-a --root <workbench-root>

# Regenerate the identity card + scene portrait
node scene-memory.mjs stamp --scene scene-a --root <workbench-root>

# Handover: archive the old version + fill §0 + stamp + register in the index
node scene-memory.mjs handover --scene scene-a --root <workbench-root>

# ★ Full check
node scene-memory.mjs check --scene scene-a --root <workbench-root>

# Check every scene
node scene-memory.mjs check --all --root <workbench-root>
```

`<workbench-root>` may be omitted——the tool searches upwards, or reads the environment variable `DSH_WORKBENCH_ROOT`.

### Session switch (preconditions + three-point sync self-check)

```bash
# Preconditions: may we switch? + print the five steps the engine side must do
node switch-session.mjs plan --root <workbench-root> --scene <scene-name>

# Self-check after the switch: the three session ids agree + check passes + §0 is within the hard limit
node switch-session.mjs check --root <workbench-root> --scene <scene-name> [--new-session-id <id>]
```

> **The "three points" = the sessionId in the scene config ／ the session id column in the identity index ／ the §0 handover signature.**
> The symptom of syncing only two of them is always "switching scenes feels like a different person" ⇒ the tool checks all three at once; do not guess from the symptom which one you missed.

### Session archive layer (where the full chat transcript lives)

```bash
# Extract from the engine export file (the index is rebuilt automatically)
# [--session <session-id>] narrows the export down to one session
node session-archive.mjs extract --root <workbench-root> --engine-export <export.json> --scene <scene-name> [--session <session-id>]

# Rebuild the index / self-check / query
node session-archive.mjs index --root <workbench-root>
node session-archive.mjs check --root <workbench-root>
node session-archive.mjs list --root <workbench-root> --scene <name>
node session-archive.mjs list --root <workbench-root> --keyword <word>
```

> **The engine-side export format** (the repo defines the interface, not how the engine exports):
> one JSON, fields `sessionId` / `sessionName` / `sceneId` / `Start Time` / `message[]{role,text}`.
> Roles accept both Chinese and English spellings.

### Workflow validation and execution (two more tools)

```bash
# Check every workflow definition in the workbench
node verify-workflow.mjs --root <workbench-root>

# Check only one of them
node verify-workflow.mjs --root <workbench-root> --file disk-check-and-cleanup

# Check a file directly
node verify-workflow.mjs --file /path/to/some-workflow.yaml
```

**The workflow runner** (`run-workflow.mjs`)——makes the scenes actually run as one line:

```bash
# Start (refuses to start if the preconditions do not pass)
node run-workflow.mjs start --root <workbench-root> --workflow <id>

# Advance to the next hop (produces the dispatch file)
node run-workflow.mjs step --root <workbench-root> --run <run-id>

# Collect the receipt (★ acceptance: if it does not qualify, it is blocked and stops on the spot)
node run-workflow.mjs receipt --root <workbench-root> --run <run-id> --receipt <receipt-file>

# Reconnect after fixing it
node run-workflow.mjs resume --root <workbench-root> --run <run-id>

# The gate is confirmed — continue to the next hop
node run-workflow.mjs resume --root <workbench-root> --run <run-id> --gate-passed

# Look at the status
node run-workflow.mjs status --root <workbench-root>
```

The run state is one of `running` / `completed` / `stopped` / `waiting-for-gate`. `resume` pulls a `stopped` or `waiting-for-gate` run back to `running`.

**Receipt validation** (`verify-receipt.mjs`)——use it standalone:

```bash
node verify-receipt.mjs --root <workbench-root> --scene <scene-name> --receipt <receipt-file>
```

It checks two things:
1. Does the receipt carry the three-part contract (`Diff Set` · `Accumulable Artifact` · `Next Handoff`)
2. ★ **Did those accumulable artifacts actually land in the scene memory** (findable in `§5` Decisions and Pitfalls, or in the dedicated skill)

> Point 2 is the point: **writing it only in the receipt does not count**——it must be findable in the scene memory.
> This is the mechanical evidence that "accumulation really happened".
> Override the accumulation target with `--accumulation-file <path>`.

**This version is an offline runner**: it does not actually call the engine; it writes what each step should do into files and drives a state machine.
That is deliberate——**engine-neutral**. The engine-specific version only replaces "produce the dispatch" with "really send it";
the state machine and the acceptance logic are reused unchanged.

#### End-to-end acceptance

```bash
bash workflow-acceptance.sh
```

12 items: the preconditions block people · a missing accumulable artifact is blocked · not landing is blocked · landing passes ·
the accumulable artifact crosses scenes · the gate intercepts · it only continues after the gate is confirmed.

### Workflow validation (the other tool)

```bash
# Check every workflow definition in the workbench
node verify-workflow.mjs --root <workbench-root>

# Check only one of them
node verify-workflow.mjs --root <workbench-root> --file disk-check-and-cleanup

# Check a file directly
node verify-workflow.mjs --file /path/to/some-workflow.yaml
```

It looks in these places (the first one that exists wins):

```
<workbench-root>/workflows/
<workbench-root>/scenes/_shared-memory/workflows/
<workbench-root>/shared/workflows/
```

**What it blocks**: missing required fields (`name` / `version` / `steps`), a step missing `scene` / `purpose` / `criteria`,
`needsConfirmation` not being true/false, `failureStrategy` not being a legal value, steps not being a list.
**What it only hints at**: criteria too short (maybe not verifiable), no gate at all, a gate on every step, unknown fields.

> It parses the **restricted YAML subset** this project defines (scalars, `-` lists, two levels of indentation).
> When it meets a structure it does not understand it **reports an explicit error instead of guessing**——that is deliberate:
> a checker that silently guesses wrong is more dangerous than no checker.

### Dispatch validation (the last tool)

```bash
node verify-dispatch.mjs --root <workbench-root> --dispatch <dispatch-file>
```

**What it blocks**: a missing field of the dispatch contract (`What` / `Criteria` / `Output Location` / `Receipt Format` / `Needs`),
an empty field, a `Receipt Format` that does not mention the three-part contract (`Diff Set` / `Accumulable Artifact` / `Next Handoff`).
**What it only hints at**: vague or too-short `Criteria`, irreversible content without a gate marker.

### How the memory root is found

```
environment variable DSH_SCENE_MEMORY
  → <workbench-root>/scenes
  → <workbench-root>/engine-data/.dsh/scene-memory
```
Take the first one that **exists and is a directory**.

> **This candidate chain is the point, not a detail.**
> Once two scripts each hardcoded the path, messages went to the old board, the recipient never got them,
> and **nothing showed on the surface** (see [Known Gap #3](../02-implementation/4-known-gaps-and-todo.md)).
> Unified path resolution is the architecture-level fix for that bug.

### How the identity index is found

```
scenes/_scene-identity-index.md
  → 外壳/scenarios/_scene-identity-index.md
```

> `外壳/` is the **actual directory name** on the local workbench (kept verbatim, including its simplified glyphs)——
> it is the underlying engine's existing convention, not a typo. The tool takes the first path that **exists**,
> so whichever name your workbench uses is fine; `scenes/_scene-identity-index.md` is the new location this tool recommends.

---

## 2. Exit codes

| Code | Meaning |
|---|---|
| `0` | Passed (warnings may still be present) |
| `1` | **There is a problem, it is blocked** |
| `2` | Usage error |

> Exit codes must be right, because other scripts, cron and CI call this tool.
> **A checker that always returns 0 is more dangerous than no checker.**

---

## 3. What `check` inspects

### Blocked (exit=1, structural problems)

| Check | Message |
|---|---|
| Missing required file | `Missing file scene-private-memory.md` |
| Missing required directory | `Missing directory project-memory/` |
| **The scene boundary is broken** | `Scene directory is missing .git (scene boundary broken ⇒ the dedicated skill will not load, and the symptom is subtle)` |
| The identity index has no card for this scene | `Cannot find this scene in the identity index: <name>` |
| The locator card column is empty | `Identity index locator card column is empty (value: <value>)` |
| The locator card does not exist | `Locator card does not exist: <path>` |
| The card fingerprint is stale | `Card fingerprint stale (card changed, run stamp)<fp>…≠<real>…` |
| The identity card has no fingerprint | `Identity card has no card fingerprint (run stamp to restamp)` |
| Missing core responsibilities | `missing "## Core Responsibilities" block (required in the scene private memory)` |
| Too few responsibility items | `Core responsibilities has only 2 items (at least 3)` |
| §0 missing a subsection | `§0 missing subsection ### 4) Next Steps / Blockers` |
| §0 over the hard limit | `§0 5000 B over 4 KB (hard limit 4096)` |
| Missing the §0 heading | `Missing §0 handover heading (## §0)` |

### Warning only (exit=0)

| Check | Message |
|---|---|
| Main file over the limit | `Main file 26.0 KB over 25 KB (hard limit — move old content into archive/ and leave a pointer)` |
| Project memory over the limit | `Project memory X.md 9.0 KB over 8 KB` |
| The project table is stale | `Current projects table says "none", but project memory has 3 copies (the table needs updating)` |
| Next steps are empty | `Section 4 (next steps / blockers) is empty` |
| The legacy §0 heading | `Uses the old §0 heading (the legacy form) — change it to ## §0` |

> **Tell "block" and "warn" apart**:
> block = a structural error, continuing will definitely break something ⇒ fail-closed.
> warn = a quality issue, maybe just an update was forgotten ⇒ let a human judge.

---

## 4. Counter-example acceptance (self-acceptance)

```bash
bash negative-acceptance.sh
```

This script **deliberately breaks** demo-scene and verifies one by one that the tool blocks it.
Each case is restored from `demo-workbench.clean/`, so the script is safe to run repeatedly. Output:

```
═══ Negative Acceptance: the validator must prove that it fails when it should ═══

【V8】Normal data should pass (expected exit=0)
  ✓ Normal scene passes all checks
【V1】§0 blown past the 4 KB hard limit (expected exit=1)
  ✓ §0 over hard limit blocked
【V2】Delete the "### 4) Next Steps / Blockers" subsection (expected exit=1)
  ✓ Missing §0 subsection is blocked
【V3】Change the locator card without restamping the identity card ⇒ stale fingerprint (expected exit=1)
  ✓ Stale card fingerprint is blocked
【V5】Delete the whole "## Core Responsibilities" block (expected exit=1)
  ✓ Missing core responsibilities blocked
【V6】Core responsibilities has only 2 items (expected exit=1)
  ✓ Too few core responsibilities blocked
【V9】Scene directory has no boundary marker (expected exit=1)
  ✓ Missing boundary marker is blocked
【V10】This scene is not in the identity index (expected exit=1)
  ✓ Scene absent from the index is blocked
【V11】Locator card column points at a file that does not exist (expected exit=1)
  ✓ Missing locator card blocked
【V7】Project memory has an entry but the current projects table says "none" (expected exit=0 + warning)
  ✓ warning (exit=0)

═══ Result: 10 passed, 0 failed ═══
```

> ⚠️ **Only seeing "the normal case passes" does not count as verification.**
> A checker that never reports anything is more dangerous than no checker——
> it makes people think they are protected when they are not.

---

## 5. Single source of truth for the rules

The hard limits, the subsection list and the fingerprint length all live in **`handover-rules.json`**; the tools read it and never hardcode it.

```json
{
  "sec0MaxBytes": 4096,
  "mainMaxBytes": 25600,
  "projectMaxBytes": 8192,
  "fingerprintLength": 16,
  "sec0Subsections": ["### 1) Last Handover", "..."],
  "dutyHeading": "## Core Responsibilities",
  "dutyMinItems": 3
}
```

The tool's search order:
```
<tool-dir>/handover-rules.json
  → <workbench-root>/handover-rules.json
  → 04-templates/handover-rules.json
  → (none found ⇒ built-in defaults)
```

> **To change a hard limit, change that one file.**
> After changing it, remember to sync three places: the rules file, the tool's built-in defaults (if any), and the numbers quoted in the docs.

---

## 6. Plugging it into your own directory

```bash
# 1) Your workbench looks like this
<my-workbench>/
└── scenes/
    ├── _scene-identity-index.md
    └── <my-scene>/
        ├── .git/          ← the scene boundary (remember to git init)
        ├── locator-card.md
        └── scene-private-memory.md

# 2) Run
node scene-memory.mjs list --root <my-workbench>
node scene-memory.mjs init --scene <my-scene> --root <my-workbench>
node scene-memory.mjs stamp --scene <my-scene> --root <my-workbench>
node scene-memory.mjs check --scene <my-scene> --root <my-workbench>
```

**Note**:
- The scene directory **must have `.git/`** (the scene boundary), otherwise `check` reports an error——
  this is deliberate: without a boundary the dedicated skill will not load, and the symptom is not obvious.
- The identity index needs the right number of columns (7):
  `Scene | Panel ID | Panel Title | Session Name | Session ID | Locator Card | Main Skill`

---

## 7. Data formats the tools read and write

| Format | Required tokens |
|---|---|
| Scene memory §0 | `## §0` + `### 1) Last Handover` / `### 2) Current Projects` / `### 3) Private Memory Changes` / `### 4) Next Steps / Blockers` / `### 5) Full Picture` |
| Scene private memory | `## Core Responsibilities` (at least 3 items) |
| Accumulation target | `§5` (Decisions and Pitfalls) |
| Receipt | `Diff Set` / `Accumulable Artifact` / `Next Handoff` |
| Dispatch | `What` / `Criteria` / `Output Location` / `Receipt Format` / `Needs` |
| Workflow YAML | `name` / `version` / `steps`; per step `scene` / `purpose` / `criteria`, optional `output` / `needs` / `needsConfirmation`, plus `failureStrategy` ∈ `stop-and-wait` / `continue` / `rollback` |
| Run state | `running` / `completed` / `stopped` / `waiting-for-gate` |
| Files | `scene-private-memory.md` / `identity-card.md` / `locator-card.md` / `scene-portrait.md` / `_file-index.md` / `_scene-identity-index.md` / `scene-config.json` / `handover-rules.json` |
| Directories | `scenes/` / `project-memory/` / `archive/` / `workflows/` / `runs/` / `receipts/` / `session-archive/` / `engine-data/` |

---

## 8. What this tool does **not** do

| Does not | Why |
|---|---|
| Does not write the body of the scene memory | The memory is written by **humans**. The tool only builds the skeleton, fills the missing subsections, stamps and checks |
| Does not touch existing §0 content | The handover only fills what is missing, it never overwrites——overwriting wipes out the progress, which is worse than not handing over at all |
| Does not delete anything | The tool only adds and checks. Deletion is destructive and should not be done by a validation tool |
| Does not tolerate hand-edits of the identity card / scene portrait | These two are rewritten in full by the tool; hand edits are reverted |

---

⬅️ **Back**: [Executable Tools README](README.md) ｜ **Next**: [Templates](../04-templates/)

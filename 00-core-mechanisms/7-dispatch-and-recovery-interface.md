# Dispatch and Receipt Collection Interface Specification

> **This is the contract between the repo and the engine.**
> The repo defines "what a dispatch looks like, what a receipt looks like, how it is accepted";
> the engine side (some engine／another engine／any engine) only has to **deliver those two things and collect them back**.
>
> **The engine does not need to understand this methodology.** It only has to do three things:
> send one dispatch, collect one receipt, hand the receipt to the validation tool.
>
> ---
>
> **Why this document exists**: the methodology repo and the actual workbench (engine side)
> evolve separately. Without a shared contract, each side builds its own and then says "I did do it on my side".
> This document is the **single source of truth for both sides**: the interface is defined here, each side implements it.

---

## Zero, the interface at a glance

```
  ┌──────────────────────┐                        ┌──────────────────────┐
  │  Engine side (some engine／another engine)│                        │  Methodology repo    │
  │                      │                        │                      │
  │  ① Read the dispatch file  │                        │  ④ Produce the dispatch file │
  │     ↓                │                        │     (workflow def + state)│
  │  ② Send it into the target scene's session   │──── dispatch (plain text) ───▶│                      │
  │     ↓                │                        │                      │
  │  ③ Collect the scene's reply    │◀─── receipt (plain text) ─────│  ⑤ Validate the receipt           │
  │     ↓                │                        │     (three-part + landing)    │
  │  Save it as a receipt file          │                        │                      │
  └──────────────────────┘                        └──────────────────────┘
```

**Where the boundary is**: ① and ③ are the engine's job (only it knows how to wake a session and how to read the answer back);
② and ⑤ are format and rules (defined in this document, executed by the tools).

---

## One, the dispatch format (repo → engine → scene)

### 1.1 A dispatch is a file

A dispatch does not go into a chat box, it **lands as a file first** —— because a dispatch must be auditable, re-runnable and readable by tools.

File name: `<workbench-root>/runs/<run-id>/receipts/dispatch-<step-number>.md`

### 1.2 The structure of a dispatch

```markdown
# Dispatch · <workflow-name> · step <N>/<total>

【<target-scene-name> · Dispatch · Please reply with a receipt】

What:
  <a one-line action>

Criteria:
  <what counts as done, verifiable>

Output Location:
  <the full file path>

Needs (the accumulable artifact from the previous hop):     ← optional, omit the whole block if there is none
  <content carried in from the handover chain>

Receipt Format:
  ① Conclusion + evidence + path
  ② Must carry the "Diff Set"
  ③ Must carry the "Accumulable Artifact" ★ without this line ＝ this round of work was wasted
  ④ Must state the "Next Handoff"
```

### 1.3 What the engine does (just this one thing)

**Send the body of the dispatch file into the target scene's session.**

| Engine | How it sends |
|---|---|
| DSH | `session/prompt` (RPC to the resident session), `mode: 'queue'` so it does not interrupt the current turn |
| File channel | Append to the target scene's "0 - Notifications" section + the shared-layer board (leaves a trail, the other side receives it even if it is not awake) |

**The engine does not parse the dispatch, does not rewrite the dispatch, does not truncate the dispatch.** It delivers the text as is.

> **Why "deliver verbatim" is required**: the dispatch is the object under inspection. Once the engine has touched it,
> the tool can no longer verify "did what was sent carry the criteria".

### 1.4 What the engine does after sending

**Record "what I sent"** (timestamp, session id, delivery result).
This is for auditing —— the repo's `execution-state.md` references it.

---

## Two, the receipt format (scene → engine → repo)

### 2.1 A receipt is a file

After the engine receives the scene's reply, it **saves it as a file**. A receipt does not rely on the text in a chat box —— conversations get pushed out by the next one.

File name: `<workbench-root>/runs/<run-id>/receipts/receipt-<step-number>.md`

### 2.2 The structure of a receipt

```markdown
【<scene-name> · Receipt】

Conclusion: <one line>
Evidence: <a path you can open / a commit / a number>
Path: <where it was written>

## Diff Set
- <item A>: <old value> → <new value>
- <item B>: <old value> → <new value>
- <what was deleted / what was added>

## Accumulable Artifact
- <practice / criterion: how to do it next time>
- <pitfall: what you will hit next time>
- <the better way you did it this time: what improved>

## Next Handoff
- <which scene takes over / nobody>

Blocker: <none / who you are waiting on, for what>
```

### 2.3 The three subsection headings are part of the interface

| Subsection | Required | What acceptance checks |
|---|---|---|
| `## Diff Set` | ✅ | Non-empty |
| `## Accumulable Artifact` | ✅ | **Non-empty, and it must have landed** (see §Four) |
| `## Next Handoff` | ✅ | Non-empty |

> **The heading text itself is the interface contract.** The engine does not change it, the tool does not change it, the scene does not change it.
> If an implementation side uses different wording (traditional／simplified), **the engine side converts it when it lands it**, do not let both sides guess.

### 2.4 What the engine does (just this one thing)

**Save the scene's reply as a receipt file, then hand it to the validation tool.**

```bash
# after the engine side receives the reply
node <repo>/03-executable-tools/verify-receipt.mjs \
  --root <workbench-root> --scene <scene-name> --receipt <receipt-file>
# exit 0 ⇒ pass; exit 1 ⇒ fail (missing accumulable artifact / not landed)
```

---

## Three, the landing rule for the accumulable artifact (the most important rule in the interface)

### 3.1 The rule

> **Every accumulable artifact in the receipt must be findable in the scene's own memory.**

"The scene's own memory" means:
- the **`§5 Decisions and Pitfalls`** section of the scene private memory file (where accumulation lands)
- or the scene's **private skills** (the refined practice)

### 3.2 Why this is so strict

| Only in the receipt | Also written into the scene memory |
|---|---|
| The receipt is one-off, it sinks after being read | Memory is long-term, it is read next time |
| Next time you do the same kind of work, it is not there | It is there the moment the session opens |
| **Equivalent to no accumulation** | Real accumulation |

> **This is the mechanical evidence of "accumulation".** Without a landing, the tool blocks it.

### 3.3 How the landing comparison is done

What the tool does (not semantic comparison, but **containment after normalization**):

```
Strip the list marker and whitespace from each line of the "Accumulable Artifact",
and check whether it appears in the normalized text of the scene memory's §5 (or private skills).
```

**Why not semantic comparison**: that produces false negatives (different wording, same meaning → wrongly blocked).
Normalized containment is strict enough and does not wrongly block —— **the consequence of different wording is a miss, not a wrong block**.

---

## Four, the acceptance rules (executed by the repo's tools)

### 4.1 Receipt acceptance

```bash
node 03-executable-tools/verify-receipt.mjs --root <workbench-root> --scene <scene-name> --receipt <receipt-file>
```

| Check | When it fails |
|---|---|
| All three subsections present | exit 1 |
| All three subsections non-empty | exit 1 |
| Every accumulable artifact has landed | exit 1 |

### 4.2 Dispatch acceptance (before the engine sends it)

The dispatch file must contain: What／Criteria／Output Location／Receipt Format.
Missing **Criteria** ⇒ the ticket cannot be sent (there would be no way to judge whether the receipt is true).

### 4.3 Workflow definition acceptance

```bash
node 03-executable-tools/verify-workflow.mjs --root <workbench-root>
```

---

## Five, compatibility of script and terminology (must read for the implementation side)

The repo's documents and tools are in **English**; some engine sides (DSH) have workbenches in **Simplified Chinese**.
These are **two independent naming sets**, not two ways of writing the same thing.

### 5.1 The rule

| | Repo (methodology repo) | Engine side (your workbench) |
|---|---|---|
| Scene directory | `scenes/` | `场景/`（DSH） |
| Scene memory file | `scene-private-memory.md` | `场景私有记忆.md`（DSH） |
| Identity index | `_scene-identity-index.md` | `_场景身份索引.md`（DSH） |
| Project memory | `project-memory/` | `项目记忆/`（DSH） |

### 5.2 How the two coexist

**Do not hardwire the repo's tools to the engine side's names.** The approach is:

1. **Put the filename mapping table on the engine side** (not in the repo)
2. The repo's tools **accept overrides** —— use arguments like `--accumulation-file`, or read a config file the engine side brings
3. The repo's rules file (`handover-rules.json`) holds the **defaults**; the engine side can bring its own version

> **Why the workbench's Simplified Chinese names do not go into the repo**: the repo is a public, engine-neutral methodology repo.
> Writing one engine's directory names into the rules file is the same as declaring "this method is for DSH" ——
> and that destroys engine neutrality.
>
> **The right way**: the repo defines the **interface** (dispatch format, receipt format, acceptance rules),
> the engine side defines the **naming** (its own filenames, its own paths), and a config file bridges the two.

---

## Five and a half, the engine state file (the validation tool's only engine dependency)

> **The validation tool is engine-neutral** —— it knows no engine's private format.
> But it has to answer one question: **is the session the panel is bound to still alive?**
>
> A panel pointing at an **archived** session ⇒ the symptom is "switching scenes feels like a different person",
> which is **exactly the same** as "one of the three places was not synced", but the root cause is completely different ⇒ the two must be investigable separately.

### The contract

The engine side writes a JSON file at the workbench root:

```json
{
  "archived-sessions": ["session-xxxx", "session-yyyy"],
  "pinned-sessions":   ["session-zzzz"]
}
```

The file name is decided by the rules file's `engineStateFile` key (default `engine-state.json`).

### What the validation tool does with it

| Situation | Handling |
|---|---|
| The session the panel is bound to **is in the archived list** | **Block** (exit 1) —— the panel points at a dead session |
| The session the panel is bound to is not in the list | Pass (12 items + 1) |
| The state file does not exist | **Skip this check** (engine neutrality: no engine, no engine state) |

> **Why the state file is not "an engine-private format"**: a private format would tie the repo to one engine. The shape of this file is **defined by the repo**,
> and the engine side only **fills in the content** —— the same relationship as dispatch／receipt (the repo defines the interface, the engine fills in the data).

---

## Six, the engine side implementation checklist (follow it and you are right)

- [ ] Can send the body of a dispatch file into the target scene's session
- [ ] After sending, record "what was sent, where it went, when"
- [ ] Can read the scene's reply back and save it as a receipt file
- [ ] Call the validation tool **immediately** after collecting the receipt, stop if it fails (fail-closed)
- [ ] The three receipt subsection headings **stay verbatim** (converting the script is fine, changing the headings is not)
- [ ] The accumulable artifact lands in §5 of the scene memory (written by the scene itself, the orchestrator does not edit it for them)
- [ ] Provide a rules file of **your own**, mapping the filenames onto your workbench
- [ ] Produce the **engine state file** (`archived-sessions` ＋ `pinned-sessions`), placed at the workbench root
- [ ] **Refresh** the engine state file after switching sessions／archiving (otherwise the validation tool thinks the old session is still alive)

---

## Seven, versions

| Version | Date | Change |
|---|---|---|
| v1.0 | 2026-11-02 | First definition: dispatch format, receipt format, accumulable artifact landing rule, acceptance rules, script compatibility |

---

> ⬅️ **Back**: [Core Mechanisms README](../00-core-mechanisms/README.md) ｜ **Related**: [4 · Dispatch and Receipt](4-dispatch-and-receipt.md) · [5 · Workflow](../00-core-mechanisms/5-workflow.md) ｜ **Implementation side**: [Tools Read Me](../03-executable-tools/USAGE.md)

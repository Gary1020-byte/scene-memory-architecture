# 2 · Handover and Validation — making "done" a verifiable thing

> The most operationally useful piece of this mechanism. **Without validation, every rule is just a suggestion.**

---

## 1. What validation is for

In one line: **prove that "it fails when it should fail".**

| What must be blocked | How it is blocked | Why |
|---|---|---|
| The handover section blows up | Measure bytes, > 4096 fails outright | Over the limit nobody reads it; the handover is then worthless |
| The handover section is missing a subsection | Compare the five subsections one by one | Missing one means the next person inherits a missing step |
| The locator card was hand-edited | sha256 fingerprint mismatch | The memory card's description no longer matches the real identity |
| **The scene boundary fails** | Block if the scene directory has no `.git/` | The exclusive skill will not be loaded, and the symptom is not obvious |
| The identity index does not match | Block if this scene's card cannot be found | A broken index ⇒ validation for this scene fails entirely |
| A tool-generated file was hand-edited | The tool rewrites it in full | Avoid two sources of truth |
| The hard limit is exceeded | Warning (does not block) | The main file being over budget usually means "time to slim down" |

> **Tell "block" and "warn" apart**:
> block = a structural error, continuing will definitely break something ⇒ **fail-closed, block outright**.
> warn = a quality issue, maybe just an update was forgotten ⇒ hint only, let a human judge.

### What fail-closed means

**fail-closed = the default is "not passed"; someone must explicitly let it through.**

| | fail-open (pass by default) | **fail-closed (block by default)** |
|---|---|---|
| When the check fails | Carry on anyway | **Stop; switching sessions is not allowed** |
| Who can let it through | —— | Only the person who "fixed the thing until it really passes" |
| When it goes wrong | Missed it, and **nobody knows it was missed** | Stops at the door immediately, and the failing line is written out clearly |
| Applies to | Advisory suggestions | **Structural invariants** (hard limits, boundaries, fingerprints, subsection completeness) |

> ⚠️ **"fail-closed" is where the entire value of this mechanism lives.**
> It turns "I remember to write the handover first" from **relying on discipline** into **relying on machinery**.
> Without it, "write the handover before switching sessions" is just nice words in a document.

### ⚠️ A checker that always returns "passed" is more dangerous than no checker

This is the sentence in this doc most worth remembering.

| | No checker | **A checker that always returns "✅ passed"** |
|---|---|---|
| Do you know something went unverified | ✅ Yes (because nothing was checked at all) | ❌ **No** |
| Will you go and fix it | Yes (because nobody gave you a guarantee) | **No** (because it says there is no problem) |
| When it goes wrong | "I knew there was no checking" | "The check passed!" ⇒ **wasting more time chasing the wrong direction** |

**The mechanism-level reason**: a checker that always passes turns "**I thought I was protected**" into a **false sense of safety**.
It does not merely fail to block anything — it **actively makes you stop being alert**.
That is more expensive than "no protection", because with no protection you at least know you are running naked.

> **So "it fails when it should fail" is not just a strict requirement — it is this tool's only acceptance criterion.**
> How to test it: section 6 — deliberately break 10 situations and confirm each one is blocked.
> **If the counter-examples do not report, this checker is fake.**

---

## 2. Mechanical invariants (what the tool actually checks)

```javascript
// ① §0 section byte count (from '## §0' to the next heading of the same level)
const s0 = sec0Range(main)
if (s0.bytes > rules.sec0MaxBytes) problems.push('§0 ' + s0.bytes + ' B exceeds 4 KB (hard limit 4096)')

// ② are the five subsections all present
for (const sub of rules.sec0Subsections)          // the five subsection names come from the rules file, never hardcoded
  if (!main.includes(sub)) problems.push('§0 missing subsection ' + sub)

// ③ number of core responsibility items
const n = (sec.match(/^- /gm) || []).length
if (n < rules.dutyMinItems) problems.push('Core Responsibilities has only ' + n + ' items (at least 3)')

// ④ card fingerprint (the first 16 chars of the locator card's sha256 are written in the identity card)
const fp = (card.match(/sha256:([0-9a-f]+)/) || [])[1]
if (!sha(ident.card).startsWith(fp)) problems.push('card fingerprint stale (card changed, run stamp)')

// ⑤ scene boundary: .git existence (★ missing it degrades silently, the symptom is not obvious)
if (!fs.existsSync(path.join(dir, '.git')))
  problems.push('scene directory is missing .git (scene boundary fails ⇒ the exclusive skill will not be loaded, and the symptom is not obvious)')
```

> ★ **The five numbers (hard limit, subsection list, fingerprint length, duty count) all come from the rules file, never hardcoded in the program.**
> The tool's own search order is:
> ```
> handover-rules.json in the tool's own directory
>   → <workbench-root>/handover-rules.json
>   → 04-templates/handover-rules.json
>   → (none found ⇒ built-in defaults)
> ```
> The one that takes effect is the **first one read** — so `list` self-reports the "rules source" for you to confirm.

### The hard limit numbers (measured locally)

| Object | Hard limit (bytes) | Nature | Defined in |
|---|---|---|---|
| `§0` current handover | **4 096** (4 KB) | **Hard limit, exceeding it fails outright** | `handover-rules.json` → `sec0MaxBytes` |
| Scene private memory main file | **25 600** (25 KB) | Warned, move into the archive | `handover-rules.json` → `mainMaxBytes` |
| Project memory (per file) | **8 192** (8 KB) | Warned | `handover-rules.json` → `projectMaxBytes` |
| Locator card fingerprint length | **16** hex digits | Written into the identity card | `handover-rules.json` → `fingerprintLength` |
| Single skill file | 12 KB | Convention (no tool check) | —— |

> Why 4 KB? **Roughly "readable in 30 seconds before you start work".**
> It is a "can actually finish reading" threshold, not a preference for tidy file sizes.

**Measured values (2026-11-01, three scenes on the local workbench)**:

| Scene | Measured §0 size | Measured main file size | Headroom to the 4 KB limit |
|---|---|---|---|
| scene A | 4 012 B | 6 323 B | 84 B left ⚠ |
| scene D | 4 047 B | 7 627 B | 49 B left ⚠ |
| scene C | 1 693 B | 3 608 B | 2 403 B left |

> ⚠️ **Two scenes' §0 are less than 100 B from the limit.**
> The limit only blocks when you **exceed** it, and **does not warn you that it is nearly full** —
> so slimming down has to be done early, not the day it suddenly goes all red.
> (Measured 2026-11-01; the local machine is a Linux workbench, the three scenes are each independent git repositories.)

---

## 3. The session-switch protocol (four steps, step ③ cannot be skipped)

```
① First overwrite "progress / next step / blocker" into §0   ← this step IS the "handover", don't skip it
② Then switch (new session + archive the old session)
③ After switching, sync three places:
     · the sessionId in the scene config
     · the session id column in the identity index table
     · the handover signature in §0 ("This handover was written by session <new id> on <date>")
④ Run the self-check: `scene-memory.mjs check --scene <name>` — only a pass lets you consider the switch done
```

**Why step ③ cannot be skipped**: the panel pins a session by `sessionId`.
Without syncing ⇒ the panel points at an **archived session**, which shows up as "switch to this scene and the AI acts like a different person" (it literally is a different person).

> ⚠️ **Syncing three places means "three places", not "two places plus a note".**
> Missing any one of them has the same symptom (switching scenes feels like a different person),
> but a different root cause — **so check all three together; do not guess from the symptom which one you missed**.

### The engine RPC sequence for step ② (measured, works)

Switching sessions is not "opening a new window"; it is swapping one session's **identity**. The full engine-side sequence:

```
workspace/create        create the scene workspace (path = the scene directory)
  → session/create      create a new session in that workspace (with workspaceId)
  → session/rename      change the title to the scene name
  → session/prompt      send an opening line (mode:'queue' = queued, does not interrupt the current turn)
  → session/cancel      cancel immediately (an empty session does not go into the sidebar)
  → workspace/pinSession  pin the session in the sidebar
  → session/page        ★ pull back the other side's most recent 200 messages, to "verify the result"
```

> ★ **`session/page` is the key to "don't trust, read the evidence".**
> Without it the channel can only "send", not "receive" —
> and then you are back to the hole described in [4 · Dispatch and Receipt](../00-core-mechanisms/4-dispatch-and-receipt.md):
> "the orchestrator only sends to the prompt; there is no program to read the reply back".

**The two authentication traps (measured)**:

| Trap | What to do |
|---|---|
| The token is not in the config file | Fish it out of the **systemd log** (`journalctl --user -u <service> \| grep -o 'token=…'`), or specify it via an environment variable |
| Switching cookies gives 401 | Must use **`redirect: 'manual'`** — following the redirect gives 401 instead |

> These two cannot live in a doc; **they have to be written into your tool code**.
> How to write them see section 4 of [4 · Dispatch and Receipt](../00-core-mechanisms/4-dispatch-and-receipt.md).

**What the handover tool does** (`scene-memory.mjs handover`):

```
① Snapshot the whole old version into archive/<timestamp>-<first 6 of session id>.md
② Fill in the missing §0 subsections one by one (missing one, fill one; never overwrite existing body text)
③ Re-stamp the identity card / scene portrait (stamp)
④ Register the archive entry in _file-index.md
```

> ⚠️ **Filling subsections is "only what's missing", not "rewrite the whole section"** —
> if the handover tool overwrites the whole section, it wipes out the progress a human wrote in §0, which is worse than not handing over at all.

---

## 4. When you should switch sessions (the counter-intuitive one)

| Trigger | Switch? |
|---|---|
| The owner says "switch sessions" | ✅ Switch |
| Context limit exceeded (413 reported) and **still** 413 after compression | ✅ Switch (a real deadlock) |
| Only "hit the compression line", no error yet | ❌ **Don't switch** — the engine compresses automatically, keep working |
| The task is done | ✅ Recommended to switch (one topic, one session) |

> "Switch as soon as you hit the line" is a common misoperation: you switch sessions, the state was never handed over,
> and the next one starts from zero — **exactly the kind of thing this mechanism exists to eliminate**.

---

## 5. The validation tool's five commands

```bash
# Overview: what each scene is missing (including whether the boundary .git exists)
node scene-memory.mjs list    --root <workbench-root>

# Create the directory skeleton + three documents (never overwrites existing body text)
node scene-memory.mjs init    --scene <name> --root <workbench-root>

# Regenerate the identity card + scene portrait (must be re-run after the locator card changes)
node scene-memory.mjs stamp   --scene <name> --root <workbench-root>

# Handover: archive the old version + fill §0 + stamp + register in the index
node scene-memory.mjs handover    --scene <name> --root <workbench-root>

# ★ Full check: structure/boundary/fingerprint/§0/project/archive
node scene-memory.mjs check   --scene <name> --root <workbench-root>

# All scenes in one go
node scene-memory.mjs check   --all --root <workbench-root>
```

> You can omit `--root` — the tool searches upwards, or reads the environment variable `DSH_WORKBENCH_ROOT`.
> Full usage and message-by-message detail see [`03-executable-tools/USAGE.md`](../03-executable-tools/USAGE.md).

### Exit codes

| Code | Meaning |
|---|---|
| `0` | All passed (there may be warnings) |
| `1` | There is a problem (blocked) |
| `2` | Usage error |

> **Exit codes must be right**, because this tool gets called by other scripts, cron and CI.
> A checker that always returns 0 is more dangerous than no checker at all.

### The hard limit numbers are not in the program, only in the rules file

```bash
node scene-memory.mjs list --root <workbench-root>
# The first output line self-reports: rules source: <rules file path>
```

> ★ **The "rules source" line is the evidence.**
> The path it prints is the rules file that is **actually in effect**.
> Reading that line costs zero and answers "did my limit change actually take effect".

---

## 6. Counter-example acceptance: must prove "it fails when it should fail"

**This is the validation tool's own acceptance criterion.** Only seeing "returns 0 in the normal case" does not count.

The tool ships with an executable counter-example acceptance script; run it once and you know whether it really blocks:

```bash
bash 03-executable-tools/negative-acceptance.sh
```

**Measured result (2026-11-01, demo workbench)**:

```
═══ Counter-example acceptance: the validation tool must prove "it fails when it should fail" ═══
【V8】normal data should pass (expect exit=0)   ✓ all normal scenes pass
【V1】blow §0 past the 4 KB limit (expect exit=1) ✓ §0 over the hard limit is blocked
【V2】delete "### 4) Next Steps / Blockers"        ✓ §0 missing a subsection is blocked
【V3】changed the locator card without re-stamping the identity card ✓ stale card fingerprint is blocked
【V5】deleted the whole "## Core Responsibilities" block             ✓ missing core responsibilities is blocked
【V6】core responsibilities only has 2 items                   ✓ not enough core responsibility items is blocked
【V9】scene directory is missing .git                     ✓ missing .git is blocked
【V10】no card for this scene in the identity index            ✓ no such card in the index is blocked
【V11】the locator card column points at a nonexistent file            ✓ nonexistent locator card is blocked
【V7】project memory has a file but the current projects table says "none"   ✓ a stale table only warns, does not block (exit=0)
═══ Result: 10 passed, 0 failed ═══
```

| Number | Counter-example | Expected result |
|---|---|---|
| V8 | Everything normal | Exit code 0 |
| V1 | Fill §0 to > 4096 bytes | Reports "§0 N B exceeds 4 KB (hard limit 4096)", exit code 1 |
| V2 | Delete `### 4) Next Steps / Blockers` | Reports "§0 missing subsection ### 4) Next Steps / Blockers", exit code 1 |
| V3 | Change `locator-card.md` content without re-stamping the identity card | Reports "card fingerprint stale", exit code 1 |
| V5 | Delete the whole `Core Responsibilities` block | Reports "missing '## Core Responsibilities' block", exit code 1 |
| V6 | `Core Responsibilities` has only 2 items | Reports "Core Responsibilities has only 2 items (at least 3)", exit code 1 |
| V9 | Delete the scene directory's `.git/` | Reports "scene directory is missing .git (scene boundary fails…)", exit code 1 |
| V10 | Delete this scene's row from the identity index | Reports "no card for this scene in the identity index", exit code 1 |
| V11 | Make the index's locator card column point at a nonexistent file | Reports "locator card does not exist", exit code 1 |
| V7 | §0 subsection 2 says "(none)" but project memory has a file | **Warning only**, exit code still 0 |
| V4 | Hand-edit `identity-card.md` | Reverted after re-stamping (the tool rewrites it in full) |

> ⚠️ **Note the common trait of V1–V3, V5–V6, V9–V11**: they must all make the **exit code** 1 as well.
> Printing red text but returning 0 is the most common false safety.
>
> **V7 is deliberately the opposite**: it proves the tool **tells "block" apart from "warn"** —
> a stale table is a quality issue; it should be flagged but should not block the entire workbench.

### Measured hard limit boundary (2026-11-01)

| Measured value | Number | Explanation |
|---|---|---|
| Demo scene §0 measured size | **587 B** | Limit 4096 B, headroom 3509 B |
| Demo scene main file measured size | **1 375 B** | Limit 25 600 B |
| Largest §0 that exactly fits | **4 089 B** | 187 filler lines; one more line makes it 4 109 B ⇒ over the limit |

> The hard limit is a **byte count**, not "lines" and not "characters".
> The same Chinese text yields very different character counts under different tools — **only bytes are stable**,
> so the limit must be written in bytes.

---

## 7. A real lesson from one tool: rules need a single source

There was a time when two scripts each hardcoded the "memory root path", and the result was:

- Messages went into the old board
- The recipient's `scene-private-memory.md` **never received them at all**
- The timestamps of both boards stayed frozen in place, and **nothing showed on the surface**

**The disease is not "forgot to sync" — it is "the same thing has two path definitions".**

**Measured evidence (2026-11-01, local workbench)**:

| Board | Last message | File size |
|---|---|---|
| New root `scenes/_shared-memory/_跨場景通知.md` | 2026-10-31 17:40 | 7 061 B |
| Old root `engine-data/.dsh/scene-memory/_shared-memory/_跨場景通知.md` | 2026-10-31 08:26 | 5 050 B |

> Both boards were **still growing**, yet their contents did not overlap at all —
> that is what "split" means literally: **neither board is the complete truth**.

**The fix (architecture-level, not a patch)**:

1. **Single source of truth for rules** — hard limits, the subsection list and the fingerprint rules are written in **one JSON**,
   and both the tools and the scripts **read it**. To change a rule, change one place.
2. **Unified path resolution** — every script resolves the memory root through the same candidate order:
   ```
   environment variable DSH_SCENE_MEMORY
     → <workbench-root>/scenes
     → <workbench-root>/engine-data/.dsh/scene-memory
   ```
   Take the first one that **exists and is a directory**.
3. **One-time merge of the old board** — keep the original timestamps, do not rewrite history.

> **The universal version of this lesson:**
> when the same value has two definitions, it will fork sooner or later.
> Instead of remembering to sync, **make it so it cannot have two**.

### ⚠️ "Single source of truth for rules" can itself grow a crack

Even after you have centralized the rules into one JSON, **that JSON may still have more than one copy**.

**Measured in this repo (2026-11-01)**:

| File | Key name style | Will the tool read it? |
|---|---|---|
| `03-executable-tools/handover-rules.json` | English keys (`sec0MaxBytes`…) | ✅ **Read** (search order position 1) |
| `04-templates/handover-rules.json` | Chinese keys (`交接段紅線位元組`…) | ❌ **Not read** |

**Two problems**:

| # | Problem | Measured evidence |
|---|---|---|
| 1 | The same rules live in two files with two key styles | The English version parses; the Chinese version's keys **all fail to match** |
| 2 | The tool's search order means one of them **will never be read** | The one in `04-templates/`, because the one in `03-executable-tools/` hits first — it is a dead file |

**End-to-end measurement**: put the Chinese-keyed `04-templates/handover-rules.json` into the tool's own directory
and change the hard limit to `999`:

```
rules source: …/handover-rules.json        ← the tool self-reports that it read this copy
T: ✗ §0 19235 B exceeds 4 KB (hard limit 4096)   ← but the limit is 4096, not 999
```

> **The file was read, but the value did not take effect.**
> Because the tool looks for `sec0MaxBytes`, while that file writes `交接段紅線位元組` —
> when merged the two keys are unrelated, so the value falls back to the built-in default.
>
> **This is the quietest kind of failure**: no error, no warning, the hard limit looks "configured" but cannot be moved.

**The fix**:

| Approach | Explanation |
|---|---|
| **One copy is enough** | Keep only one `handover-rules.json`; **reference** it elsewhere, do not copy it |
| **Use English key names** | Write the key names the program reads in English, keep Chinese only in the "description" column — avoid two styles coexisting |
| **Make the failure visible** | The tool self-reports the "rules source" path in `list`; **after changing a hard limit you must look at that line** |
| **Add one self-check** | Add a counter-example to the acceptance script: "change the rules file's hard limit to 999 ⇒ check must report 999" |

> ⚠️ **The cheapest self-check**: after changing a hard limit, run `list` once and confirm the "rules source" prints the file you changed;
> then deliberately blow up the handover section and check whether the reported limit number is your new value.
> **Only after both steps is "the rule change took effect".**

---

## 8. Failure modes of validation

| Symptom | Root cause | Fix |
|---|---|---|
| Validation always returns 0 | The tool's `check` branch is never reached | **Counter-example acceptance** (10 cases, see section 6) |
| All red but you don't know what is broken | Wrong index path, cannot read the identity table | Make the index path a candidate chain, do not hardcode it |
| Lots of red text but nobody acts | Warnings and errors are mixed together | **Separate them**: errors block, warnings only hint |
| The check passes but the handover is still broken | Only the structure was checked, not content freshness | The handover must carry a signature and a date |
| Data broke after a tool upgrade | Tools and data are mixed in the same layer | Tools at L3, data at L2/L5 |
| You changed the hard limit and nothing happened | Two rules files / key names do not match | Keep one; look at the "rules source" that `list` reports |
| §0 suddenly goes all red one day | It was already close to the limit and nobody measured it early | Measure §0's size regularly; slim it down when it gets close |

---

> ➡️ **Next**: [3 · Maintenance Manual](3-maintenance-manual.md) (the standard procedure for changing the architecture)
> ⬅️ **Back**: [Implementation README](README.md) ｜ **Related**: [1 · Directory and File Spec](1-directory-and-file-spec.md) · [Validation tool usage](../03-executable-tools/USAGE.md)

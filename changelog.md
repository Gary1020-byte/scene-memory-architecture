# Changelog

> **This list is written for "the me of three months from now".**
> Every architecture change gets one entry: what changed, why, how it was verified, and whether it hit a pitfall.
>
> The purpose is simple: **do not let the docs become lies.**

---

## Format

```markdown
## v<version> · <YYYY-MM-DD> · <one line>

**What changed**
- <specific to file and section>

**Why**
- <the concrete event or problem that triggered this change>

**How it was verified**
- <the commands actually run and their results, not "it should work">

**Pitfalls hit**
- <the unexpected situation, and how it was handled>
```

---

## Change log

### v1.6 · 2026-11-03 · A scene was retired, and it was "the first time a view was split off from a scene"

**What changed**

- **DSH side**: the `Command` scene was retired (7 scenes → 6 scenes ＋ 1 view)
  - Engine side: unpin → rename to "Archived · Command · 2026-11-03" → archive
  - File side: remove that row from the identity index, delete the scene config json, undo the three shared-layer registrations,
    remove the SPEC entry from `工具/填充職責.mjs`, **move the whole scene directory to `歸檔場景/命令-2026-11-03/` (keeping the .git history, recoverable)**
  - **The 3D memory-neuron view did not disappear with it** ⇒ it became an independent `Overview` view (`外殼/scenarios/overview.json`, `"first": true` puts it on the first page)
- **repo side**:
  - `02-implementation/5-new-scene-spec.md` gains **B.3 "A View Is Not a Scene"** — the complete definition of a third registration type
  - The same doc's step 9 fixes an old path, and adds a rule: **workbench tools do not live in the scene directory**
  - `工具/一致性稽核.mjs` (engine side) can now skip `view`

**Why**

The `Command` scene's job was "dispatch and routing ＋ workbench operations", but in practice:
**the routing was always done by the orchestrator agent inside the conversation, and the workbench operations were also done directly by the agent** —
this scene never really carried any accumulating criteria. Keeping it only adds a tab.

**But retiring it forced a real architectural question**: that 3D memory-neuron panel
**is an overview, not a responsibility** — it reads the shared layer and draws the whole workbench's scene graph, and has nothing to do with the `Command` scene.
Tie it under some scene and you get "the scene is retired, and the view disappears with it".

⇒ **So there is now a third type: the view.**

| | scene | view |
|---|---|---|
| Scene directory / resident session / private memory / dedicated skills | ✅ all of them | ❌ none of them |
| Registration in four places | ✅ all four | ❌ **none at all** |
| Reason to exist | a responsibility that **accumulates memory** | **read-only presentation** |

**How it was verified**

| check | result |
|---|---|
| `scene-memory.mjs check --all` | all 6 scenes passed |
| `一致性稽核.mjs` | all 28 items passed (the view was correctly skipped) |
| `引擎狀態.mjs` | 42 archived, 6 pinned (originally 7, the Command one removed) |
| `呼叫場景.mjs --list` | all 6 resident sessions correct, Command is gone |
| Tab order (running `main.js`'s `listScenarios()` ＋ `applySceneTabOrder()` logic) | **Overview first**, Command is gone |
| grid column count | `repeat(4,1fr)`, `needCols=4 ≤ wantCols=4` ⇒ no proportion warning |

**Pitfalls hit**

| # | pitfall | fix |
|---|---|---|
| 42 | two copies of `呼叫場景.mjs` with different content (one in `工具/`, one in `場景/命令/`), and `讀場景回覆.mjs` only existed in the scene directory | compare md5 before deleting a scene; tools belong in `工具/`, and the spec gains a rule "workbench tools do not live in the scene directory" |
| 43 | the audit tool treated all of `scenarios/*.json` as scenes | add a `view` flag so it skips them (better than "use a filename prefix" — the renderer also skips `_` prefixes, which would keep the view out of the UI) |

**Not done yet**

- **The routing itself is not built** (routing table ＋ arbiter ＋ routing history) — that is the next segment
- Where the routing table's **keywords come from** (manual annotation / automatic extraction / both) is not decided

---

### v1.5 · 2026-11-03 · The real chain ran through, and it produced a re-runnable tool

**What changed**

- `工具/鏈式呼叫.mjs` fixed in three more places (see below)
- DSH gains two outputs (produced by the scenes themselves):
  - `場景/場景己/專案記憶/交接契約.md` ＋ `交接契約-數字對照.json`
  - `場景/場景庚/專案記憶/SPOT檢查.mjs` (**a re-runnable check tool**) ＋ a results file
- `01-architecture-overview/2-workflow-map.md` (v1.4): five workflows, the scene list, the priorities

**The real chain carried a real task this time, and produced something real**

`場景己/F → 場景庚/G`:

| hop | what it handed over |
|---|---|
| 1 | the handover contract: canonical asset paths, the section skeleton, 46 baseline sentences, asset numbers → narration comparison table |
| 2 | the **SPOT check tool** (re-runnable) ＋ the results on the real case |

**What the tool found (on the already-delivered video)**

```
beats 235 條｜narration 15 句｜應配 (line,sent) 46 組｜SPOT 字典 48 鍵（幽靈 5）
總計：fail 3｜warn 13｜pass 68｜info 1
```

| finding | content |
|---|---|
| **FAIL** 3 | three narration lines (2,2)(4,2)(14,3) have **no visual counterpart at all** (5.54 seconds of dead image) |
| **WARN** 5 | 5 **dead keys** in the SPOT dictionary (never hit) — the key is off by one, `(1,2)→(2,2)`, `(1,3)→(4,2)` |
| **WARN** 5 | a filler beat overlaps in time with the previous beat |
| **INFO** 1 | 7 asset uncertainties, of which the narration takes only 1 and picks a side → **quantifies "colloquial speech eats the uncertainty"** |

> ★ **That video's `check --json` is 0 errors, 0 craft warnings.**
> Not one of the three classes of problem this tool caught is visible to check.
> **⇒ "check all green does not mean there is no problem" goes from a slogan to a measurable number.**

**Three bugs fixed this time (all in the chain-call tool, and they came in a chain)**

| # | symptom | root cause |
|---|---|---|
| 1 | a task was dispatched but the reply read back was the previous round's reply | `lastReply()` takes "the longest old reply in the session" without checking against the message it sent |
| 2 | after fixing #1 it **could not read a reply at all** | `seq` is in `record.event.seq`, written as `record.seq` ⇒ every message is skipped |
| 3 | after fixing #2 it **still could not read it** | the `maxMessages: 12` window is too small, and "my own message" gets squeezed out by the scene's work messages |

**Two more improvements that are not bugs but are crucial**

| # | improvement | why |
|---|---|---|
| 1 | **wait for the scene to go "idle" rather than waiting for "a reply"** | a scene sends intermediate output first ("Now writing the deliverable") and then the conclusion; waiting only for "a reply" passes a half-finished product down the chain — **and the handover is exactly the reason this chain exists** |
| 2 | the catch must print the error | a TypeError caused by a type mismatch (returning a string vs returning an object) was silently swallowed, showing up as "cannot read it" with **no error message at all** |

> ★ **The three bugs are one family**: the tool is reading a moving target, and each fix exposes the next assumption.
> **⇒ After fixing, you must actually re-run the chain; reading the code is not enough.**

**Not done yet**

- The scene wrote `專案記憶/` but **did not update its own §0 handover** — the scene's write-back discipline has to be tightened
- **Touching `beats.json` needs your ruling** (it changes the video's timeline); the scene has already laid out the options and the costs
- Line A's 8 gaps (§7.1) are not filled; line B's **B5 (extracting frames with vision, made into a tool)** is not done

---

### v1.3 · 2026-11-03 · The first time the "spec got slapped by reality": two scenes found 9 differences, all written back

**What changed**

`02-implementation/8-content-to-shot-spec.md` had 9 differences written back (all found by the scenes in real measurement, with line-number evidence):

| # | difference | verdict | fix |
|---|---|---|---|
| 1 | §2.1's asset skeleton has only 3 sections | too vague | changed to the measured **6 sections ＋ a reader's guide** (guide / facts / comparison table / how to choose / when not found) |
| 2 | §2.1's "one line per fact with its source" and "tables allowed" **contradict each other** | **wrong** | changed to "lists carry a URL per item; tables are annotated with a table-level source group" |
| 3 | §2.1's "not found" only covers one case | too vague | expanded to **three cases**: not found / conflicting sources / version behind |
| 4 | only the assets are required to be honest, **the consumer's presentation is not** | **wrong (the biggest gap)** | new §2.6 "What the consumer must present", four hard rules |
| 5 | "the assets are the single source of truth" has no file-layer mechanism | too vague | new §2.9 canonical asset path |
| 6 | no cross-verification | missing | new §2.7: every number in the deliverable must be traceable to the assets |
| 7 | **same-named design system**: both are called aurora but the colour systems are completely different | a new pitfall | new §2.8: identify by **path**, not only by name |
| 8 | §5#2 writes the video's visual source as "hyperframes 9 palette" | **misattributed** | new §6.2: the true source is the Aurora token, the 9 palette is an available resource |
| 9 | line A's gaps were not listed at all | missing | §7 split into 7.1 (line A's eight) / 7.2 (line B's six) |

Also new §6.1 "Colloquial speech must preserve the assets' uncertainty" —
a real fracture caught in measurement: the assets say "architecture page 70+ / docs 60+ / README 40+ — **three inconsistent numbers**",
but the narration script keeps only "the architecture page says around seventy tools", and **the uncertainty is digested away**.

**Why**

v1.1 wrote the spec, v1.2 built the scenes, **but the spec had never been checked against any live work**.
This time was the first: **the scenes took the spec to real deliverables and checked it line by line**, then the orchestrator wrote the differences back.

**How it was verified**

- `工具/鏈式呼叫.mjs` dispatched a real task (`--task`) to two scenes
- Each hop landed its own project memory (`場景/場景己/專案記憶/ai-agents-report-線A核對.md`,
  `場景/場景庚/專案記憶/…-場景庚複核.md`), **all with line-number evidence**
- The second hop did an **independent re-check** and caught the differences the first hop missed (items 8 and 9)

**Two real bugs fixed this time (both in the chain-call tool)**

| # | symptom | root cause |
|---|---|---|
| 1 | a task was dispatched but the reply read back was the previous round's "please report your status" | `lastReply()` takes "the longest old reply in the session", **without checking against the message it sent** |
| 2 | after fixing item 1, the chain **could not read a reply at all** (timeout) | `seq` is in `record.event.seq`, I wrote `record.seq` ⇒ every message is skipped |

> ★ The 2nd is a consequence of the 1st fix — **fixing A breaks B, so you must measure**.
> This is also why "implement first, actually run it, then find the flaws in the execution results" is not a slogan.

**Not done yet**

- Not one of line A's 8 gaps (§7.1) is filled; of these, **A1, the criteria for choosing a template**, affects the re-run speed most
- Line B's **B5 (extracting frames with vision, made into a tool)** is not done — it still relies entirely on human memory
- The workflow YAML has never been run by the engine-side executor (the engine side only has the chain call)

---

### v1.2 · 2026-11-03 · Two scenes really got built: 場景己/F ＋ 場景庚/G

**What changed**

- DSH gains two scenes: `場景/場景己/` (Scene F, `sc-f`), `場景/場景庚/` (Scene G, `sc-g`)
- New workflow definition `工作流/簡報到影片.yaml` (engine-neutral, passed `verify-workflow.mjs`)
- `<工作台根>/工具/鏈式呼叫.mjs` fixed in three places:
  ① new `--task` flag (it could only ask for status ⇒ it could not dispatch work)
  ② **reply extraction now aligns with "the message I sent"** (it used to take the longest old reply in the session)
  ③ a reply is only taken once it is "stable" (scene agents often send intermediate output before the conclusion)

**Why**

v1.1 defined the spec, but **the spec had no consumer yet**.
This time "one line = one scene" really landed: the two lines share assets and tokens, and **do not convert into each other**.

**How it was verified**

| check | result |
|---|---|
| `scene-memory.mjs check --all` | all 7 scenes passed |
| `一致性稽核.mjs` | all 31 items passed (the four registrations agree) |
| `呼叫場景.mjs --only=場景己` | read its own §0, stated two iron rules, gave four options ✅ |
| `呼叫場景.mjs --only=場景庚` | read its own §0, stated three iron rules, pointed out that line A/B do not convert into each other ✅ |
| `verify-workflow.mjs --root` | all 1 definition passed (2 steps, 1 threshold) |

**One real bug fixed this time**

`鏈式呼叫.mjs`'s `lastReply()` takes "the **longest** assistant reply among the last 12 messages in the session",
**with no check against the message it sent**.

> Symptom: a task was dispatched, but the reply read back was the previous round's "please report your status".
> ⇒ On the first real chain run, both scenes were replying with status, which looked like "they refuse to take work" —
> in fact **the tool read the wrong message**.

The fix: use the unique marker in the prompt to find the seq of "the user message I sent",
and accept only assistant replies with a greater seq. **This is the same principle as "read the evidence instead of trusting".**

**Not done yet**

- The two scenes' **shared-layer area** has been written, but the token-sharing mechanism (how the two scenes know the other changed the colour scheme) has not been designed
- The workflow YAML only passed validation; **it has never been run by the engine-side workflow executor** (the engine side only has the chain call)
- `branch` is still not implemented

---

### v1.1 · 2026-11-03 · The first landing chain with a measured case: the "content → shot" seam spec

**What changed**

- New `02-implementation/8-content-to-shot-spec.md` (12.8 KB)
  —— a two-parallel-line model, the contract of five files, the **SPOT comparison contract**, the REVIEW discipline, nine accumulable artifacts, what is still missing
- `02-implementation/README.md` adds this doc and a chain diagram

**Why**

The user wanted the workflow "Open Design design deck → cut the deck into a video".
After taking stock we found: **this chain had already been walked end to end once** (`ai-agents-report`, 2026-10-27,
4 min 30 sec, Traditional Chinese voice-over ＋ subtitles, −16 LUFS), and it left a `REVIEW.md` behind.

But the stocktake also overturned an intuitive assumption:

| intuition | measurement |
|---|---|
| "the video is exported from the report HTML" | ❌ `build_scenes.py` reads `audio_timing.json` ＋ `beats.json`, **it does not read the report HTML, nor content.md** |
| "we need to write page → shot conversion rules" | ❌ not needed — the two lines share **assets**, they do not convert into each other |

The real seam is the hand-written `SPOT` comparison table inside `make_beats.py`:
"when the narration says this line, which element on screen should light up" — (line, sentence) → (scene, CSS selector).
That needs semantic understanding, **no algorithm can derive it**, and it is **hand-written per video**.

**How it was verified**

- Read every engineering file of `ai-agents-report`: `content.md` / `narration.json` /
  `audio_timing.json` / `beats.json` / `build_scenes.py` / `make_beats.py` /
  `make_captions.py` / `REVIEW.md` / `hyperframes.json`
- Compared the fields of `beats.json` one by one (`t`/`end`/`sentence`/`scene`/`element`/`line`/`sent`/`filler`)
- Compared the structure of the `SPOT` table in `make_beats.py`
- Compared the two bugs in §3b of `REVIEW.md` that only showed up after rendering

**What this spec fixed down**

| # | rule |
|---|---|
| 1 | the two lines share assets and tokens, and **do not convert into each other** |
| 2 | the timeline must come from the measured audio, not from a character-count estimate |
| 3 | three ways of filling in the SPOT comparison (source annotation / semantic matching / model draft) ＋ **four mechanical acceptances** |
| 4 | **`check` all green does not mean there is no problem** — wrong order, or overlapping without overflow, a static audit cannot catch it |
| 5 | the fixed six-section structure of REVIEW.md, §3b and §4 may not be deleted |
| 6 | the fact discipline of "if you cannot find it, write it down" for the asset files |
| 7 | the list of nine accumulable artifacts (each labeled with where it lands) |

**Not done yet**

- The two scenes (`場景己`/F, `場景庚`/G) have not been built
- Not one of §7's five "what this chain still lacks" is filled; of these, **item 5 (making frame extraction into a tool)** should be done first
- The workflow YAML has not been written

---

### v1.0 · 2026-11-03 · Chain call: the workflow really ran on the engine side (five hops chained into one chain)

**What changed**

- `00-core-mechanisms/5-workflow.md` gains §1 and a half "Engine-side implementation: the chain call"
  —— why it waits hop by hop, the four things each hop's message must carry, the measured five-hop result, two implementation pitfalls
- `02-implementation/7-session-switch.md` gains "archiving has two approaches" (a changelog entry v0.9 had missed)
- The corresponding engine-side tool: `<工作台根>/工具/鏈式呼叫.mjs`

**Why**

v0.5～v0.9 built the spec, the tools, the archive layer and the session switch,
but **a workflow (the orchestration of scenes) had never once run five scenes through on a real engine**.
This time was the first.

**How it was verified**

- After all sessions were archived (22 of them), **5 resident sessions were rebuilt** → `check --all` passed all five scenes,
  `一致性稽核` passed all 23 items
- `鏈式呼叫.mjs` ran the whole chain: **場景甲/A → 場景乙/B → 場景丙/C → 場景丁/D → 場景戊/E**
  - Every hop read the previous hop's conclusion, every hop wrote a 【Next Handoff】 handover
  - Hops 1 and 2 read §0 and gave concrete handovers
  - **Hop 5 proactively pointed out that "the whole chain is essentially spinning in place"**

**Pitfalls hit**

| # | symptom | root cause |
|---|---|---|
| 40 | the "reply" read back was an intermediate output like "已读" | the assistant sends intermediate messages that contain only tool calls ⇒ **you must grab the longest one with real text** |
| 41 | `建會話.sh` fails across the board: `session.create accepts workspaceId or cwd, not both` | **a pre-existing bug** (the session-switch tool simply bypassed it); the engine does not accept both ⇒ pick one |

**Not done yet**

- The chain call is still not the repo's `run-workflow.mjs` (that is the offline executor); the relation between the two has to be clarified
- The chain has no "threshold" mechanism (the repo spec has one, the engine-side chain does not)
- The chain's result is not landed as a receipt file (the repo spec requires the receipt three-part set)

---

### v0.9 · 2026-11-03 · Recording "archiving has two approaches": to judge whether something is archived, take the title prefix or the archived list, whichever hits

**What changed**

- `02-implementation/7-session-switch.md` gains "the four measured conclusions on the engine side" ＋ "unarchive"
  —— archiving has two approaches (rename ＋ archive / archive only), and the judgement must take the "or" of the two;
  `workspace/unarchiveSession` works but returns the entire list

**How it was verified**

- Engine-side `工具/歸檔會話.mjs` archived everything: 22 → archived 40, pins 0,
  and after rebuilding the 5 resident sessions `check --all` passed all five scenes

---

### v0.8 · 2026-11-03 · "A second memory file" became a mechanical rule — the scene commits it itself, and there are no symptoms

**What changed**

- `scene-memory.mjs check` gains a rule: **a second memory file in the scene directory ⇒ block**
  - different inode ⇒ "orphan memory file" (the two will fork)
  - same inode (hard link) ⇒ "second memory file" (same content, but the duplicate filename confuses the other tools)
- `02-implementation/5-new-scene-spec.md` section 4 rewritten: it explains that **the source is the scene itself writing the wrong filename**
- Negative acceptance gains 2 items (V18: orphan ＋ hard link)

**Why**

The `場景乙` (Scene B) scene grew a `場景乙scene-private-memory.md` again. Checking git log found the source:
commit `73e9d1e` "scene constitution AGENTS.md write took effect" — **the scene agent wrote the wrong filename itself**,
not a human creating a scene wrong.

> This is different from the earlier "three scenes had orphan memory files": that time it was an old copy left behind when a human created a scene;
> **this time the scene itself wrote it while working**. So "just remember not to create a second one" is useless —
> the tool has to block it.

**How it was verified**

- `bash 03-executable-tools/negative-acceptance.sh` → **31 passed, 0 failed** (2 new items)
- Engine-side measurement: `check --scene 場景乙` reports "a second memory file (a hard link to the true source)" exit 1;
  after unlinking, `check --all` passes all five scenes

**Pitfalls hit**

| # | symptom | root cause |
|---|---|---|
| 39 | `check` was all green for `場景乙`, but the directory clearly had two memory files | `check` only looks at `scene-private-memory.md`, **it never checks whether there is a second one** |

**Not done yet**

- The repo side only got the check rule; the action "move the orphan file into `歸檔/`" is still manual
- Neither the DSH workbench nor the scene repo has a remote; only local git

---

### v0.7 · 2026-11-03 · Adding "the four registrations must agree" — the spec never said this

**What changed**

- `02-implementation/5-new-scene-spec.md` gains **B.2 The four registrations must agree**:
  a scene has to register in **four places** (scene directory / scene config / identity index / shared layer),
  and missing one has an inconspicuous symptom, and **no single tool can police this**
- The corresponding engine-side audit tool (`<工作台根>/工具/一致性稽核.mjs`) is matched to this repo's spec

**Why**

The user said "I found that everything got scrambled". The actual audit found two real inconsistencies:

| problem | symptom |
|---|---|
| the owner of `sc-e` in the shared layer's `index.json` is `ns-chat`, while the panel is actually `sc-e-ai` | **no symptom at all** — that cell is just permanently broken |
| the first column of the three rows in the identity index is not wrapped in backticks (the other two rows are) | no symptom, but parsing needs two rule sets |

> Both were caused by **creating the scene with different tools** — the spec only said "you must register",
> it never said "the registered fields must be ids the other side really has".

**How it was verified**

- Engine-side `工具/一致性稽核.mjs` → after the fix **all 23 items passed**
- Negative verification (deliberately breaking a copy):
  - owner changed to `ns-chat` → reports "not that scene's panel id (actual: sc-e-ai)"
  - scene directory renamed → reports both "the scene directory does not exist" ＋ "the directory has no matching scene config"

**Pitfalls hit**

| # | symptom | root cause |
|---|---|---|
| 37 | the audit tool reported "`[---]` has no scene config" | the separator row of a markdown table has `---` as its first column, and `/^[a-z0-9-]+$/` **matches it exactly** ⇒ you must additionally require "at least one letter" |
| 38 | `fs.isdir is not a function` | that is Python's API; in Node use `fs.statSync(p).isDirectory()` |

**Not done yet**

- The audit tool currently only exists on the engine side; the repo side has only the spec, with no engine-neutral counterpart
- Whether the content of the shared layer's `areas/*.md` cards is stale is not checked by the audit tool (it only checks that the file exists)
- The `場景乙` (Scene B) scene was built by another tool and never went through this new spec

---

### v0.6 · 2026-11-03 · Filling the gap "three places agree ≠ the session is still alive"

**What changed**

- `scene-memory.mjs check` gains a check: **has the session bound to the panel already been archived by the engine** ⇒ block
- New **engine state file** contract (`engine-state.json`): `archived-sessions` ＋ `pinned-sessions`
  - The validation tool is engine-neutral and **knows no engine's private format** ⇒ the repo defines the shape, the engine fills in the content
  - The same relation as dispatch/receipt: **the repo defines the interface, the engine fills in the data**
- `00-core-mechanisms/7-dispatch-and-recovery-interface.md` gains an "Engine state file" section ＋ two engine-side implementation items
- `02-implementation/7-session-switch.md` gains §3.1b: "three places agree" is not "the session is still alive"
- `handover-rules.json` gains `engineStateFile` / `engineStateArchivedField` (both copies in 03 and 04-templates kept in sync)
- Negative acceptance gains 1 item: **three places agree but the session was archived ⇒ block**

**Why**

While cleaning up old pins we actually hit this: **the panel of the `場景戊` (Scene E) scene pointed at `session-<archived>`,
and that session had already been archived by the engine.**

And `switch-session.mjs check` said "three places agree" — because the three places **really** did agree (they all point at that dead session).

⇒ **The symptom is exactly the same as "one place was not synced" (switching scenes feels like a different person), but the root cause differs.**
You cannot guess it from the symptom ⇒ the two must be checked separately, and only the engine knows "is the session still alive?".

**How it was verified**

- `bash 03-executable-tools/negative-acceptance.sh` → **29 passed, 0 failed** (1 new item)
- `node 03-executable-tools/check-links.mjs` → 52 files / 237 links all pass
- Engine-side measurement: point the panel at an archived `<archived>` (with the three places changed consistently) ⇒
  `scene-memory.mjs check` reports "the session bound to the panel has been archived ⇒ the panel points at a dead session" exit 1
- After the fix `check --all` → all 5 scenes passed (12 items), `呼叫場景.mjs` all "✓ called"

**Pitfalls hit**

| # | symptom | root cause |
|---|---|---|
| 35 | after `workspace/unpinSession` on an old one, **the pins of other scenes were gone too** | the engine's unpin recomputes the whole pin list, and the unpinned old resident session happened to be "the previous occupant of another scene" |
| 36 | the engine reports `cannot pin session ...: the session is archived` | the session the panel points at is archived ⇒ it cannot be pinned ⇒ **the signal that the panel is broken** (this is exactly what the new check catches) |

**Not done yet**

- The engine state file has no automatic update mechanism (right now it relies on running `工具/引擎狀態.mjs` by hand, or refreshing it when switching sessions)
- The `場景乙` (Scene B) scene was built by another tool and never went through this new spec

---

### v0.5 · 2026-11-03 · Engine-side implementation complete: really switched two scenes' sessions, recovered 22 sessions the engine could not read

**What changed**

*repo-side fixes (pre-existing bugs, exposed by running on a real machine)*
- `switch-session.mjs`: the scene config's path candidates **now use the scene id** (`<root>/scenarios/<id>.json`) —
  it used to look up by scene name, while the engine-side filename is an English id ⇒ it could not read it ⇒ the first of the "three places" was always empty
- `switch-session.mjs plan`: new **hard block on "§0 will exceed the hard limit after the session switch"** (reserving room for the signature)
- `session-archive.mjs`: fixed the regex escaping (`$` was not escaped ⇒ it never matched any row),
  the index field semantics (scene name vs scene id), and support for the `Scene Name` field

*engine-side additions (implementations of the engine-neutral contracts)*
- `工具/匯出會話.mjs` ★★ converts the workbench's session logs into the repo's neutral export format;
  **`--all` also exports the old formats the engine cannot read** (decompressing zstd directly)
- `工具/switch-session.mjs` ★★ four engine-side steps: create session → rename the old session ＋ really archive it → open → sync three places → self-check

**Why**

v0.4 only finished the repo-side spec and the file-side tools; **the engine side was empty** —
so those specs had never been verified by a single real session. And "is the spec right" is only known by actually running it.

**How it was verified**

- **Really switched two scenes' sessions** (場景丁/D, 場景丙/C), all green:
  - pre-checks passed → new session created → old session renamed ＋ really archived (`archivedSessionIds` confirmed written)
    → old session unpinned → new session pinned → opening message sent → **three places synced** → self-check passed
  - after the switch `呼叫場景.mjs` reported "✓ called" for all five scenes, and the new sessions really worked
- **29 sessions exported to files** (including the 22 the engine itself cannot read) → `session-archive.mjs extract` →
  29 markdown files ＋ an index, `session-archive.mjs check` passed all 9 items
- `bash 03-executable-tools/negative-acceptance.sh` → **28 passed, 0 failed** (1 new item: blocking when §0 hits the hard limit)
- `node 03-executable-tools/check-links.mjs` → 52 files / 237 links all pass
- `bash 03-executable-tools/workflow-acceptance.sh` → 14 passed, 0 failed

**Pitfalls hit** (six; the first two are "silently doing the wrong thing")

| # | symptom | root cause | fix |
|---|---|---|---|
| 29 | reading the session log yielded only **1 line**, though `zstd -t` said the file was fine | **Node's built-in `zstdDecompressSync` and `createZstdDecompress` only decompress the first frame**; only the `zstd` CLI concatenates all frames | use the `zstd` CLI (`execFileSync`). **This is the easiest one to be fooled by** — "it read successfully" but the content is nearly empty |
| 30 | the index's "scene" column was all blank | the regex's `$` **was not escaped** ⇒ treated as a literal dollar ⇒ it never matched any row | `\|$` |
| 31 | the index's "scene" column was still blank | the key of `rows` is `scene id`, but the field name had been changed to `Scene` ⇒ `r[c]` is undefined | put both keys in |
| 32 | the same user message appears twice | `agent/inbox/spliced` and `user/message` record the same one (spliced first when queued, then recorded officially) | dedupe by "role ＋ text" |
| 33 | the extracted files are mixed with engine-injected content like `<system-reminder>` | the engine records the system prompt as a user message | filter out the engine-injected markers |
| 34 | `session/create` reports `accepts workspaceId or cwd, not both` | the engine does not accept both | pick one depending on whether there is a workspace |

**Measured conclusions about engine behaviour (not bugs, design)**

| question | conclusion |
|---|---|
| After archiving, does the old session still appear in `session/list` | **yes**. `archivedSessionIds` only affects the UI sidebar |
| Can the old session be removed from the workspace's `sessionIds` | **no** (change the engine and it puts it back). The old session really does belong to that workspace, it is just archived |
| Does a new session have to pin itself | **yes**. Without a pin ⇒ the panel cannot find it |

**Not done yet**

- The export tool does not handle retrieval that "merges several sessions of the same scene into one timeline"
- The engine side has no whitelist mechanism for `--all` (right now everything is exported)
- Three old pins (`33411830`/`963c05fb`/`a93204a2`/`525fe20a`) point at archived old sessions and were not cleaned

---

### v0.4 · 2026-11-03 · Adding the archive layer ＋ session switch: the full chat has a home, and the session switch has a self-check

**What changed**

*New docs*
- `02-implementation/6-archive-layer.md` ★★ where the full chat goes: a three-layer split (memory / memory archive / session files),
  the directory spec, the engine export contract, three ways to read it, the hard limits, when to archive
- `02-implementation/7-session-switch.md` ★★ a session switch = one atomic operation with a self-check: when to switch,
  four steps, **three places to sync**, the "rename ≠ archive" pitfall, fork vs session switch

*New tools*
- `03-executable-tools/switch-session.mjs` `plan` (pre-checks) / `check` (three places ＋ check ＋ hard limits)
- `03-executable-tools/session-archive.mjs` `extract` / `index` / `check` / `list`

*Rules (single source)*
- `handover-rules.json` gains: `archiveLayerDir`, `sessionArchiveDir`, `sessionArchiveIndexFile`, `sessionArchiveIndexFields`,
  `sessionFileMaxBytes`, `sessionArchiveKeepCount`, `sessionSwitchPreconditions`, `sessionSwitchSyncCount`,
  `sessionSwitchSignatureFormat`, `sessionSwitchFreshnessHours`, `archivedSessionPrefix` (both copies in 03 and 04-templates kept in sync)

*Demo data*
- demo-scene gains `scene-config.json` (the first of the three places to sync) and the `§0 handover signature` (the third)
- The clean copy is synced too (`demo-workbench.clean/`) — the acceptance scripts rely on it to reset

**Why**

It started with a measured finding: in the session store of a workbench on this machine, **only 7 of 30 sessions could be read by the engine**,
and 23 reported `corrupt`. But `zstd -t` passed on all of them, and **not a byte of the data was broken** —
**the engine had changed its session log format** (the new one puts one frame per line, the old one packs the whole thing into the first frame).

> This means: **if the full chat only lives inside the engine, one engine version change makes the whole batch unreadable.**
> And the repo previously only specified "the memory file is the only accumulation carrier"; it **said nothing at all about where the full chat goes**.

Along the way, two things that exist upstream but not in the repo were added:
upstream has `scripts/換会话.mjs` (an atomic session switch) and the idea of "session files / full chat archiving ＋ indexing",
but in the repo they were scattered across handover documents, with no standalone spec and no tools.

**How it was verified**

- `bash 03-executable-tools/negative-acceptance.sh` → **27 passed, 0 failed** (none of the original 19 broke,
  8 new items: 4 for the session switch ＋ 4 for the session file layer)
  - The key new negative case: **syncing only one of the three places ⇒ exit 1** (tested with each of the two variants)
  - New: **the index points at a non-existent file ⇒ exit 1**
- `node 03-executable-tools/check-links.mjs` → **52 files / 233 links all pass**
- `bash 03-executable-tools/workflow-acceptance.sh` → **14 passed, 0 failed**
- `node session-archive.mjs extract／index／check／list` → all four commands actually run, exit 0
- `node switch-session.mjs plan` → all three session ids are readable, pre-checks passed
- `node switch-session.mjs check --new-session-id <id>` → exit 0 when the three places agree; exit 1 when one is deliberately changed

**Pitfalls hit**

| # | symptom | root cause | fix |
|---|---|---|---|
| 26 | the session switch tool says "§0 has no next step", but the file clearly has one | **the old regex lookahead problem**: `(?=\n### )` already holds **at** the heading line (the `\n` at the end of the heading line is exactly followed by the next `\n###`) ⇒ it only captures the heading itself | switch to **line-by-line scanning** to find the subsection (the third time this repo fell into the same class of regex) |
| 27 | `check`'s "the index points at a non-existent file" can never be found | **`check` called `buildIndex()`** ⇒ it rebuilt the broken index first, hiding the problem | **make `check` read-only**: read the index, never rebuild it |
| 28 | the identity index clearly has the card, but the tool says "this scene is not in the index" | the index's first column is the **scene id** (`demo`), while the tool compares the **scene name** (`demo-scene`) | accept a hit on id / session name / panel title |

> **#27 is the most worth remembering**: **a checker must be read-only.**
> A checker that modifies data wipes the problem on every check —
> it will always return 0 while people believe they are protected. **More dangerous than no checker at all.**

**Not done yet**

- The engine-side (DSH) counterpart: the export and filing of `換会话.mjs` and the "session file layer" on the DSH side
- The session file layer's "by date" way of reading currently relies on comparing date strings; there is no real date index
- `§0`'s "handover signature" currently only checks "is there one", not "is it the latest one"
- The archive layer has no retrieval that "merges several sessions of the same scene into one timeline"

---

### v0.3 · 2026-11-02 · Making the accumulation mechanism real: accumulable artifacts have acceptance, workflows can run

**What changed**

*New tools*
- `03-executable-tools/workbench.mjs` ★ shared module: path resolution ＋ restricted YAML ＋ markdown subsection parsing
- `03-executable-tools/verify-receipt.mjs` ★ receipt three-part set check ＋ **accumulable artifact landing acceptance**
- `03-executable-tools/run-workflow.mjs` ★ offline executor: start / step / receipt / resume / status
- `03-executable-tools/workflow-acceptance.sh` ★ end-to-end acceptance (12 items)

*Mechanism*
- All field names go into `handover-rules.json` (the single source), and both the docs and the tools read it
- The accumulable artifact hard limit is guarded by a tool: **missing accumulable artifact ⇒ block; accumulable artifact not landed in the scene memory ⇒ block**
- The workflow execution layer landed: `runs/<run-id>/` (execution state ＋ handover chain ＋ receipt copies)
- Pre-checks are fail-closed: scene does not exist / missing boundary marker / step without criteria ⇒ refuse to start

**Why**

v0.2 only wrote the spec down clearly. **However nicely the spec is written, if no tool polices it, it is just a request that you remember.**
So this time it was not "adding docs", it was **turning the hard limits into exit codes**, and then actually running it —
because only by really running do you learn what the spec was missing.

**How it was verified**
- `bash 03-executable-tools/workflow-acceptance.sh` → **12 passed, 0 failed** (end to end: three scenes, three hops, a threshold, accumulation crossing scenes)
- `bash 03-executable-tools/negative-acceptance.sh` → **15 passed, 0 failed** (none of the original 15 broke)
- `node 03-executable-tools/check-links.mjs` → 44 files / 195 links all pass
- `node 03-executable-tools/scene-memory.mjs check --all --root 04-templates/demo-workbench` → all scenes passed

**Pitfalls hit** (all five are "written without looking, only visible once you run it")

| # | symptom | root cause |
|---|---|---|
| 18 | `step` blows up: read undefined | **the state property name was wrong**: written as `目前步驟`, read as `目前步驤` (one character off) |
| 19 | the handover chain stayed empty | **regex is unreliable for grabbing markdown subsections**: the lookahead `\s*$` (m flag) holds immediately ⇒ it captures an empty string; lazy ＋ lookahead then eats the last line |
| 20 | three tools each had their own YAML parser | duplicated implementation ⇒ each got it wrong once. Extracted `workbench.mjs` |
| 21 | the dispatch was missing "needs (the previous hop's accumulable artifact)" | the handover chain write failed (#19) ⇒ nothing to read |
| 22 | the threshold asked a human to "hand-edit execution-state.md" | the spec only said "stop and wait", not how to continue ⇒ added `resume --gate-passed` |

> **#18 is the most worth remembering**: a one-character difference, and the program cheerfully wrote it into the file; you only find out when reading it back.
> **Code that has never actually run is code that was never verified.**
>
> Also, **#17 (no recovery mechanism after the run stops)** was something entirely absent from the spec —
> the original spec only said "stop in place on failure", not "how to pick it back up after fixing it".
> The first time fail-closed blocked it, it deadlocked. **This is a gap you cannot find even by implementing the spec faithfully.**

**Two spec gaps fixed along the way**
- Gap 13 (accumulable artifacts had no mechanical acceptance) 🟢
- Gap 14 (workflow execution state had no landing mechanism) 🟢
- Gap 15 (receipt field names were scattered) 🟢
- Gap 16 (the receipt three-part set existed only at the doc level) 🟢
- Gap 17 (no recovery mechanism after the run stops) 🟢

**Not done yet**
- An engine-specific edition (this repo is the engine-neutral edition, the executor is offline)
- `§5`'s accumulable artifacts have no "deprecated" marker syntax (how do you fix an accumulation that went wrong)
- The workflow's `branch` field is defined but **the executor has not implemented it** (right now there is only `failureStrategy`)

---

### v0.2 · 2026-11-02 · Rearranging the architecture: the main line changed from "memory is in the files" to "capability is in the accumulation"

**What changed**

*Narrative main line*
- The headline slogan became "**capability is not in the model, it is in the accumulation**" ＋ the plain-language version "intelligence is given by the model, skill is grown by you"
- The old slogan "memory is in the files, not in the conversation" is **not deleted**, it is demoted to a mechanism sentence (the precondition for accumulation)

*New*
- `00-core-mechanisms/1-accumulation.md` ★★ the new main line: the three symptoms of mainstream frameworks, what accumulation needs as a carrier, the accumulation loop
- `00-core-mechanisms/5-workflow.md` ★★ a workflow = the orchestration of scenes: thresholds, the execution lifecycle, where the execution state goes
- `05-comparisons-and-selection/1-scene-vs-ephemeral-executor.md` ★★ scene vs sub-agent: three real differences ＋ its advantages
- `03-executable-tools/verify-workflow.mjs` a new tool (restricted YAML parsing, no npm dependency)
- `04-templates/workflow-template.md` the workflow definition format

*Renames (git mv, history preserved)*
- `00-core-mechanisms/一-場景記憶.md` → `3-scene-memory.md`
- `00-core-mechanisms/二-場景體系.md` → `2-scene.md`
- `00-core-mechanisms/三-派單與回執.md` → `4-dispatch-and-receipt.md`
- `00-core-mechanisms/四-兩套記憶的分工.md` → `6-two-memory-systems.md`
- `05-comparisons-and-selection/一-與A2A協定的對照.md` → `2-comparison-with-a2a.md`
- `05-comparisons-and-selection/二-場景記憶與語意記憶.md` → `3-scene-memory-vs-semantic-memory.md`
- `05-comparisons-and-selection/三-選型判據.md` → `4-selection-criteria.md`

*Mechanism upgrades*
- Receipt: Diff Set → **the receipt three-part set** (Diff Set · Accumulable Artifact · Next Handoff)
- New hard limit: **a receipt with no accumulable artifact ＝ this job was wasted**
- Shared layer: four boards → **five boards** (workflow added, positioned as "the plan")
- New **L2′ execution layer**: `runs/<run-id>/` (execution state, handover chain) — orchestrator-private
- The shared layer's "four boards" wording changed to five boards everywhere (5 files in total)

*Role terminology (engine-neutral)*
- 「命令台」→ **orchestrator**; 「sub-agent」→ **ephemeral executor**
- The whole text moved to engine-neutral wording, binding to no engine

**Why**

The original proposition was "memory is in the files, not in the conversation" — that is **half of the solution**,
and the repo's really special insight was never stated. The actual pain points are three:

1. **Mainstream multi-agent frameworks rely heavily on message passing** — but most scenes do not need that many heavyweight contexts passing into each other
2. **What a sub-agent does and what it summons, humans cannot see nor manage** —
   the real problem is not "you cannot see it", it is that **it cannot keep evolving**,
   each time relying on the LLM's intelligence rather than on accumulated experience
3. **The more skills, the messier** — the agent does not know which to call, because a skill is a global list rather than the answer to a situation

So the main line became: **accumulation needs a carrier, and the carrier must be rewritable.**
Scene = carrier, workflow = the programming of scenes, the receipt's accumulable artifact = the fuel of accumulation.
Also decided: the **engine-neutral edition** stays in this repo, and the Hermes-specific edition will be a separate project later.

**How it was verified**
- `node 03-executable-tools/check-links.mjs` → **44 files, 191 internal links, all valid** (21 were broken before the rename, all fixed)
- `bash 03-executable-tools/negative-acceptance.sh` → **15 passed, 0 failed**
  (all 10 original scene checks kept unchanged, 5 new workflow negative cases added)
- `node 03-executable-tools/verify-workflow.mjs --root <test dir>` → positive case exit 0, negative case exit 1

**Pitfalls hit**
- The first version of `verify-workflow.mjs`'s YAML parser **broke on nested keys**:
  a `purpose:` / `criteria:` inside a list item would clear the "which list am I in" state,
  causing the second step to be misjudged as "no matching key".
  **Lesson: a parser's state machine must decide membership by "indentation depth", not by "what was the previous key".**
- After the rename, 21 links broke (cross-directory references ＋ the "next doc" navigation at the end of each doc).
  Lesson: **a rename is not done with `git mv` alone** — the end-of-doc navigation and cross-doc references have to be changed together,
  and a link checker has to be there to block it — this time it caught them all at once.

**Not done yet (see the [known gaps](02-implementation/4-known-gaps-and-todo.md))**
- Gap 13: accumulable artifacts have no mechanical acceptance 🔴 (the spec exists, the tool does not)
- Gap 14: workflow execution state has no landing mechanism 🔴
- Gap 15: the receipt three-part set's field names are scattered 🟡

---

### v0.1 · 2026-11-01 · First release

**What changed**
- Built the complete methodology repository: 4 core mechanism docs, the architecture overview, 4 implementation docs,
  the executable tools (validation ＋ negative acceptance), 7 templates, 3 comparison and selection docs
- The topology overview SVG (1280×1075, vector)

**Why**
- To organize the scene memory architecture that was scattered across a personal workbench into a publishable, maintainable, handover-able methodology.
- It started from an architecture discussion about "workbench scene memory", whose conclusions were scattered across several documents,
  with no single source of truth, so maintenance forked.

**How it was verified**
- `bash 03-executable-tools/negative-acceptance.sh` → **10 passed, 0 failed**
- `node scene-memory.mjs check --all --root 04-templates/demo-workbench` → all scenes passed, exit code 0
- The topology SVG was rendered to PNG with resvg and reviewed page by page (v1 fixed L3 being hidden by the summary box and too much whitespace at the bottom;
  v2 fixed the clipped scene card titles and an imprecise layer description)

**Pitfalls hit**
- The first version of the tool's identity index only accepted paths "relative to the CWD",
  so the locator card fingerprint could never be computed → changed to resolve all three of: relative to the workbench root / relative to the scene layer / absolute path.
  **Lesson: path resolution must handle several spellings, otherwise it breaks the moment you run it from another directory.**
- The first version of the negative acceptance script had a fixture missing the three tool-generated files,
  so V3／V11／V7 could not reach the real logic (they were blocked earlier by "missing file") and were misjudged as failures.
  **Lesson: an acceptance script's fixture must first be brought to "all green", otherwise you are testing something else.**

---

## The rules of this list

| rule | why |
|---|---|
| Record only changes to the **architecture** | fixing a typo or a layout does not need an entry |
| You must write "how it was verified" | "it should work" is not verification; write the commands actually run and their results |
| Pitfalls must be recorded | the pitfalls are the most valuable part — they are the signposts for next time |
| Version numbers only increase | unless there is a major refactor |

> **The "how it was verified" column cannot be empty.**
> An empty entry means it was never verified.

---

## Known places where this document will get stale

| place | why it gets stale |
|---|---|
| The hard limit numbers (4 KB / 25 KB / 8 KB) | changing a hard limit means coming back to change this, the tool defaults, the templates, and the spec docs |
| The tools' commands and parameters | a new tool version means coming back to change this |
| The status of the known gaps | fixing one means coming back to change this ([the list](02-implementation/4-known-gaps-and-todo.md)) |
| The cross-links between docs | a filename change means coming back to change this (catch it with `check-links.mjs`) |
| The workflow definition format | a field change means coming back to change the rule table in `verify-workflow.mjs` |

---

⬅️ **Back**: [README](README.md)

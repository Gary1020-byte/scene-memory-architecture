# Plan · Building a "smaller scene"

> Status: **plan, not executed** (drafted 2026-11-09)
> Spec basis: [9 · Scene Granularity and Routing Hierarchy](9-scene-granularity-and-routing.md)

---

## 0. First, block a false premise

**"More scenes → more injection → wasted tokens" does not hold.**

The engine injects `ancestorChain(projectRoot, cwd)` — **the path from the project root down to
cwd**, not every scene. The project root = walk up from cwd until you find a directory
containing `.git`.

Measured on this machine:

| | Characters |
|---|---|
| Global `~/.dsh/AGENTS.md` | 921 |
| All 24 scenes' `AGENTS.md` **combined** | 33,451 (**never injected together**) |
| **What a single session actually injects** | **≈ 2,315** (global + its own one scene) |

⇒ **Splitting scenes does not increase per-session tokens; splitting finely enough actually saves
them** (each smaller scene's `AGENTS.md` is shorter).

**So the reason for "smaller scenes" is not token savings — it's something else.** These three
are the real reasons:

| # | Real reason | Evidence |
|---|---|---|
| 1 | **The accumulation is a different batch** | Video editing §五#11 holds 7 measured values for audio/subtitle axis — a different batch of knowledge from beats/zoompan |
| 2 | **Routing-table hit precision** | 24 scenes / 348 keywords, 14.5 avg per scene, max 30 ("dev tools") |
| 3 | **Clear scene-sovereignty boundaries** | Voice synthesis 職責(2) already claims "separate voice track"; video editing also does audio verification ⇒ the boundaries overlap |

---

## 1. Candidates (three, each filtered through the accumulation criterion)

### Candidate A: audio separation and verification (the original idea)

> Separate the voice from an existing mix, verify the voice is present and aligned.

**Problem: this may be a mis-cut.**

Measured:
- **The voice synthesis scene** 職責(2) already says: "**Separate-track output** — a separate
  voice track plus a mixable accompaniment track, for the sound and video editing scenes to mix"
- **Video editing** §五#11 already has: "verify the voice by subtraction, verify position by
  correlation", "rendering the voice branch alone with silencedetect yields the sentence segments"

⇒ **This work already has an owner.** Cutting a small "audio separation" scene out would be the
textbook "cut too fine" failure from spec §4: two scenes using the same tools (ffmpeg) and the
same knowledge (the relationship between voice and accompaniment) — memory gets cut in half, and
at the seam both scenes have to restate the same thing.

**Unless** the accumulation really is a different batch — for example, "separating voice from a
finished mix" needs a set of model choices, parameters, and misread patterns completely different
from TTS. There is currently **no evidence that this is the common case** (the §〇 measured cases
are about producing and verifying a voice track, not reverse separation).

### Candidate B: SPOT mechanical checking (strongest measured evidence)

> `專案記憶/SPOT檢查.mjs` — a 21 KB mechanical acceptance script for "timing cross-check between
> animated images / video".

**Reasons to split it:**
- It has an **independent language and contract** (§〇 names the "SPOT cross-check contract" as one
  of the video editing scene's three core responsibilities)
- §〇 carries an explicit open item: "fix SPOT key offset" — **this script's own trap**, not
  video editing's trap
- It is useful across scenes (animated images has a corresponding need)
- **It is code, not memory** — a natural fit for a "capability scene": the body is a skill, memory
  is thin

**Reasons not to:**
- It currently lives in video editing's **專案記憶/** (not scene memory), so it was never polluting §〇
- Splitting it means dealing with ffmpeg / animation-rendering dependencies

### Candidate C: subtitle axis alignment (phrase_timing)

> Producing and measuring `phrase_timing.json` (§五 has measured values: subtitles measured 1.6 s
> slower than the voice, pause measurement method).

**For:** this is a **language-layer** job (measuring pauses, cutting phrases by intonation, mapping
back to punctuation), genuinely a different batch from video editing's **picture layer**
(beats/zoompan/transitions).
**Against:** it needs the voice output and the final mix, and overlaps heavily with video
editing's acceptance flow.

---

## 2. Recommendation: **do candidate B (SPOT mechanical check) first, as the "capability scene" demo**

Reasons:
1. **A different batch of accumulation is evidenced** (the key offset is its own trap)
2. **It is code, not memory** ⇒ memory can be very thin — exactly what exercises the new
   "memoryless scene" type
3. **It already lives in 專案記憶/** (not scene memory) ⇒ splitting it out touches no existing
   memory source of truth — **zero risk**
4. **It spans scenes** (video editing + animated images) ⇒ it deserves its own routing keywords

---

## 3. Type design: "Capability Scene"

Today there are three types. The missing cell is exactly "has a dedicated skill, a routing entry,
and a constitution — but does not need to remember how far it got".

### Minimal type

| | Has | Doesn't have | Why |
|---|---|---|---|
| `.git/` | ✅ **required** | | Without it dedicated skills don't load (the symptom is subtle: the constitution still chains) |
| `AGENTS.md` | ✅ **very short** (≤800 bytes) | | Only "what I do / what I don't" |
| `.dsh/skills/<id>/SKILL.md` | ✅ **the body** | | The capability itself lives here |
| `定位卡.md` / `身份卡.md` / `場景畫像.md` | ✅ tool-generated | | |
| `_檔案索引.md` | ✅ | | |
| `專案記憶/` | | ❌ | No project concept |
| `歸檔/` | | ❌ | No handover concept |
| `場景私有記憶.md` | | ❌ | **There is no "how far did I get last time"** |
| Resident session | ✅ | | Must accept work, must be interruptible |

### Memory ownership: the parent scene holds it, the child borrows read-only

The child scene **does not open a memory file**. Its memory lands in the parent's
`場景私有記憶.md`:

- The child's `AGENTS.md` says: "my progress and decisions are written in
  `../影片剪輯/場景私有記憶.md` under §〇 / §五"
- The child scene **only reads**; the **receipt is written back to the parent** (the dispatch
  mechanism supports this natively: send the receipt to the parent)
- ⇒ Memory still has **exactly one source of truth**; the sovereignty rule is intact

### Tools that need changing (3)

| Tool | What changes | Why |
|---|---|---|
| `工具/場景記憶.mjs` `check` | Scene json carries `"型別": "能力場景"` ⇒ skip `場景私有記憶.md` / `專案記憶/` / `歸檔/`; still require `.git`, `AGENTS.md`, locator card, identity card, portrait, skills | `check` currently hard-requires 4 files + 2 directories |
| `工具/場景記憶.mjs` `stamp` | Capability scenes don't write the "memory source of truth" line | The identity card template hardcodes "memory source of truth: 場景私有記憶.md" |
| `工具/派單.mjs` routing table | Entries may carry `"型別": "能力場景"`; keywords still use the compound-term mechanism | The routing logic itself doesn't change — only a type field is added |

**Unchanged**: the registration logic in `建會話.mjs`, `呼叫場景.mjs`, `開新場景.mjs`
(a capability scene still needs the four registrations).

---

## 4. Execution steps (each independently verifiable, each reversible)

| Step | Action | Acceptance | Rollback |
|---|---|---|---|
| **0** | **This plan document** (written) | Human review | — |
| **1** | Write the spec: `00-core-mechanisms/10-capability-scene.md` | Spec has a type definition + a list of tool changes | Delete the file |
| **2** | Change `場景記憶.mjs`: `check` / `stamp` recognize "capability scene" | **Zero impact** on the existing 24 scenes (all checks still run, results unchanged) | `git checkout` |
| **3** | Change `派單.mjs`: routing entries get a `型別` field | The existing 24 entries' routing results are **unchanged** (compare against `路由回歸測試.mjs`) | `git checkout` |
| **4** | Create candidate B's scene: `場景/SPOT檢查/` | The 6-piece set is complete (no memory file) and `check` is green | Delete the directory + `git rm` |
| **5** | Four registrations | Identity index, scenarios json, shared layer index/memory map/areas | Restore each one |
| **6** | Add a routing entry (keywords: `SPOT`, `機械檢查`, `時序對照`, `動態檢查`, `逐格比對`) | `派單.mjs 路由 --要 "幫我跑 SPOT 檢查"` hits it | Delete the entry |
| **7** | Create a resident session + backfill sessionId + stamp + check | `check --場景 SPOT檢查` is all green | Clean up the scene session |
| **8** | **End-to-end real run**: dispatch a real job → receive the receipt → write to disk | The receipt's three pieces are complete | — |
| **9** | Measure: injection volume before/after | Record into the spec | — |
| **10** | Write back the LLM-Wiki concept page + routing table docs | — | — |

**Master rollback switch**: steps 2 and 3 are pure code changes (on a branch, `git checkout` them);
steps 4–7 are files and registrations (on the live `~/.DSH/工作台/`, removed manually if needed).

---

## 5. Risks and stop conditions

| Risk | Likelihood | Mitigation |
|---|---|---|
| Changing `check`/`stamp` affects the existing 24 scenes | Medium | Right after step 2, run `check --all` on all 24 and compare before/after output; **stop if anything differs** |
| Changing the routing table format affects existing routing | Medium | After step 3, run `路由回歸測試.mjs` (67 regression sentences already exist, hit rate 100%) |
| A capability scene has no memory → after a session switch you don't know how far it got | **High** | This is a **designed consequence**, not a bug. Mitigation: a capability scene **doesn't need a resident session** — it is summoned by dispatch and its receipt goes to the parent. If measurement shows it genuinely needs its own progress, add a very thin `場景私有記憶.md` (§〇 only) |
| Routing keywords steal words from an existing owner | Medium | Step 6 uses `派單.mjs`'s ambiguity check; use compound keywords ("時序對照" rather than "檢查") |
| Doing this for its own sake (no real need) | Medium | If step 8 can't produce a real dispatchable job, stop — **don't build a scene just to demo one** |

**Stop condition**: if step 8 finds no real job to dispatch, this capability scene should not
exist (roll back steps 4–7).

---

## 6. One-time cost vs permanent cost

| | One-time | Permanent |
|---|---|---|
| Adds | The capability-scene type spec; a few dozen lines in each of 3 tools | The capability scene's `AGENTS.md` (≤800 bytes, **injected every session**) |
| | One scene directory (6 pieces, no memory file) | Its skill (can grow incrementally) |
| | 4 registrations + 1 resident session | Routing keywords (compound terms — they can be suppressed by other keywords, and the win rate shifts with the corpus) |
| | Adding 3–5 sentences to the routing regression | |
| **vs today** | | **Per-session injection: ≈2,315 → ≈1,700 chars (26% less)** |

---

## 7. Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| 1 | Candidate A / B / C? | **B (SPOT mechanical check)** — evidenced as a different batch of accumulation, it's code not memory, and splitting it touches no memory source of truth |
| 2 | Memory ownership for a capability scene? | **Parent holds it, child borrows read-only, receipt written back to the parent** |
| 3 | Nested (`場景/影片剪輯/SPOT檢查/`, no `.git`) or sibling (`場景/SPOT檢查/`, with `.git`)? | **Sibling with its own `.git`** — nesting can chain the parent's `AGENTS.md`, but the skills become invisible (skills scan only one level of the project root), and `check` would need separate allowance |
| 4 | Should a capability scene have a resident session? | **Yes** (it must be callable by dispatch, and must produce receipts) |
| 5 | Spec first or code first? | Spec first (step 1), because the type definition determines how `check`/`stamp` change |

---

> ➡️ **Related**: [9 · Scene Granularity and Routing Hierarchy](9-scene-granularity-and-routing.md) · [2 · Scene](2-scene.md)

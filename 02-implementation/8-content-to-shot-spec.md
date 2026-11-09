# 8 · Content-to-Shot Spec

> **This doc is the seam spec for "how one video grows out of the source material".**
> The source material is the single source of truth (`content.md`); the shots and the report page are its two consumers.
>
> **The source of this doc is measurement**: on 2026-10-27 it was done end to end once (`ai-agents-report`, 4 min 30 sec, 1920×1080,
> Traditional Chinese voice-over ＋ subtitles, −16 LUFS); this doc turns the traps hit that time and the acceptance discipline into a spec.

---

## 1. The model: two parallel tracks, one source

```
                        content.md (facts ＋ source URLs)
                                    │
              ┌─────────────────────┴─────────────────────┐
              ↓                                           ↓
   Track A · Report / deck                       Track B · Video
   OpenDesign (SSE call)                         narration.json (the narration script)
              ↓                                           ↓
   report/*.html (single-page scroll / deck)      edge-tts per sentence → assets/audio/line-NN.mp3
                                                          ↓
                                              audio_timing.json (each sentence's duration)
                                                          ↓
                            ┌─────────────────────────────┼─────────────────────────────┐
                            ↓                             ↓                             ↓
                     make_beats.py               make_captions.py            build_scenes.py
                            ↓                             ↓                             ↓
                       beats.json                    captions.html            compositions/*.html
                            └─────────────────────────────┼─────────────────────────────┘
                                                          ↓
                                          hyperframes check → render → MP4
                                                          ↓
                                              REVIEW.md (pull frames ＋ vision ＋ ffprobe)
```

> ★ **The video is not converted out of the report HTML.**
> Measured: `build_scenes.py` reads `audio_timing.json` and `beats.json`;
> **it does not read the report HTML, and it does not read content.md** (the content is hardcoded in the Python).
> ⇒ What the two tracks share is the **source material**, not the artefacts.

### Why this split

| | The benefit of splitting |
|---|---|
| Report page | Carries the full detail (tables, sources), good for looking things up |
| Video | Can only carry one idea (the rule in REVIEW: "End on the one idea in one line") |
| Source material | The facts are written once, so neither side can tell a lie |

> ⚠️ **Put the other way round, both sides have to align with the same set of facts separately.** Change the source material ⇒ both sides must be redone.
> This is the other face of "the source material file is the single authority": **it is the single source of truth, and it is the only point that has to be synced.**

---

## 2. The spec of the source material file

### 2.1 `content.md` (source material)

> ★ **The format rule (corrected by measurement on 2026-11-03)**
> The old version wrote "one fact per line, with a source URL" and was **self-contradictory** — the same section also allowed tables.
> The real practice measured (`ai-agents-report/content.md`) is:
> **list entries carry a URL each; the facts carried by a table are annotated with a "table-level source group".**
> Executing it literally would split tables into per-row lists, which does not match the measurement.

```markdown
# <topic>

## 0 Guide / layering
- The mental model the reader has to build first (e.g. "the three are not on the same layer")

## 1-3 Facts (itemised)
- List entries → a source URL each
- Quantified snapshots → state the "date checked"

## 4 Comparison table / list
- Table form; sources annotated as a "table-level source group"
- ⛔ No deleting columns, no summarising into "mostly the same"

## 5 How to choose (decision advice)
- The conclusions drawn from the comparison

## 6 What could not be found / what is uncertain
- Three kinds: ① no verifiable data could be found ② the sources conflict ③ the source version is behind
- On a conflict **write out each version and its source side by side**, do not pick one and call it true
```

> ★ **The measured source material is 6 sections plus a guide, not 3 sections.**
> Leaving out "Guide / layering" and "How to choose (decision advice)" leaves the report two pillars short —
> the measured report page's section skeleton (`report/ai-agents-report.html`) follows exactly these 6 sections.

> ★ **"Write out what you could not find" is a hard rule.**
> Measured: `REVIEW.md` states outright "no benchmark comparison of Claude models was done: no verifiable cross-framework quantitative data could be found,
> and writing one would be fabrication". This is the **principle that a factual referent must use real source material**.

### 2.2 `narration.json` (the narration script)

```json
[
  { "id": "line-01", "text": "Three AI agent tools, …", "path": "assets/audio/line-01.mp3", "duration": 10.68 }
]
```

| Field | Who writes it | Explanation |
|---|---|---|
| `id` | Human | `line-NN`, **unique across the whole film** |
| `text` | Human | What this sentence says |
| `path` | Tool | The per-sentence TTS audio file |
| `duration` | Tool | This sentence's measured duration (**not an estimate**) |

### 2.3 `audio_timing.json` (the timeline)

Produced by the TTS: **each sentence's start and end times ＋ which words each sentence was split into, and how long each word is**.

> ★ **The timeline must come from the measured audio; you cannot estimate it with "characters × 0.4 seconds".**
> Measured: after generating 15 segments one by one, they were **laid into the timeline by speaking rate**, aligned sentence by sentence.

### 2.4 `beats.json` (the rhythm)

```json
{
  "per_scene": {
    "title": [
      { "t": 0.5, "end": 0.993, "sentence": "Three ", "scene": "title",
        "element": "#a-title", "line": 1, "sent": 0 },
      { "t": 26.55, "end": 26.95, "sentence": "", "scene": "title",
        "element": "#a-layers .layer:nth-child(1)", "line": 2, "sent": 1, "filler": true }
    ]
  }
}
```

| Field | Explanation |
|---|---|
| `t` / `end` | **Absolute film length** time (seconds) — not a time relative to the scene |
| `sentence` | The words / phrase spoken in this segment (split word by word) |
| `scene` | Which composition it lands in |
| `element` | **The picture element this line corresponds to** (CSS selector) ⇒ the spotlight hits it |
| `line` / `sent` | Which narration sentence / which clause of that sentence |
| `filler` | There is no matching word, but the picture must not die ⇒ a filler beat is added |

> ★ **`element` is the core of this chain.** See the next section.

### 2.6 ★ Consumers must present it (added by measurement on 2026-11-03)

> ★ **This was the biggest omission in the old version.**
> The old version only required "the source material writes out what could not be found" and stopped there —
> **it never required the consumer (the report page) to present it.**
> Following the old version, the report page could simply not present that chapter,
> and **that is exactly the breeding ground for fabrication**: the source material was honest, but the finished product hid it.

**Hard rules:**

| # | Rule |
|---|---|
| 1 | The report page must **promote the source material's uncertainty chapter to a formal chapter** |
| 2 | **List it item by item, verbatim**; no summarising, no rewriting, no filling in the blanks |
| 3 | The chapter must open with a plain statement (the measured original: "this chapter is part of the report" / "kept verbatim, no speculative filling in") |
| 4 | The source material's "the sources conflict" must **keep the divergence as-is on the consumer side**, not pick one to talk about |

> Measured basis: item 1 of `od-turn-1.txt` ("do not add any metric that has no source…")
> ＋ `report/ai-agents-report.html:830-852` (7 items kept verbatim)
> ＋ `REVIEW.md:33`.

### 2.7 ★ Cross-acceptance: the source material's numbers must be traceable in the finished product

**Rule: every number in the finished product must be traceable to the source material.**

| Check | How |
|---|---|
| Source material ↔ report page | Extract all the numbers from the report page and compare each one back against the source material (measured: all 9 spot-checked values match) |
| Source material ↔ narration script | **See "spoken style must preserve the uncertainty" in §6** |

> ★ The measured quantified snapshot must state the "date checked" (`content.md:154`'s "quantifiable current state (checked 2026-10-27)") —
> a number without a date leaves nobody knowing three months later when it went stale.

### 2.8 ★ Guarding against same-named design systems (a trap caught by measurement on 2026-11-03)

> **Measured: there are two completely different design systems, both called `aurora`.**

| | `open-design/design-templates/html-ppt/assets/themes/aurora.css` | `<vault>/.../<brand-design-system>/assets/vars-light.css` |
|---|---|---|
| Base / primary colour | Deep blue-black `#06091c` ／ cyan-green `#5ef2c6`・blue `#7aa2ff` | Warm white `#FBF9F8` ／ warm gold `#DEC16B`・deep purple `#32283F` |
| Token naming | `--bg` `--accent` | `--c-bg` `--c-accent` |

> ⛔ **Choosing by name is guaranteed to pick the wrong one.**
> And `open-design/design-systems/`'s 148 sets contain **no** aurora —
> Aurora only exists in the vault.

**Rule: a design system must be identified by its "token file path", not by name alone.**
What goes into the source material / workflow is the path, not the three letters "Aurora".

### 2.9 ★ The canonical source material path

> **"The source material is the single source of truth" holds at the semantic level, but there is drift risk at the file level.**
> Measured: the same source material and report exist in **two directories** (the video project directory ＋ the vault project directory);
> the contents' md5 matches but they are **kept in sync by manual copying, with no sync mechanism**.

**Rules:**

| # | Rule |
|---|---|
| 1 | The source material is **one file only**; the canonical path must be written into the workflow definition and the scene memory |
| 2 | Copies in other directories are **read-only mirrors**; changing the source material means changing the copy at the same time (currently done by a human; it should be done by a tool) |
| 3 | Do not copy artefacts to a second location unless there is an explicit "publish" action |

### 2.5 `compositions/*.html` (the shots)

One sub-composition per HyperFrames scene. The **rendering contract of 12 rules** is owned by the `hyperframes` skill;
this section lists only what this chain additionally requires:

| Rule | Why |
|---|---|
| Every timed element needs `class="clip"` ＋ `data-start` ＋ `data-duration` | The basic HyperFrames contract |
| The element `element` refers to **must have a stable `id`** | The spotlight has to be able to hit it |
| The element a `filler` beat refers to must be lightable | Otherwise those 2 seconds of picture are dead |
| One beat group = one track with `data-track-kind="graphics"` | One track per kind, only then can Studio edit it |
| Caption font size ≥ 34 px, position bottom 118 px | 28 px is the threshold; 118 px lands inside the action-safe area without covering the main card |

---

## 3. ★ The SPOT mapping table: the core asset of this chain

**"The narration says this line — which element on screen should light up"** — this is **hand-written per film**.

```python
# make_beats.py (measured)
SPOT = {
    (1, 0): ("title", "#a-title"),
    (1, 1): ("title", "#a-layers .layer:nth-child(1)"),
    (1, 2): ("title", "#a-layers .layer:nth-child(2)"),
    ...
    (9, 0): ("code", "#d-card1 .mech:nth-child(3)"),
}
```

> ★ **This is the hardest part of the whole film to mechanise** — it needs "understanding which element this line is about",
> and **no algorithm can derive it**.
> Yet it is **accumulable**: films of the same kind (product comparisons, conceptual teaching) use the same mapping pattern.

### 3.1 Three ways to fill it in (ordered by reliability)

| # | Approach | Reliability | Cost | Applies when |
|---|---|---|---|---|
| **A** | **Annotate it directly in the narration script**: `this line[#a-layers .layer:nth-child(1)]` | ★★★ Highest | Low | When you are writing the script yourself |
| **B** | **Semantic comparison**: compare the element's visible text against the narration line → produce a suggestion → human confirms | ★★ | Medium | When the script is settled and the elements exist |
| **C** | **Model draft**: give the narration lines + the element list to the model → produce a SPOT draft → human confirms | ★ | High | For a first draft over a large number of lines |

> **★ Acceptance can only verify "is anything missing", never "is it correct".**
> Because the correctness of a SPOT is semantic.
> So mechanical acceptance can only do: **every narration line has a SPOT** ＋ **every SPOT's selector really exists on screen**.

### 3.2 The four mechanically checkable rules

| # | Check | Block or warn |
|---|---|---|
| 1 | Every `(line, sent)` appears in the SPOT | **Block** |
| 2 | Every SPOT's selector really exists in the corresponding scene's HTML | **Block** |
| 3 | No two adjacent beats point at the same element while overlapping in time | Warn |
| 4 | Every beat's `t`/`end` falls inside that scene's time range | Warn |

> ★ **Rule 2 blocks the most common mistake**: you wrote `#d-card1 .mech:nth-child(7)` but the screen only has 6 ⇒
> the spotlight hits empty space ⇒ **the screen looks unresponsive, but check is all green**.

---

## 4. The REVIEW discipline: an all-green check does not mean there is no problem

> **This is the most important acceptance rule in this chain**, and it was learned by measurement.

### 4.1 What `check --json` cannot catch

Measured case (`REVIEW.md` §3b, **with two bugs present check reported 0 errors, 0 craft warnings**):

| # | Bug | Symptom | Why check cannot catch it |
|---|---|---|---|
| 1 | The six mechanism rows **appear in reverse order** | The card looks like it only has two rows, in reverse order | All the elements are there, all within the timeline ⇒ the static audit has nothing to say |
| 2 | The grey explanatory box **covers the three white cards** | Visual overlap | No overflow, nothing out of bounds ⇒ it violates no layout rule |

### 4.2 So acceptance must be three layers

```
① check --json          static audit: contract violations, insufficient contrast, audio problems
② Pull frames after rendering   ★ look at them one by one with vision (13 time points + a contact sheet)
③ ffprobe measurements  duration, audio track presence, LUFS / dBTP / clipping
```

> ★ **② is the only way to catch "the order is wrong" and "overlapping without overflow".**
> ① being all green **does not** mean there is no problem — this is the assumption this chain is most likely to step on confidently.

### 4.3 The fixed structure of REVIEW.md

```markdown
# REVIEW — <film title>
Project: <path>  Length: <seconds> / <size> / <fps>  Voice-over: <engine / voice / rate>
## 1. Measured vs merely looked at   ← mark each item as measured or only looked at
## 2. Creative calls made     ← why it was done this way (and why certain things were not done)
## 3. Storylines not done       ← state plainly what was not done and why
## 3b. Bugs found only after rendering      ← ★ caught even though check was all green
## 4. Known weaknesses                ← honestly list what is unsatisfactory
## 5. Deliberately kept items          ← the ones that look like bugs but are intentional
## 6. Artefacts                  ← the file list
```

> ★ **§3b and §4 are the two most valuable sections.**
> §3b is "the tool's blind spot", §4 is "this time the finished product is still not good enough" —
> both are information the next film can use directly. **Do not delete them.**

---

## 5. ★ Accumulable artifacts (what the next film takes away)

What this chain should really accumulate is **not** the film itself, but these:

| # | Accumulable artifact | Where it lands |
|---|---|---|
| 1 | The 12 rules of the HyperFrames rendering contract | The `hyperframes` skill (already owned) |
| 2 | 9 video colour schemes ＋ house style ＋ motion spec | OpenDesign `design-templates/hyperframes/` (**an available resource**, not used in the measurement; see §6.2) |
| 3 | **"An all-green check does not mean there is no problem" ＋ pulling frames with vision** | **scene G's §5** |
| 4 | The causes of the two post-render bugs (wrong nth-child index / flex missing `flex: 0 0 auto`) | **scene G's §5** |
| 5 | **The three ways to fill in the SPOT mapping ＋ the four mechanical acceptance rules** | **This doc** |
| 6 | The self-check that captions **rebuild the original sentence verbatim** (all 15 lines passed) | scene G |
| 7 | The source material file's "write out what you could not find" discipline of fact | scene F |
| 8 | OpenDesign's **confirmation gate**: first report "which design system / working directory you read, and what you plan to do", and only produce after confirmation | scene F |
| 9 | Caption font size 34 px, position bottom 118 px (28 px is only the threshold) | scene G |

---

## 6. The duty boundary of each track

| | Track A · scene F | Track B · scene G |
|---|---|---|
| Output | The HTML of the report page / deck | MP4 ＋ the project files ＋ REVIEW.md |
| Engine | OpenDesign (SSE call) | HyperFrames (HTML→MP4) |
| Shared | **`content.md`** ＋ **design token** | Same |
| ⛔ Does not do | Does not make the video | Does not make the report page (that is track A's) |

> ★ **What is shared is the source material and the tokens, not the artefacts.**
> The two consumers **do not convert into each other** (measured: the video did not come from the report HTML).
> This is deliberate: **conversion loses information** (the report page's tables do not fit in 1080p, the video's rhythm does not hold on a single page).

### 6.1 ★ Spoken style must preserve the source material's uncertainty (a real rupture caught by measurement on 2026-11-03)

> **Two measured cases:**
>
> | # | Source material | Narration script | Problem |
> |---|---|---|---|
> | 1 | `content.md:158`'s `257,602` | "two hundred and fifty-seven thousand stars" | ✅ The number matches; it is only spoken style |
> | 2 | `content.md:119`'s "architecture page 70+ / docs 60+ / README 40+ **three inconsistent figures**" | Only "the architecture page says seventy-some tools" | ⚠️ **The uncertainty was digested away** |
>
> ★ Case 2 **is not fabrication** (it is source-qualified), but **the audience will not know that the official figures disagree**.
> **This is exactly the side effect of spoken style: it naturally tends toward "telling one version".**

**Rules:**

| # | Rule |
|---|---|
| 1 | Numbers in spoken narration **must be traceable back to the source material's original value** |
| 2 | Where the source material marks "the sources conflict / it is uncertain", the spoken version **must not pick just one version to tell**; it has to be phrased as "the three figures disagree" |
| 3 | Omission is allowed, **but omission must not manufacture false certainty** |

### 6.2 ★ The source of truth for the visual tokens (corrected by measurement on 2026-11-03)

> ★ **The old version wrote the video side's visual source as "the 9 colour schemes of OpenDesign `design-templates/hyperframes/`" —
> that is a misattribution.**
> Measured: **not one of the 9 hyperframes palettes was used** (they are all saturated multi-colour schemes, off-brand).
> The video's primary colours come from **Aurora** (`#DEC16B` ＋ `#32283F` ＋ `#6F677B`),
> and the report page's CSS is the same colour as `compositions/*.html` ⇒ **the two tracks really do share the visual tokens**.

| | The truth |
|---|---|
| The 9 hyperframes palettes | **An available resource**, not "already owned and already used" |
| The Aurora token file | **The visual source of truth** (shared by the two tracks) |

> A design system must be identified by its **path**, see §2.8.

---

## 7. What this chain is still missing (spec level)

> ★ **Corrected on 2026-11-03: the old version only surveyed track B's gaps; track A's gaps were not listed at all.**

### 7.1 Track A (scene F) gaps

| # | What is missing | Impact |
|---|---|---|
| A1 | **Criteria for choosing a template** (what shape / density / tone each of the 48 templates suits) | You have to re-pick every time; measured it is "a combination of three templates", and no single template is enough |
| A2 | The **output format of the confirmation gate** is not nailed down (only "report the status first") | The content of each report drifts |
| A3 | **No tool** for the source material ↔ report page number cross-acceptance | See §2.7; it can only be spot-checked by hand |
| A4 | The **canonical source material path** is not declared | See §2.9; the copies drift |
| A5 | **Guarding against same-named design systems** | See §2.8; there are two "Aurora"s |
| A6 | **The rules for taking logos** (if you cannot fetch it, leave it blank and annotate it, **never redraw it yourself or substitute a similar shape**) | Measured: `od-turn-1.txt` hard requirement 2; the spec missed it |
| A7 | The **OpenDesign call layer** cannot be re-run | Every revision means pasting the command again |
| A8 | **The criterion for single-page scroll vs deck** | When the source material is a long-form report page, the deck shape cannot fit the big tables |

### 7.2 Track B (scene G) gaps

| # | What is missing | Impact |
|---|---|---|
| B1 | **The content is hardcoded inside `build_scenes.py`** | Every new film means rewriting a 40 KB script |
| B2 | **The SPOT mapping is hand-written per film** | See §3 |
| B3 | **No method for "source material → narration script"** | The narration script is hand-written too |
| B4 | **The OpenDesign call is a manual SSE** | A track A problem, see A7 |
| B5 | **The acceptance discipline of REVIEW has no tool** | It all depends on remembering to pull frames — ★ the one that should be built first |
| B6 | **Spoken style does not preserve the uncertainty** (§6.1) | The audience thinks there is only one official version |

> ★ **B5 is the one that should land first**: make "check → render → pull 13 frames → contact sheet" into one tool,
> and "post-render acceptance" goes from relying on memory to relying on the process.

---

> ⬅️ **Back**: [Implementation README](README.md) ｜ **Previous**: [7 · Session Switch](7-session-switch.md) ｜ **Related**: [5 · Workflow](../00-core-mechanisms/5-workflow.md) · [4 · Dispatch and Receipt](../00-core-mechanisms/4-dispatch-and-receipt.md)

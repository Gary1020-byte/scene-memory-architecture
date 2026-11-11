# 6 · As Actually Run

> This doc describes **reality**, not design intent.
>
> The spec (core mechanisms + implementation) says "what it should be". This says "as of 2026-11, what it actually is: which parts grew, which parts never grew, and where the two disagree".
>
> The reason this exists is one sentence: **do not let the docs become lies.**

---

## 1. Why a separate doc

Every rule in the spec is still true. The problem is not that the rules are wrong — it is that they were written when there were three scenes, and they now describe a world that no longer exists.

| The spec says | Measured on 2026-11 | The gap |
|---|---|---|
| 3 scenes | **24 scenes** | "Command" was renamed "Master" |
| shared layer = todo board / conflict log / index ledger | **only the routing table is alive** | the other three are empty files |
| two memory systems (file + Hindsight) | **four** | the two Hermes-wide ones are missing from the spec |
| the human talks to the scene | **Hermes is the entry point** | the spec has no wire between the two systems |
| no workflows | **3 workflow files, 2 real runs** | there is a third layer |
| semantic layer is wired up | it says so itself: "**not yet connected**" | the file admits it, the overview does not |
| Hindsight isolates scenes | **one bank, and `RecallRequest` has no `bank_ids`** | **scene-level semantic memory is actually shared** |

**None of this is a bug. It is a spec that has expired.** An expired spec is more dangerous than no spec: it tells you "the shared layer should have a conflict log", and you go looking for a 47-byte empty file.

---

## 2. The actual system map

```
                        ┌─────────────────────────────┐
   You ────────────────▶ │  Hermes (global, scene-agnostic)│
   (you talk to Hermes) │                             │
                        │  · MEMORY.md / USER.md      │ ← injected every turn
                        │  · Hindsight bank: hermes  │ ← semantic recall, cross-session
                        │  · kanban.db               │ ← dispatch
                        │  · skill: workbench-routing│ ← ★ the only wire
                        └──────────────┬──────────────┘
                                       │ reads 場景/_共享記憶/路由表.json
                                       │ then node 工具/派單.mjs dispatches
                       ┌──────────────▼──────────────┐
                       │  DSH workbench (per-scene)   │
                       │                             │
                       │  scenes/<name>/ (24 of them, │
                       │   each an independent git    │
                       │   repo ＝ the project root)   │
                       │   ├ AGENTS.md     scene law   │
                       │   ├ scene-private-memory.md   │
                       │   │   (§0 handover — truth)  │
                       │   ├ .dsh/skills/  own skills  │
                       │   └ locator-card.md identity  │
                       │                             │
                       │  shared layer               │
                       │   └ routing-table.json ★live │
                       │   └ dispatch/, routing-      │
                       │     feedback.jsonl           │
                       └─────────────────────────────┘
```

**The DSH engine itself does not know the shared layer exists.**

Measured: `grep -rl '共享記憶|sharedMemory' @deepseek-ai/dsh/ --include='*.js'` → the only hit is a web-frontend locale file. Zero in the engine.

The engine knows exactly two things: the session's working directory, and the first ancestor directory containing `.git` (＝ the project root). Anything cross-scene **must** be implemented at the tool layer, because the engine has no cross-scene concept at all.

### The only wire

`~/.hermes/skills/workbench-routing/SKILL.md`:

> **Any task: run the mechanical router first. If it hits a scene, dispatch — do not do it yourself.**
> ```bash
> node ~/.DSH/工作台/工具/派單.mjs 路由 --要 "<the user's own words>"
> ```
> Exit code 3 (no mechanical hit) → read `場景/_共享記憶/路由表.json` and judge by responsibilities.

**So the shared layer's real role is not "shared memory". It is "the cross-scene routing table + dispatch channel".**

Hermes is the **router**; DSH is the **executor**. The routing table is the shared interface between them — and it is the single source of truth (DSH writes it, Hermes reads it).

---

## 3. The shared layer: only two parts are alive

The shared layer is 138 KB. Its contents fall into three fates.

### ✅ Alive (tools read it, and tools write it)

| file | size | who reads it | measured |
|---|---|---|---|
| `routing-table.json` | 11 KB | the dispatcher | 1298 routing attempts, **1221 hits, 77 misses, 94.1% hit rate** |
| `routing-feedback.jsonl` | 202 KB | audit tooling | append-only trail; the last line was a test I ran minutes ago |
| `dispatch/<scene>/*.md` | 13 receiving scenes | dispatcher + receiver | **53 dispatches** (plus 40 receipts, 51 state files); email 13, stock research 9, visual gen 5… |
| `skill-mapping.json` | 6.7 KB | `技能分配.mjs`, `讓位.mjs` | single source of truth for skill allocation |
| `index.json` / `memory-map.json` | 4.8 / 3.6 KB | `一致性稽核.mjs`, `開新場景.mjs` | verifies each owner matches a real panel id |
| `areas/*.md` | 22 files | audit | one area card per scene |

### ⚠️ Half-alive (tools write it, no agent reads it)

| file | size | what is really going on |
|---|---|---|
| `_跨場景通知.md` | **93 KB** | tools append to it, but **no scene agent ever reads it**. Notifications actually reach a scene through the **dual write** — straight into the receiver's `## 0 - Notifications` section of its private memory |
| `_場景活動.md` | 44 KB | tool-generated (deterministic aggregation, no LLM). This is the "event layer", and the only place that admits the semantic layer is "**not yet connected**" |

### ❌ Dead (no program references them)

| file | size | reality |
|---|---|---|
| `_待辦.md` | **24 bytes** | barely used since it was created |
| `衝突.md` | **47 bytes** | same |
| `索引.md` | 568 bytes | read by humans only, no program reads it |
| `项目.json` | 20 bytes | only `場景記憶.mjs` reads it, and only to look up one long-gone project |

**The spec lists "todo board / conflict log / index ledger" as core shared-layer furniture. In the implementation, all three are empty.**

This is not a bug — it is "something the spec described that never grew". And `_場景活動.md` says so itself:

> 語意（當初為什麼這樣決定）→ Hindsight 知識頁（**尚未接上**）

**Your own files were telling the truth all along. The overview just never caught up.**

---

## 4. Dispatch and receipt: what it actually looks like

### The four-part dispatch (a real one)

```markdown
【資訊策展 · 派單 · 請回執】
- 派單 id：派單-20261104-210519-timd
- 發起方：master
- 收件方：資訊策展

做什麼：
  建立本場景的第一份資產：KOL 一手來源清單＋選題卡模板。① … ② … ③ …

判據：
  ① 來源清單檔落盤且兩條線合計 ≥24 個來源，每個都有實際驗證過的可開啟網址
  ② 選題卡模板檔落盤且八欄齊全
  ③ 場景記憶 check 通過
  ④ 回執列出檔案路徑、來源數量與實際失效的來源清單

落盤位置：
  場景/資訊策展/專案記憶/來源清單.md；…/選題卡模板.md；…/場景私有記憶.md

回執方式：
  ① 結論 + 證據 + 路徑
  ② 必須帶「差異集合」
  ③ 必須帶「可累積物」★ 少了這條＝這次活白做
  ④ 必須寫明「下一棒」
  ⑤ ★ 回執的第一行必須原樣寫出派單 id
```

Receipt clause ⑤ grew out of combat: it exists to confirm *this* reply belongs to *this* dispatch and not another.

### 94.1% routing hit rate

1298 attempts, 1221 hits. **The 77 misses are the input to improving the routing table** — `logRouteFeedback` exists so the table improves from data rather than from feel:

```json
{"時間":"2026-11-11T07:23:18.538Z","原話":"看看這個專案是哪個 instagram reel","命中":null,"關鍵字":null}
```

That miss is tomorrow's improvement.

### But routing does misjudge — and that is known

From the routing skill itself:

> ★ **The mechanical router misjudges "writing" as "publishing".** Measured: "續寫公開網站文章" hits **產品發布** ("公開" is its keyword)… but the right scene is **內容創作**.
> ⇒ **After a routing hit, check whether the hit scene's responsibility matches the user's verb.**

**So it is two-stage: mechanical routing, then a human (or model) judgement.** Not "the router is always right".

---

## 5. Scenes: 24 of them, and they are genuinely used

### Usage distribution (routing hits)

```
105  開發工具      52  知識庫        30  動態圖像
103  自我復盤      51  影片剪輯      30  內容創作
 79  股票研究      48  每日簡報      24  資訊策展
 76  本地電腦      41  音效配樂      21  主控端
 66  視覺生成      38  語音合成      17  新增場景
 62  NTU 課程      38  食譜
 62  產品發布      35  英語學習
 55  郵件處理      30  考古題庫
 54  文件處理
 52  簡報設計
```

**All 24 scenes have been routed to.** This is not "two scenes in use and twenty-two empty".

### What each scene is made of (deterministic aggregation)

| scene | commits | skills | project memory | §5 decisions |
|---|---|---|---|---|
| 本地電腦 | 13 | 6 | 3 | 3 |
| 自我復盤 | 17 | 10 | 3 | 6 |
| 新增場景 | 17 | 3 | 2 | 2 |
| 郵件處理 | 4 | 4 | 0 | **41** |
| 音效配樂 | 3 | 3 | 0 | **28** |
| 簡報設計 | 6 | 10 | 4 | **24** |
| 語音合成 | 10 | 1 | 2 | 17 |

**The gap in the §5 column is the interesting part**: email processing has only 4 commits and 0 project memories, yet 41 decisions and pitfalls.

> **Project memory is output; §5 is experience.** Work that is frequent but repetitive (health checks, cleanup) ⇒ few commits, few projects, but pitfalls accumulate fast — the same trap gets hit every time.
> Work that produces something new ⇒ many project memories.

**The two columns are complementary, not redundant.**

### Actual memory file sizes

| scene | §0 | main file | headroom |
|---|---|---|---|
| 自我復盤 | 4 047 B | 7 627 B | **49 B ⚠** |
| 本地電腦 | 1 693 B | 3 608 B | 2 403 B |

**The 4 KB limit really does get hit.** Self-review has 49 bytes of headroom — that is precisely why a threshold that is a gate and not a suggestion is worth having.

---

## 6. Workflows: a third layer the spec does not have

Three YAML files under `工作流/`, two real runs under `執行/`.

```yaml
id: 簡報到影片
說明: 一份素材走兩條線：線 A 出簡報／報告頁，線 B 出影片。兩線共用素材與 design token，
      但不互相轉換——轉換會有損。
入口: 簡報設計

步驟:
  - 場景: 簡報設計
    目的: 把素材變成有品牌感的簡報／報告頁（HTML），並定稿旁白稿
    判據: ① 報告頁 HTML 落盤且首行標明用的 design system；② 旁白稿落盤且逐句對應素材事實
    落盤: 場景/簡報設計/專案記憶/<主題>-簡報與旁白稿.md
    需確認: true
  - 場景: 影片剪輯
    目的: 把旁白稿剪成可交付的 MP4，並產出 REVIEW
    判據: ① MP4 落盤且 ffprobe 量到時長與音軌存在；② REVIEW.md 六節齊全
    落盤: 場景/影片剪輯/專案記憶/<主題>-影片與REVIEW.md
    需要: 簡報設計的旁白稿與素材檔
    需確認: false

失敗策略: 停在原地等人
```

### Scene vs workflow vs dispatch

| | scene | workflow | dispatch |
|---|---|---|---|
| decides | **who** does it | **how** it is done | **what this one** is |
| shape | a directory | a YAML file | a markdown file |
| steps | free-form | fixed steps with gates | unconstrained |
| judgement | the scene decides | AI judgement kept inside nodes | the receiving scene decides |
| crosses scenes | no | **yes, in fixed order** | one receiver at a time |
| example | video editing | slides→video | look up an exchange rate |

**The core definition: the output is a function of the input.** That is the boundary between a workflow and a scene — a scene lets the AI work freely in context; a workflow pins it into a repeatable sequence of steps.

**`需確認: true` is the human go/no-go point; `失敗策略: 停在原地等人` is fail-closed in another shape.**

### Real execution trails

```
執行/簡報到影片-2026-11-03-043137/工作流.yaml
執行/貓咪10秒影片-2026-11-05-587319/工作流.yaml
```

Both left a replayable execution directory.

---

## 7. The Hermes side: three memory systems the spec does not have

The spec discusses "two memory systems" (scene memory + Hindsight). There are actually **four**:

| | where | scope | single source of truth? | who reads it |
|---|---|---|---|---|
| **scene memory** | `scenes/<x>/scene-private-memory.md` | per scene | ✅ | that scene's agent |
| **Hindsight** | bank `hermes` (Postgres + pgvector) | global | ✅ | every Hermes session (semantic recall) |
| **Hermes MEMORY.md** | `~/.hermes/memories/` (5 707 B) + `USER.md` (5 203 B) | global | ✅ | **injected into every turn of every session** |
| **kanban.db** | `~/.hermes/kanban.db` | global | ✅ | Hermes tooling |

### The division of labour in practice

```
MEMORY.md / USER.md  → things about YOU: preferences, accounts, language, rhythm
                      injected every turn, so it must stay tiny (5.7 KB)
Hindsight            → FACTS across sessions: what was looked up, what was learned
                      recalled on demand, no fixed token cost
scene private §0     → where THIS scene stands: progress, next step, blocker
                      ≤ 4 KB, overwritten
kanban.db            → dispatch and state
```

**The sharpest cut here is "facts" versus "progress"**:

> Hindsight stores the **facts** that can be recalled across sessions; the handover file (§0) stores the **current progress and next step**.
>
> "The next step" is an **intention that cannot be derived from existing actions alone** — it must have an explicit landing place, and semantic recall cannot supply it.

### But there is a gap

**Hindsight currently has a single bank `hermes`** (13,706 nodes / 562,623 links / 209 documents).

And Hindsight's `RecallRequest` **has no `bank_ids` field** — one recall can only query one bank. Therefore:

> "Isolated scene memory" on Hindsight = splitting into banks. With one bank ⇒ **the semantic memory between scenes is actually shared, not isolated.**

That is **not** the same isolation as scene memory (physical files + git boundary). When the spec says "the two memory systems complement each other", it does not make clear that the Hindsight side never did the isolation.

---

## 8. Three layers of memory, and how long each may be

Memory length is determined by **how often it is read**, not by how important it is.

```
① Injection layer   global iron rules   injected every turn ⇒ must be tiny
② Private layer    §0 handover         read at every scene start ⇒ ≤ 4 KB, overwritten
③ Shared layer     routing table       queried on demand (the rest is tool-only)
```

**§0 answers exactly four questions: who am I / where am I / what is next / what is blocking me.**

Writing it as a weekly report is the classic mistake — it busts the limit, and a new session that reads it still does not know what to do next.

### ⚠️ The injection layer has a live problem right now

`~/.dsh/AGENTS.md` (1 958 B, **injected into every turn of every scene**) says:

> 四个场景：**命令 / B站 / 自我复盘 / 本地电脑**，每个场景目录 工作台/场景/<名字>/ 就是一个**独立 git 仓库**

**This is out of date**: there are 24 scenes now, "Command" was renamed "Master", and the paths were converted to Traditional Chinese (`工作台/场景/` → `工作台/場景/`).

**A file that injects "there are four scenes" into every agent's context, in every turn.** This is the worst instance of "docs becoming lies" — because it is not sitting in a file, it is **in every agent's context**.

---

## 9. The complete gap table

| # | the spec says | reality | impact |
|---|---|---|---|
| 1 | 3 scenes | 24 | scale numbers expired |
| 2 | the scene is called "Command" | it is called "Master" | names do not match |
| 3 | shared layer has a todo board | `_待辦.md` 24 B, unreferenced | never grew |
| 4 | shared layer has a conflict log | `衝突.md` 47 B, unreferenced | never grew |
| 5 | shared layer has an index ledger | `索引.md` 568 B, humans only | never grew |
| 6 | shared layer ＝ shared memory | routing table + dispatch channel | **role misread** |
| 7 | two memory systems | four | the Hermes-wide ones are missing |
| 8 | semantic layer is wired up | it says "not yet connected" | it really is not |
| 9 | Hindsight isolates scenes | one bank, no `bank_ids` | **scene-level semantic memory is shared** |
| 10 | the human talks to the scene | Hermes is the entry point | the wire is undocumented |
| 11 | no workflows | 3 YAML files, 2 runs | a missing layer |
| 12 | global constitution says "four scenes" | 24 | **wrong words, injected every turn** |
| 13 | shared-layer files are read by agents | `_跨場景通知.md` 93 KB, unread | notices arrive via dual write instead |
| 14 | hardcoded "3 scenes" | the overview itself says "scale is free" | self-contradictory |

---

## 10. What the measurement confirmed

This part matters — the rewrite is **not** a refutation; it separates what was never verified from what was.

| design | measured result |
|---|---|
| **Memory lives in files, not in sessions** | ✅ all 24 scenes' §0 hold real progress and a next step, surviving across sessions |
| **Scene ＝ independent git repo ＝ project root** | ✅ 148 scene-specific skills, all loaded, none missed |
| **Boundaries are facts, not promises** | ✅ `驗證場景隔離.mjs` exists and runs |
| **One dispatch = one receipt** | ✅ 53 dispatches spread across 13 receiving scenes |
| **Hard limits are gates, not suggestions** | ✅ self-review's §0 with 49 B of headroom gets blocked |
| **Routing needs a feedback loop** | ✅ 1298 attempts / 94.1% hit / 77 misses feed the next improvement |
| **Shared layer ＝ cross-scene collaboration** | ✅ but **not "shared memory"** — that is what the rewrite fixes |
| **Tool-generated files must resist hand-editing** | ✅ a changed locator card fails the fingerprint check |
| **§0 overwritten, §5 appended** | ✅ different lifecycles, complementary (see §5) |
| **Rules must be judged mechanically, fail-closed** | ✅ `反例驗收.sh` 10 pass / 0 fail |

---

## 11. What should change next

This doc only describes. The actual changes split into two batches.

### Batch 1 — retire the stale claims (cheap, high value)

1. `overview.md`: the "3 scenes" paragraph, and the section-navigation table
2. `~/.dsh/AGENTS.md`: the scene list and the paths — **it injects every turn**
3. The L1 shared-layer description: note that what is alive is the routing table and the dispatch channel
4. `00-core-mechanisms/6-two-memory-systems.md`: it is four systems, and the Hindsight side is not isolated

### Batch 2 — decide whether to grow what never grew

| option | content | my view |
|---|---|---|
| A | make `_待辦.md` / `衝突.md` actually used | the spec asks for them; worth building. But first decide whether they are for humans or for tools |
| B | split Hindsight into one bank per scene | expensive (rebuild the knowledge graph), and scenes arguably *should* share part of it |
| C | connect the semantic layer | already on the todo list, in the tool's own words |
| **D** | **write the Hermes side into the spec** | **the most important one** — it is the entry point; without it in the spec, the whole system stays invisible |

**D is the one that matters.** The spec currently describes a world where "the human talks to the scene directly", but the world actually in use is "the human talks to Hermes; Hermes routes; the scene executes". **Without that written down, whoever reads the spec next — including you in three months — will assume the entry point is the scene.**

---

## 12. How to verify this doc

```bash
# scene count
ls -d ~/.DSH/工作台/場景/*/ | grep -v '/_' | wc -l

# routing hit rate
python3 -c "
import json
rows=[json.loads(l) for l in open('~/.DSH/工作台/場景/_共享記憶/路由回饋.jsonl') if l.strip()]
hit=sum(1 for r in rows if r.get('命中'))
print(f'{len(rows)} attempts / {hit} hits / {100*hit/len(rows):.1f}%')
"

# which shared-layer files no program references
cd ~/.DSH/工作台/工具 && for f in _待辦.md 衝突.md 索引.md _跨場景通知.md 路由表.json; do
  echo -n "$f -> "; grep -rl "$f" *.mjs 2>/dev/null | tr '\n' ' '; echo
done

# dispatch distribution (dispatch files only, not receipts or state files)
for d in ~/.DSH/工作台/場景/_共享記憶/派單/*/; do
  echo "$(find $d -name '派單-*.md' ! -name '*.回執.md' | wc -l) $(basename $d)"
done | sort -rn

# workflows
ls ~/.DSH/工作台/工作流/ ~/.DSH/工作台/執行/

# the engine does not know the shared layer
grep -rl '共享記憶|sharedMemory' ~/.local/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/ \
  --include='*.js' 2>/dev/null | grep -v langs
```

---

⬅️ **Back**: [README](../README.md) · [overview](../overview.md) · [core mechanisms](../00-core-mechanisms/)

#!/usr/bin/env node
/**
 * 會話檔案.mjs —— 會話檔案層（聊天全文的歸處）
 *
 * 用法：
 *   node 會話檔案.mjs 抽出 --root <工作台根> --會話 <會話id> --場景 <場景名> [--引擎端 <匯出檔>]
 *   node 會話檔案.mjs 索引 --root <工作台根>
 *   node 會話檔案.mjs 檢查 --root <工作台根>
 *   node 會話檔案.mjs 列出 --root <工作台根> [--場景 <名>] [--關鍵詞 <字>]
 *
 * 退出碼：0 = 通過；1 = 有問題；2 = 用法錯誤
 *
 * ★ 這支工具做的是「引擎中立的部分」：
 *   把引擎匯出的會話紀錄變成可讀的 markdown 檔 + 一份可檢索的索引。
 *   **引擎怎麼匯出、匯出什麼格式，是引擎端的事**——
 *   本工具只認一種匯出格式（見下），引擎端把會話轉成那個格式即可。
 *
 * ★ 匯出格式（引擎中立契約，engine-neutral）：
 *   一個 JSON 檔，結構為
 *     {
 *       "會話id": "session-xxxx",
 *       "會話名": "場景名",
 *       "場景id": "scene-id",
 *       "開始時間": "2026-11-02T15:03:19+08:00",
 *       "訊息": [
 *         { "角色": "使用者|助手|工具", "文字": "……" },
 *         …
 *       ]
 *     }
 *   角色名可用「user/assistant/tool」或「使用者/助手/工具」，兩種都收。
 *
 * ★ 為什麼要有這一層：
 *   場景記憶只管「結論」，聊天全文是另一回事（上游原版的說法）。
 *   沒有這一層 ⇒ 換掉的舊會話只剩引擎內部的黑盒子，
 *   引擎一改版（換了 log 格式）就整批讀不回來。
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  loadRules, resolveMemoryRoot, readText, writeText, exists, now, today,
} from './工作台.mjs'

const args = process.argv.slice(2)
const cmd = args[0]
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const hasArg = (n) => args.includes(n)

const root = getArg('--root')
if (!root) {
  console.error('用法：node 會話檔案.mjs <抽出|索引|檢查|列出> --root <工作台根> [其他參數]')
  process.exit(2)
}
const rules = loadRules(root)
const memRoot = resolveMemoryRoot(root)

/* 會話檔案層住在工作台根（跨場景），不跟著場景走 */
function archiveRoot () {
  return path.join(root, rules['會話檔案層目錄'] || '會話檔案')
}
function indexPath () {
  return path.join(archiveRoot(), rules['會話檔案索引檔名'] || '_會話檔案索引.md')
}
function sceneDir (name) {
  return path.join(memRoot, name)
}

/* ───────────────────────── 讀匯出檔 ───────────────────────── */

function normalizeRole (r) {
  const s = String(r || '').trim().toLowerCase()
  if (['user', '使用者', '人', 'human'].includes(s)) return '使用者'
  if (['assistant', '助手', 'ai', '模型'].includes(s)) return '助手'
  if (['tool', '工具', 'tool-call', 'tool_result'].includes(s)) return '工具'
  return '其他'
}

/** 讀引擎匯出檔。支援單一物件或物件陣列。 */
function readExport (p) {
  const j = JSON.parse(readText(p))
  const arr = Array.isArray(j) ? j : [j]
  return arr.map((o) => ({
    會話id: String(o['會話id'] || o.sessionId || o.id || '').trim(),
    會話名: String(o['會話名'] || o.sessionName || o.title || '').trim(),
    場景id: String(o['場景id'] || o.sceneId || '').trim(),
    開始時間: String(o['開始時間'] || o.startedAt || o.createdAt || '').trim(),
    訊息: Array.isArray(o['訊息'] || o.messages) ? (o['訊息'] || o.messages) : [],
  }))
}

/** 抽出單場景會話 → 一個 markdown 檔。回傳檔名。 */
function extractOne (rec, sceneName) {
  const dir = path.join(archiveRoot(), sceneName)
  fs.mkdirSync(dir, { recursive: true })
  const stamp = (rec.開始時間 || now()).replace(/[:.]/g, '-').slice(0, 19)
  const sid6 = (rec.會話id || 'nosid').replace(/^session-/, '').slice(0, 8)
  const fname = `${stamp}-${sid6}.md`

  const lines = []
  lines.push('# 會話檔案 · ' + (rec.會話名 || sceneName))
  lines.push('')
  lines.push('> 這是**聊天全文**，不是結論。結論在場景的記憶檔裡（`場景/<名>/' + rules.memoryFile + '`）。')
  lines.push('> ⛔ 不要把這裡的正文抄進記憶檔——那是兩回事。')
  lines.push('')
  lines.push('| 欄位 | 值 |')
  lines.push('|---|---|')
  lines.push('| 會話 id | `' + rec.會話id + '` |')
  lines.push('| 會話名 | ' + (rec.會話名 || sceneName) + ' |')
  lines.push('| 場景 id | ' + (rec.場景id || sceneName) + ' |')
  lines.push('| 開始時間 | ' + (rec.開始時間 || '（未提供）') + ' |')
  lines.push('| 訊息數 | ' + rec.訊息.length + ' |')
  lines.push('')
  lines.push('---')
  lines.push('')
  for (const m of rec.訊息) {
    const role = normalizeRole(m['角色'] || m.role)
    const text = String(m['文字'] || m.text || m.content || '').trim()
    if (!text) continue
    lines.push('### ' + role)
    lines.push('')
    lines.push(text)
    lines.push('')
  }
  const body = lines.join('\n')
  writeText(path.join(dir, fname), body)
  return { fname, bytes: Buffer.byteLength(body), count: rec.訊息.length, dir }
}

/* ───────────────────────── 索引 ───────────────────────── */

function buildIndex () {
  const rootDir = archiveRoot()
  const rows = []
  if (fs.existsSync(rootDir)) {
    for (const sceneName of fs.readdirSync(rootDir).sort()) {
      const dir = path.join(rootDir, sceneName)
      if (!fs.statSync(dir).isDirectory()) continue
      for (const f of fs.readdirSync(dir).sort()) {
        if (!f.endsWith('.md')) continue
        const full = path.join(dir, f)
        const body = readText(full)
        const pick = (k) => {
          const m = new RegExp('^\\| ' + k + ' \\| (.*?) \\|$', 'm').exec(body)
          return m ? m[1].replace(/`/g, '').trim() : ''
        }
        rows.push({
          場景id: sceneName,
          會話id: pick('會話 id'),
          會話名: pick('會話名'),
          開始時間: pick('開始時間'),
          訊息數: pick('訊息數'),
          路徑: path.relative(root, full),
          摘要: (pick('會話名') || sceneName),
        })
      }
    }
  }
  const cols = rules['會話檔案索引欄位'] || ['場景id', '會話id', '會話名', '開始時間', '訊息數', '路徑', '摘要']
  const out = []
  out.push('# 會話檔案索引')
  out.push('')
  out.push('> **聊天全文的入口。** 每個場景的歷史會話都存成一份 markdown，索引在這裡。')
  out.push('>')
  out.push('> 三種讀法：**按場景**（看某場景全部）／**按日期**（看某天做了什麼）／**按關鍵詞**（grep）。')
  out.push('>')
  out.push('> ⛔ 這是**歸檔層**，不是記憶層。結論在 `場景/<名>/' + rules.memoryFile + '`，')
  out.push('> 那才是新會話開場會讀的東西。')
  out.push('')
  out.push('| ' + cols.join(' | ') + ' |')
  out.push('|' + cols.map(() => '---').join('|') + '|')
  for (const r of rows) {
    out.push('| ' + cols.map((c) => String(r[c] ?? '').replace(/\|/g, '\\|')).join(' | ') + ' |')
  }
  out.push('')
  out.push('> 共 ' + rows.length + ' 份。')
  out.push('')
  writeText(indexPath(), out.join('\n'))
  return rows
}

/* ───────────────────────── 場景甲 ───────────────────────── */

function cmdExtract () {
  const exportFile = getArg('--引擎端')
  const sceneName = getArg('--場景')
  const sid = getArg('--會話')
  if (!exportFile || !exists(exportFile)) {
    console.error('✗ 要 --引擎端 <匯出檔>（引擎端匯出的會話 JSON）')
    return 2
  }
  let recs
  try {
    recs = readExport(exportFile)
  } catch (e) {
    console.error('✗ 匯出檔讀不動：' + e.message)
    return 2
  }
  if (sid) recs = recs.filter((r) => r.會話id === sid)
  if (!recs.length) {
    console.error('✗ 匯出檔裡沒有符合的會話' + (sid ? '（會話 id=' + sid + '）' : ''))
    return 1
  }
  for (const r of recs) {
    const scene = sceneName || r.場景id || r.會話名
    if (!scene) {
      console.error('✗ 這筆會話沒有場景名，請用 --場景 指定')
      return 2
    }
    const out = extractOne(r, scene)
    console.log('✓ 已抽出：' + path.relative(root, path.join(out.dir, out.fname)) +
      '（' + out.count + ' 則訊息 / ' + out.bytes + ' B）')
  }
  const rows = buildIndex()
  console.log('✓ 索引已更新：' + path.relative(root, indexPath()) + '（共 ' + rows.length + ' 份）')
  return 0
}

function cmdIndex () {
  const rows = buildIndex()
  console.log('✓ 索引已重建：' + path.relative(root, indexPath()) + '（共 ' + rows.length + ' 份）')
  return 0
}

function cmdCheck () {
  const problems = []
  const warns = []
  const ok = []
  const dir = archiveRoot()
  if (!exists(dir)) {
    console.log('\n會話檔案層：✗ 沒有這個目錄：' + dir)
    return 1
  }
  ok.push('目錄存在：' + path.relative(root, dir))

  const idx = indexPath()
  if (!exists(idx)) {
    problems.push('缺索引：' + path.relative(root, idx) + '（跑 node 會話檔案.mjs 索引）')
  } else {
    ok.push('索引存在')
    // ★ 檢查不得改資料 —— 所以這裡「讀索引」，不重建索引。
    //   （重建會把被破壞的索引覆蓋掉，檢查就永遠查不出問題。）
    const body = readText(idx)
    let rows = 0
    for (const line of body.split(/\r?\n/)) {
      if (!line.startsWith('| ') || line.startsWith('|---') || line.includes('場景id |')) continue
      rows++
      const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim().replace(/`/g, ''))
      // 欄位順序照 會話檔案索引欄位：場景id 會話id 會話名 開始時間 訊息數 路徑 摘要
      const rel = cells[5]
      if (!rel) { problems.push('索引有一列沒有路徑欄'); continue }
      if (!exists(path.resolve(root, rel))) problems.push('索引指向不存在的檔案：' + rel)
    }
    ok.push('索引 ' + rows + ' 列')
  }

  // 每個場景的歸檔/ 與 會話檔案/ 都要存在
  if (exists(memRoot)) {
    for (const s of fs.readdirSync(memRoot).sort()) {
      const d = path.join(memRoot, s)
      if (!fs.statSync(d).isDirectory()) continue
      if (s.startsWith('_')) continue
      if (!exists(path.join(d, rules.archiveDir))) warns.push('場景「' + s + '」缺 ' + rules.archiveDir + '/')
      else ok.push('場景「' + s + '」有 ' + rules.archiveDir + '/')
    }
  }

  // 紅線：單檔大小
  const max = rules['會話檔案單檔紅線位元組'] || 524288
  const keep = rules['會話檔案層保留份數'] || 20
  let count = 0
  for (const s of (exists(dir) ? fs.readdirSync(dir) : [])) {
    const sd = path.join(dir, s)
    if (!fs.statSync(sd).isDirectory()) continue
    const files = fs.readdirSync(sd).filter((f) => f.endsWith('.md'))
    count += files.length
    for (const f of files) {
      const sz = fs.statSync(path.join(sd, f)).size
      if (sz > max) warns.push('會話檔案超過紅線：' + path.relative(root, path.join(sd, f)) + '（' + sz + ' B > ' + max + ' B）')
    }
    if (files.length > keep) warns.push('場景「' + s + '」有 ' + files.length + ' 份會話檔案，超過保留份數 ' + keep + '（舊的該清）')
  }
  ok.push('會話檔案共 ' + count + ' 份')

  console.log('')
  if (problems.length) {
    console.log('會話檔案層：✗ ' + problems.length + ' 個問題')
    for (const p of problems) console.log('   ✗ ' + p)
    for (const w of warns) console.log('   ⚠ ' + w)
    return 1
  }
  console.log('會話檔案層：✓ 全部通過（' + ok.length + ' 項）')
  for (const w of warns) console.log('   ⚠ ' + w)
  return 0
}

function cmdList () {
  if (!exists(indexPath())) {
    console.error('✗ 沒有索引，先跑 node 會話檔案.mjs 索引')
    return 1
  }
  const body = readText(indexPath())
  const sceneFilter = getArg('--場景')
  const kw = getArg('--關鍵詞')
  let shown = 0
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('| ') || line.startsWith('|---') || line.includes('場景id |')) continue
    if (sceneFilter && !line.includes(sceneFilter)) continue
    if (kw && !line.includes(kw)) continue
    console.log('  ' + line.slice(2))
    shown++
  }
  console.log('\n共 ' + shown + ' 筆' + (sceneFilter ? '（場景＝' + sceneFilter + '）' : '') + (kw ? '（關鍵詞＝' + kw + '）' : ''))
  return 0
}

const cmds = { 抽出: cmdExtract, 索引: cmdIndex, 檢查: cmdCheck, 列出: cmdList }
if (!cmds[cmd]) {
  console.error('未知命令：' + (cmd || '（沒給）'))
  console.error('可用：' + Object.keys(cmds).join(' / '))
  process.exit(2)
}
process.exit(cmds[cmd]())
void hasArg; void today

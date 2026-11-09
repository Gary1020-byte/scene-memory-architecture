#!/usr/bin/env node
/**
 * session-archive.mjs —— 會話檔案層（聊天全文的歸處）
 *
 * 用法：
 *   node session-archive.mjs 抽出 --root <工作台根> --會話 <會話id> --scene <場景名> [--引擎端 <匯出檔>]
 *   node session-archive.mjs 索引 --root <工作台根>
 *   node session-archive.mjs 檢查 --root <工作台根>
 *   node session-archive.mjs 列出 --root <工作台根> [--scene <名>] [--關鍵詞 <字>]
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
 *       "sessionId": "session-xxxx",
 *       "sessionName": "scene name",
 *       "sceneid": "scene-id",
 *       "Start Time": "2026-11-02T15:03:19+08:00",
 *       "message": [
 *         { "role": "user|assistant|tool", "text": "……" },
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
} from './workbench.mjs'

const args = process.argv.slice(2)
const cmd = args[0]
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const hasArg = (n) => args.includes(n)

const root = getArg('--root')
if (!root) {
  console.error('Usage: node session-archive.mjs <extract|index|check|list> --root <workbench-root> [other args]')
  process.exit(2)
}
const rules = loadRules(root)
const memRoot = resolveMemoryRoot(root)

/* 會話檔案層住在工作台根（跨場景），不跟著場景走 */
function archiveRoot () {
  return path.join(root, rules['sessionArchiveDir'] || 'session-archive')
}
function indexPath () {
  return path.join(archiveRoot(), rules['sessionArchiveIndexFile'] || '_session-archive-index.md')
}
function sceneDir (name) {
  return path.join(memRoot, name)
}

/* ───────────────────────── 讀匯出檔 ───────────────────────── */

function normalizeRole (r) {
  const s = String(r || '').trim().toLowerCase()
  if (['user', 'user', '人', 'human'].includes(s)) return 'user'
  if (['assistant', 'assistant', 'ai', 'model'].includes(s)) return 'assistant'
  if (['tool', 'tool', 'tool-call', 'tool_result'].includes(s)) return 'tool'
  return 'other'
}

/** 讀引擎匯出檔。支援單一物件或物件陣列。 */
function readExport (p) {
  const j = JSON.parse(readText(p))
  const arr = Array.isArray(j) ? j : [j]
  return arr.map((o) => ({
    sessionId: String(o['sessionId'] || o.sessionId || o.id || '').trim(),
    sessionName: String(o['sessionName'] || o.sessionName || o.title || '').trim(),
    sceneId: String(o['sceneid'] || o.sceneId || '').trim(),
    // 場景名優先：目錄名用中文（「場景甲」）比英文 id（「sc-a」）可讀，
    // 而且引擎端的面板 json 的 name 就是中文。
    sceneName: String(o['scene name'] || o.sceneName || '').trim(),
    startTime: String(o['Start Time'] || o.startedAt || o.createdAt || '').trim(),
    messages: Array.isArray(o['message'] || o.messages) ? (o['message'] || o.messages) : [],
  }))
}

/** 抽出單場景會話 → 一個 markdown 檔。回傳檔名。 */
function extractOne (rec, sceneName) {
  const dir = path.join(archiveRoot(), sceneName)
  fs.mkdirSync(dir, { recursive: true })
  const stamp = (rec.startTime || now()).replace(/[:.]/g, '-').slice(0, 19)
  const sid6 = (rec.sessionId || 'nosid').replace(/^session-/, '').slice(0, 8)
  const fname = `${stamp}-${sid6}.md`

  const lines = []
  lines.push('# Session Archive · ' + (rec.sessionName || sceneName))
  lines.push('')
  lines.push('> 這是**聊天全文**，不是結論。結論在場景的記憶檔裡（`場景/<名>/' + rules.memoryFile + '`）。')
  lines.push('> ⛔ Do not copy the body text from here into the memory file — those are two different things.')
  lines.push('')
  lines.push('| Field | Value |')
  lines.push('|---|---|')
  lines.push('| Session ID | `' + rec.sessionId + '` |')
  lines.push('| Session Name | ' + (rec.sessionName || sceneName) + ' |')
  lines.push('| scene | ' + (rec.sceneName || sceneName) + ' |')
  if (rec.sceneId && rec.sceneId !== rec.sceneName) lines.push('| Scene ID | ' + rec.sceneId + ' |')
  lines.push('| Start Time | ' + (rec.startTime || ' (not provided)') + ' |')
  lines.push('| Messages | ' + rec.messages.length + ' |')
  lines.push('')
  lines.push('---')
  lines.push('')
  for (const m of rec.messages) {
    const role = normalizeRole(m['role'] || m.role)
    const text = String(m['text'] || m.text || m.content || '').trim()
    if (!text) continue
    lines.push('### ' + role)
    lines.push('')
    lines.push(text)
    lines.push('')
  }
  const body = lines.join('\n')
  writeText(path.join(dir, fname), body)
  return { fname, bytes: Buffer.byteLength(body), count: rec.messages.length, dir }
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
          // ★ 兩個跳脫都不能少：`\|` 是跳脫直線，`\$` 是跳脫結尾錨點。
          //   少了 `\$`，`$` 會被當成字面 dollar ⇒ 永遠匹配不到任何一列。
          const m = new RegExp('^\\| ' + k + ' \\| (.*?) \\|$', 'm').exec(body)
          return m ? m[1].replace(/`/g, '').trim() : ''
        }
        // 場景欄優先取檔案裡的「場景」列；沒有就退回目錄名
        const sceneCell = pick('Scene') || sceneName
        rows.push({
          Scene: sceneCell,
          'Session ID': pick('Session ID'),
          'Session Name': pick('Session Name'),
          'Start Time': pick('Start Time'),
          Messages: pick('Messages'),
          Path: path.relative(root, full),
          Summary: (pick('Session Name') || sceneName),
          _file: full,
        })
      }
    }
  }
  const cols = rules['sessionArchiveIndexFields'] || ['Scene', 'Session ID', 'Session Name', 'Start Time', 'Messages', 'Path', 'Summary']
  const out = []
  out.push('# Session Archive Index')
  out.push('')
  out.push('> **The entry point for full chat transcripts.** The historical sessions of every scene are stored as one markdown file each; the index is here.')
  out.push('>')
  out.push('> Three ways to read it: **by scene** (everything in one scene) / **by date** (what happened on a day) / **by keyword** (grep).')
  out.push('>')
  out.push('> ⛔ This is the **archive layer**, not the memory layer. The conclusion lives in `scenes/<name>/' + rules.memoryFile + '`，')
  out.push('> That is what a new session reads at the start.')
  out.push('')
  out.push('| ' + cols.join(' | ') + ' |')
  out.push('|' + cols.map(() => '---').join('|') + '|')
  for (const r of rows) {
    out.push('| ' + cols.map((c) => String(r[c] ?? '').replace(/\|/g, '\\|')).join(' | ') + ' |')
  }
  out.push('')
  out.push('> Total ' + rows.length + ' copies.')
  out.push('')
  writeText(indexPath(), out.join('\n'))
  return rows
}

/* ───────────────────────── 場景甲 ───────────────────────── */

function cmdExtract () {
  const exportFile = getArg('--engine-export')
  const sceneName = getArg('--scene')
  const sid = getArg('--session')
  if (!exportFile || !exists(exportFile)) {
    console.error('✗ Need --engine-export <file> (the session JSON exported by the engine side)')
    return 2
  }
  let recs
  try {
    recs = readExport(exportFile)
  } catch (e) {
    console.error('✗ Cannot read the export file: ' + e.message)
    return 2
  }
  if (sid) recs = recs.filter((r) => r.sessionId === sid)
  if (!recs.length) {
    console.error('✗ No matching session in the export file' + (sid ? '(session id = ' + sid + ')' : ''))
    return 1
  }
  for (const r of recs) {
    const scene = sceneName || r.sceneName || r.sceneId || r.sessionName
    if (!scene) {
      console.error('✗ This session has no scene name; specify it with --scene')
      return 2
    }
    const out = extractOne(r, scene)
    console.log('✓ Extracted: ' + path.relative(root, path.join(out.dir, out.fname)) +
      ' (' + out.count + ' messages / ' + out.bytes + ' B)')
  }
  const rows = buildIndex()
  console.log('✓ Index updated: ' + path.relative(root, indexPath()) + '(total ' + rows.length + ' copies)')
  return 0
}

function cmdIndex () {
  const rows = buildIndex()
  console.log('✓ Index rebuilt: ' + path.relative(root, indexPath()) + '(total ' + rows.length + ' copies)')
  return 0
}

function cmdCheck () {
  const problems = []
  const warns = []
  const ok = []
  const dir = archiveRoot()
  if (!exists(dir)) {
    console.log('\nSession archive layer: ✗ no such directory: ' + dir)
    return 1
  }
  ok.push('Directory exists: ' + path.relative(root, dir))

  const idx = indexPath()
  if (!exists(idx)) {
    problems.push('Missing index: ' + path.relative(root, idx) + ' (run node session-archive.mjs index)')
  } else {
    ok.push('index exists')
    // ★ 檢查不得改資料 —— 所以這裡「讀索引」，不重建索引。
    //   （重建會把被破壞的索引覆蓋掉，檢查就永遠查不出問題。）
    const body = readText(idx)
    let rows = 0
    for (const line of body.split(/\r?\n/)) {
      if (!line.startsWith('| ') || line.startsWith('|---') || /^\|\s*(Scene|場景)\s*\|/.test(line)) continue
      rows++
      const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim().replace(/`/g, ''))
      // Column order follows sessionArchiveIndexFields: Scene | Session ID | Session Name | Start Time | Messages | Path | Summary
      const rel = cells[5]
      if (!rel) { problems.push('An index row has no path column'); continue }
      if (!exists(path.resolve(root, rel))) problems.push('Index points at a file that does not exist: ' + rel)
    }
    ok.push('index ' + rows + ' rows')
  }

  // 每個場景的歸檔/ 與 會話檔案/ 都要存在
  if (exists(memRoot)) {
    for (const s of fs.readdirSync(memRoot).sort()) {
      const d = path.join(memRoot, s)
      if (!fs.statSync(d).isDirectory()) continue
      if (s.startsWith('_')) continue
      if (!exists(path.join(d, rules.archiveDir))) warns.push('scene "' + s + '" is missing ' + rules.archiveDir + '/')
      else ok.push('scene "' + s + '" has ' + rules.archiveDir + '/')
    }
  }

  // 紅線：單檔大小
  const max = rules['sessionFileMaxBytes'] || 524288
  const keep = rules['sessionArchiveKeepCount'] || 20
  let count = 0
  for (const s of (exists(dir) ? fs.readdirSync(dir) : [])) {
    const sd = path.join(dir, s)
    if (!fs.statSync(sd).isDirectory()) continue
    const files = fs.readdirSync(sd).filter((f) => f.endsWith('.md'))
    count += files.length
    for (const f of files) {
      const sz = fs.statSync(path.join(sd, f)).size
      if (sz > max) warns.push('Session archive file over hard limit: ' + path.relative(root, path.join(sd, f)) + ' (' + sz + ' B > ' + max + ' B)')
    }
    if (files.length > keep) warns.push('scene "' + s + '" has ' + files.length + ' copies會話檔案，超過保留份數 ' + keep + ' (the old one should be cleaned)')
  }
  ok.push('Session archive total ' + count + ' copies')

  console.log('')
  if (problems.length) {
    console.log('Session archive layer: ✗ ' + problems.length + '  problem(s)')
    for (const p of problems) console.log('   ✗ ' + p)
    for (const w of warns) console.log('   ⚠ ' + w)
    return 1
  }
  console.log('Session archive layer: ✓ all checks passed (' + ok.length + ' item(s))')
  for (const w of warns) console.log('   ⚠ ' + w)
  return 0
}

function cmdList () {
  if (!exists(indexPath())) {
    console.error('✗ No index; run node session-archive.mjs index first')
    return 1
  }
  const body = readText(indexPath())
  const sceneFilter = getArg('--scene')
  const kw = getArg('--keyword')
  let shown = 0
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('| ') || line.startsWith('|---') || line.includes('sceneId |')) continue
    if (sceneFilter && !line.includes(sceneFilter)) continue
    if (kw && !line.includes(kw)) continue
    console.log('  ' + line.slice(2))
    shown++
  }
  console.log('\nTotal ' + shown + ' ' + (sceneFilter ? '(scene = ' + sceneFilter + ')' : '') + (kw ? '(keyword = ' + kw + ')' : ''))
  return 0
}

const cmds = { extract: cmdExtract, index: cmdIndex, check: cmdCheck, list: cmdList,
               抽出: cmdExtract, 索引: cmdIndex, 檢查: cmdCheck, 列出: cmdList }
if (!cmds[cmd]) {
  console.error('Unknown command: ' + (cmd || ' (not given)'))
  console.error('Available: ' + Object.keys(cmds).join(' / '))
  process.exit(2)
}
process.exit(cmds[cmd]())
void hasArg; void today

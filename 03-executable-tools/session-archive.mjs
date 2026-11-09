#!/usr/bin/env node
/**
 * session-archive.mjs —— the session file layer (where the full chat transcript lives)
 *
 * Usage:
 *   node session-archive.mjs extract --root <workbench-root> --session <session-id> --scene <scene-name> [--engine-export <export-file>]
 *   node session-archive.mjs index   --root <workbench-root>
 *   node session-archive.mjs check  --root <workbench-root>
 *   node session-archive.mjs list   --root <workbench-root> [--scene <name>] [--keyword <text>]
 *
 * Exit codes: 0 = passed; 1 = something is wrong; 2 = usage error
 *
 * ★ What this tool does — the "engine-neutral part":
 *   turn the session records exported by the engine into readable markdown files plus a
 *   searchable index.
 *   **How the engine exports and what format it exports is the engine's business** ——
 *   this tool only accepts one export format (see below); the engine side just has to
 *   convert the session into that format.
 *
 * ★ Export format (the engine-neutral contract):
 *   one JSON file, structured as
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
 *   The role name may be "user/assistant/tool" or "使用者/助手/工具"; both are accepted.
 *
 * ★ Why this layer exists:
 *   The scene memory only holds "conclusions"; the full chat transcript is a different
 *   thing (the wording of the original upstream version).
 *   Without this layer ⇒ a replaced old session is nothing but a black box inside the engine,
 *   and as soon as the engine changes version (a new log format) the whole batch is unreadable.
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

/* The session file layer lives at the workbench root (cross-scene); it does not follow the scene */
function archiveRoot () {
  return path.join(root, rules['sessionArchiveDir'] || 'session-archive')
}
function indexPath () {
  return path.join(archiveRoot(), rules['sessionArchiveIndexFile'] || '_session-archive-index.md')
}
function sceneDir (name) {
  return path.join(memRoot, name)
}

/* ───────────────────────── read the export file ───────────────────────── */

function normalizeRole (r) {
  const s = String(r || '').trim().toLowerCase()
  if (['user', 'user', '人', 'human'].includes(s)) return 'user'
  if (['assistant', 'assistant', 'ai', 'model'].includes(s)) return 'assistant'
  if (['tool', 'tool', 'tool-call', 'tool_result'].includes(s)) return 'tool'
  return 'other'
}

/** Read the engine export file. Supports a single object or an array of objects. */
function readExport (p) {
  const j = JSON.parse(readText(p))
  const arr = Array.isArray(j) ? j : [j]
  return arr.map((o) => ({
    sessionId: String(o['sessionId'] || o.sessionId || o.id || '').trim(),
    sessionName: String(o['sessionName'] || o.sessionName || o.title || '').trim(),
    sceneId: String(o['sceneid'] || o.sceneId || '').trim(),
    // The scene name comes first: a human-readable directory name ("scene-a") beats an
    // English id ("sc-a"), and the name in the engine-side panel json is that same name.
    sceneName: String(o['scene name'] || o.sceneName || '').trim(),
    startTime: String(o['Start Time'] || o.startedAt || o.createdAt || '').trim(),
    messages: Array.isArray(o['message'] || o.messages) ? (o['message'] || o.messages) : [],
  }))
}

/** Extract one scene session → one markdown file. Returns the file name. */
function extractOne (rec, sceneName) {
  const dir = path.join(archiveRoot(), sceneName)
  fs.mkdirSync(dir, { recursive: true })
  const stamp = (rec.startTime || now()).replace(/[:.]/g, '-').slice(0, 19)
  const sid6 = (rec.sessionId || 'nosid').replace(/^session-/, '').slice(0, 8)
  const fname = `${stamp}-${sid6}.md`

  const lines = []
  lines.push('# Session Archive · ' + (rec.sessionName || sceneName))
  lines.push('')
  lines.push('> This is the **full chat transcript**, not the conclusions. The conclusions live in the scene memory file (`scenes/<name>/' + rules.memoryFile + '`).')
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

/* ───────────────────────── index ───────────────────────── */

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
          // ★ Neither escape may be missing: `\|` escapes the pipe, `\$` escapes the end anchor.
          //   Without `\$`, the `$` is taken as a literal dollar ⇒ it never matches any row.
          const m = new RegExp('^\\| ' + k + ' \\| (.*?) \\|$', 'm').exec(body)
          return m ? m[1].replace(/`/g, '').trim() : ''
        }
        // The scene column prefers the "Scene" row inside the file; without it, fall back to the directory name
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

/* ───────────────────────── commands ───────────────────────── */

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
    // ★ The check must not modify data —— so it "reads the index" here, it does not rebuild it.
    //   (Rebuilding would overwrite the broken index, and the check would never find the problem.)
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

  // Every scene must have both the archive/ directory and the session files/ directory
  if (exists(memRoot)) {
    for (const s of fs.readdirSync(memRoot).sort()) {
      const d = path.join(memRoot, s)
      if (!fs.statSync(d).isDirectory()) continue
      if (s.startsWith('_')) continue
      if (!exists(path.join(d, rules.archiveDir))) warns.push('scene "' + s + '" is missing ' + rules.archiveDir + '/')
      else ok.push('scene "' + s + '" has ' + rules.archiveDir + '/')
    }
  }

  // Red line: size of a single file
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
    if (files.length > keep) warns.push('scene "' + s + '" has ' + files.length + ' session files, more than the keep count ' + keep + ' (the old ones should be cleaned)')
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
               extract: cmdExtract, index: cmdIndex, check: cmdCheck, list: cmdList }
if (!cmds[cmd]) {
  console.error('Unknown command: ' + (cmd || ' (not given)'))
  console.error('Available: ' + Object.keys(cmds).join(' / '))
  process.exit(2)
}
process.exit(cmds[cmd]())
void hasArg; void today

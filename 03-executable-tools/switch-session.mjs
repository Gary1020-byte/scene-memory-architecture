#!/usr/bin/env node
/**
 * switch-session.mjs —— 把「換會話」變成一條可重複、有自檢的原子操作
 *
 * 用法：
 *   node switch-session.mjs 計畫 --root <工作台根> --scene <場景名>
 *   node switch-session.mjs check --root <工作台根> --scene <場景名> [--new-session-id <id>]
 *
 * 退出碼：0 = 通過；1 = 有問題；2 = 用法錯誤
 *
 * ★ 這支工具做的是「引擎中立的部分」：
 *   前置檢查（能不能換）、同步三處（新會話 id 該寫到哪）、換完的自檢。
 *   **引擎端做什麼**：建新會話、把舊會話改名＋真歸檔、把新會話 id 給這支工具。
 *   本工具不碰引擎——它只保證「文件層的三處同步」不會漏。
 *
 * ★ 四步（缺任何一步都不算換完）：
 *   ① 把進度／下一步／卡點覆蓋寫進 §〇        ← 這就是交接
 *   ② 新建會話 + 舊會話歸檔                  ← 引擎端
 *   ③ 同步三處（新會話 id）                   ← ★ 引擎端做完立刻呼叫本工具
 *   ④ 自檢（check + 三處一致）                ← 本工具
 *
 * ★ 為什麼「同步三處」要機械化：
 *   少同步任何一處的症狀都一樣（切場景像換了個人），但根因不同——
 *   所以要三處一起對，不要靠症狀去猜是哪一處漏了。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  HERE, loadRules, resolveMemoryRoot, resolveIndexPath, readText, writeText, exists, now,
} from './workbench.mjs'

const args = process.argv.slice(2)
const cmd = args[0]
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }

const root = getArg('--root')
const sceneName = getArg('--scene')
if (!root || !sceneName) {
  console.error('Usage: node switch-session.mjs <plan|check> --root <workbench-root> --scene <scene-name> [--new-session-id <id>]')
  process.exit(2)
}
const rules = loadRules(root)
const memRoot = resolveMemoryRoot(root)
const dir = path.join(memRoot, sceneName)
const memFile = path.join(dir, rules.memoryFile)

/* ───────────────────────── Preconditions ───────────────────────── */

/** Whether the five §0 subsections are all present and next steps were written. */
function inspectSec0 (body) {
  const subs = rules.sec0Subsections || []
  const missing = subs.filter((s) => !body.includes(s))
  // 「下一步」有沒有實質內容（不能只有空項目符號或佔位）
  // ★ 用逐行掃描，不用 regex：lookahead 會在標題行當下就成立，只抓到標題本身。
  let hasNext = false
  const head = (rules.sec0Subsections || []).find((s) => s.includes('4)')) || '### 4) next steps'
  const lines = body.split('\n')
  const start = lines.findIndex((l) => l.startsWith(head))
  if (start >= 0) {
    const items = []
    for (let i = start + 1; i < lines.length; i++) {
      if (/^###\s/.test(lines[i]) || /^##\s/.test(lines[i])) break
      const l = lines[i]
      if (!/^\s*-\s*\S/.test(l)) continue
      const t = l.replace(/^\s*-\s*/, '').trim()
      if (!t || /^[-（(]?\s*(待補|TODO|—|-|無|none)\s*$/i.test(t)) continue
      items.push(t)
    }
    hasNext = items.length > 0
  }
  return { missing, hasNext }
}

/** Read this scene's session id from the identity index. */
function readIndexSession (indexPath, name) {
  if (!exists(indexPath)) return null
  for (const line of readText(indexPath).split(/\r?\n/)) {
    const t = line.trim()
    if (!t.startsWith('|')) continue
    const c = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim().replace(/`/g, ''))
    if (c.length < 7) continue
    if (!/^[a-z0-9-]+$/.test(c[0])) continue
    // 場景 id（`demo`）或會話名（`demo-scene`）都算命中
    if (c[0] === name || c[3] === name || c[2] === name) return { id: c[0], sessionId: c[4], card: c[5] }
  }
  return null
}

/** The sessionId in the scene config (engine-side panel json). */
function readConfigSession (name, sceneId) {
  const cands = []
  // repo 端示範用 場景/<名>/scene-config.json
  cands.push(path.join(dir, rules['sceneConfigFile'] || 'scene-config.json'))
  // 引擎端：<根>/scenarios/<場景id>.json 或 <根>/外殼/scenarios/<場景id>.json
  // ★ 檔名是**場景 id**（英文 kebab-case），不是場景名 —— 用場景名找會找不到。
  if (sceneId) {
    cands.push(path.join(root, 'scenarios', sceneId + '.json'))
    cands.push(path.join(root, 'shell', 'scenarios', sceneId + '.json'))
  }
  cands.push(path.join(root, 'scenarios', name + '.json'))
  cands.push(path.join(root, 'shell', 'scenarios', name + '.json'))
  for (const c of cands) {
    if (!exists(c)) continue
    try {
      const j = JSON.parse(readText(c))
      const panels = j.panels || []
      for (const p of panels) {
        if (p.sessionId) return { sessionId: p.sessionId, file: c }
      }
    } catch { /* treat unreadable as absent */ }
  }
  return null
}

/** The handover signature in §0 (which session wrote it). */
function readSignature (body) {
  const m = body.match(/This handover was written by session\s*([A-Za-z0-9_-]+)\s*on\s*([\d-]+)/)
  return m ? { sessionId: m[1], 日期: m[2] } : null
}

function cmdPlan () {
  const problems = []
  const warns = []
  console.log('═══ Session Switch Plan · ' + sceneName + ' ═══')
  console.log('')

  // ① 場景存在
  if (!exists(dir)) {
    console.log('  ✗ Scene directory does not exist: ' + dir)
    return 1
  }
  console.log('  ✓ Scene directory: ' + path.relative(root, dir))

  // ② §₀ 齊不齊、有沒有下一步
  if (!exists(memFile)) {
    console.log('  ✗ Missing ' + rules.memoryFile + ' (run init)')
    return 1
  }
  const body = readText(memFile)
  const { missing, hasNext } = inspectSec0(body)
  if (missing.length) {
    for (const s of missing) console.log('  ✗ §0 missing subsections: ' + s)
    problems.push('§0 missing subsections')
  } else {
    console.log('  ✓ §0 has all five subsections')
  }
  if (!hasNext) {
    console.log('  ✗ §0 has no readable "next steps" ⇒ switching sessions throws the work away')
    problems.push('§0 has no next steps')
  } else {
    console.log('  ✓ §0 has next steps')
  }

  // ④ §₀ 現在就已經超紅線？⇒ 換會話寫署名後只會更大，先擋住
  const sec0Now = (() => {
    const ls = body.split('\n')
    const s = ls.findIndex((l) => l.startsWith('## §0'))
    if (s < 0) return null
    const out = [ls[s]]
    for (let i = s + 1; i < ls.length; i++) {
      if (/^##\s/.test(ls[i])) break
      out.push(ls[i])
    }
    return out.join('\n')
  })()
  if (sec0Now) {
    const sz = Buffer.byteLength(sec0Now)
    const max = rules.sec0MaxBytes || 4096
    // 署名會再加幾十字 ⇒ 預留一點餘額
    const headroom = 80
    if (sz + headroom > max) {
      console.log('  ✗ §0 is now ' + sz + ' B; writing the signature after the switch would exceed the hard limit of ' + max + ' B')
      console.log('    ⇒ Slim down §0 first (move history into §5), then switch')
      problems.push('§0 will exceed the hard limit after the switch (' + sz + ' B + signature)')
    } else {
      console.log('  ✓ §0 ' + sz + ' B (still within ' + max + ' B after the signature)')
    }
  }

  // ③ 三處目前的會話 id
  const indexPath = resolveIndexPath(root)
  const ident = readIndexSession(indexPath, sceneName)
  const cfg = readConfigSession(sceneName, ident?.id)
  const sig = readSignature(body)
  console.log('')
  console.log('  Current session ids at the three sync points: ')
  console.log('    ① Scene config sessionId   : ' + (cfg ? cfg.sessionId : ' (scene config not found or not bound)'))
  console.log('    ② Identity index sessionId column   : ' + (ident ? ident.sessionId : ' (this card is not in the index)'))
  console.log('    ③ §0 handover signature          : ' + (sig ? sig.sessionId : ' (no signature)'))
  if (!cfg) warns.push('Cannot read sessionId from the scene config (engine-side panel json is not where expected)')
  if (!ident) warns.push('This scene is not in the identity index')

  // ④ 引擎端要做的事
  console.log('')
  console.log('  What the engine side must do (this repo does not touch the engine): ')
  console.log('    a. Create a new session (title = scene name, cwd = scene directory)')
  console.log('    b. Rename the old session to "' + (rules['archivedSessionPrefix'] || 'Archived · ') + '<old name> · <date>"')
  console.log('    c. Actually archive the old session (renaming is not archiving — it keeps showing up in the list)')
  console.log('    d. Give the new session an opening line: "read the §0 handover first, then work"')
  console.log('    e. Write the new session id back to all three sync points, then run "check"')
  console.log('')
  console.log('  Fill in all three: ')
  console.log('    ① panels[].sessionId in the scene config json')
  console.log('    ② the sessionId column of ' + path.relative(root, indexPath))
  console.log('    ③ The §0 handover signature (' + (rules['sessionSwitchSignatureFormat'] || 'This handover was written by session {sessionId} on {date}') + '）')
  console.log('')
  console.log('  Post-switch acceptance: ')
  console.log('    node switch-session.mjs check --root "' + root + '" --scene "' + sceneName + '" --new-session-id <id>')

  if (problems.length) {
    console.log('')
    console.log('  ✗ Cannot switch: ' + problems.join('；'))
    for (const w of warns) console.log('  ⚠ ' + w)
    return 1
  }
  console.log('')
  console.log('  ✓ Preconditions pass; you can switch.')
  for (const w of warns) console.log('  ⚠ ' + w)
  return 0
}

function cmdCheck () {
  const newId = getArg('--new-session-id')
  const problems = []
  const warns = []
  const ok = []
  console.log('═══ Post-Switch Self-Check · ' + sceneName + ' ═══')
  console.log('')

  if (!exists(memFile)) {
    console.log('  ✗ Missing ' + rules.memoryFile)
    return 1
  }
  const body = readText(memFile)
  const { missing, hasNext } = inspectSec0(body)
  if (missing.length) problems.push('§0 missing subsections: ' + missing.join('、'))
  else ok.push('§0 has all five subsections')
  if (!hasNext) problems.push('§0 has no next steps (must be written before switching)')

  const indexPath = resolveIndexPath(root)
  const ident = readIndexSession(indexPath, sceneName)
  const cfg = readConfigSession(sceneName, ident?.id)
  const sig = readSignature(body)

  const three = [
    ['① Scene config sessionId', cfg ? cfg.sessionId : null],
    ['② Identity index sessionId column', ident ? ident.sessionId : null],
    ['③ §0 handover signature', sig ? sig.sessionId : null],
  ]
  console.log('  Three session ids: ')
  for (const [label, v] of three) console.log('    ' + label + ' : ' + (v || ' (none)'))

  // 一致性 —— ★ 三處都必須有值，且必須是同一個 id。
  //   「缺一處」也算不一致：少同步一處的症狀跟同步錯了完全一樣。
  const vals = three.map((x) => x[1]).filter(Boolean)
  const uniq = [...new Set(vals)]
  if (newId) {
    for (const [label, v] of three) {
      if (!v) { problems.push(label + ' has no session id'); continue }
      if (v !== newId) problems.push(label + ' Not the new session id (expected ' + newId + ', got ' + v + '）')
      else ok.push(label + ' synced')
    }
  } else {
    const missingThree = three.filter((x) => !x[1]).map((x) => x[0])
    if (missingThree.length) {
      problems.push('Not all three are filled in: ' + missingThree.join(', ') + ' (the symptom of missing one sync point is always "switching scenes feels like a different person")')
    }
    if (uniq.length > 1) {
      problems.push('The three session ids do not match: ' + uniq.join(' / ') + ' (the symptom of missing one sync point is always "switching scenes feels like a different person")')
    } else if (uniq.length === 1 && missingThree.length === 0) {
      ok.push('All three match: ' + uniq[0])
    }
  }

  // §₀ 紅線
  const sec0 = (() => {
    const ls = body.split('\n')
    const s = ls.findIndex((l) => l.startsWith('## §0'))
    if (s < 0) return null
    const out = [ls[s]]
    for (let i = s + 1; i < ls.length; i++) {
      if (/^##\s/.test(ls[i])) break
      out.push(ls[i])
    }
    return out.join('\n')
  })()
  if (sec0) {
    const sz = Buffer.byteLength(sec0)
    const max = rules.sec0MaxBytes || 4096
    if (sz > max) problems.push('§0 ' + sz + ' B over hard limit (' + max + ' B)')
    else ok.push('§0 ' + sz + ' B')
  }

  // check 也要過
  console.log('')
  console.log('  Scene check: ')
  try {
    const out = execFileSync('node', [path.join(HERE, 'scene-memory.mjs'),
      'check', '--scene', sceneName, '--root', root], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    console.log(out.split('\n').map((l) => '    ' + l).join('\n'))
    ok.push('check passes')
  } catch (e) {
    const out = String(e.stdout || '') + String(e.stderr || '')
    console.log(out.split('\n').filter(Boolean).map((l) => '    ' + l).join('\n'))
    problems.push('check did not pass (' + out.trim().split('\n').slice(-1)[0] + '）')
  }

  console.log('')
  if (problems.length) {
    console.log('  ✗ ' + problems.length + '  problem(s)')
    for (const p of problems) console.log('     ✗ ' + p)
    for (const w of warns) console.log('     ⚠ ' + w)
    return 1
  }
  console.log('  ✓ All checks passed (' + ok.length + ' item(s))')
  for (const o of ok) console.log('     · ' + o)
  for (const w of warns) console.log('     ⚠ ' + w)
  return 0
}

const cmds = { plan: cmdPlan, check: cmdCheck, 計畫: cmdPlan, 檢查: cmdCheck }
if (!cmds[cmd]) {
  console.error('Unknown command: ' + (cmd || ' (not given)'))
  console.error('Available: ' + Object.keys(cmds).join(' / '))
  process.exit(2)
}
const rc = cmds[cmd]()
void writeText; void now
process.exit(rc)

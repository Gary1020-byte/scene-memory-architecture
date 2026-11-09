#!/usr/bin/env node
/**
 * switch-session.mjs —— makes "switching session" a repeatable atomic operation with a self-check
 *
 * Usage:
 *   node switch-session.mjs plan  --root <workbench-root> --scene <scene-name>
 *   node switch-session.mjs check --root <workbench-root> --scene <scene-name> [--new-session-id <id>]
 *
 * Exit codes: 0 = passed; 1 = something is wrong; 2 = usage error
 *
 * ★ What this tool does — the "engine-neutral part":
 *   the preconditions (may we switch), syncing the three places (where the new session id has
 *   to be written), and the self-check after the switch.
 *   **What the engine side does**: create the new session, rename + really archive the old
 *   one, and hand the new session id to this tool.
 *   This tool does not touch the engine —— it only makes sure the "three-place sync at the
 *   file level" never misses a spot.
 *
 * ★ Four steps (the switch is not done unless all four happen):
 *   ① overwrite the progress / next step / blockers into §0   ← this is the handover
 *   ② create the new session + archive the old one             ← engine side
 *   ③ sync the three places (the new session id)               ← ★ call this tool right after the engine side is done
 *   ④ self-check (check + the three places agree)              ← this tool
 *
 * ★ Why "syncing three places" has to be mechanical:
 *   missing any one of them has the same symptom (switching scene feels like switching
 *   people), but the root cause differs —— so all three are checked together instead of
 *   guessing from the symptom which one was missed.
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
  // Does "next steps" have real content (not just an empty bullet or a placeholder)?
  // ★ Line-by-line scanning, not a regex: a lookahead succeeds right at the heading line, so
  //   it would only ever capture the heading itself.
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
    // A hit by scene id (`demo`) or by session name (`demo-scene`) both count
    if (c[0] === name || c[3] === name || c[2] === name) return { id: c[0], sessionId: c[4], card: c[5] }
  }
  return null
}

/** The sessionId in the scene config (engine-side panel json). */
function readConfigSession (name, sceneId) {
  const cands = []
  // The repo-side demo uses scenes/<name>/scene-config.json
  cands.push(path.join(dir, rules['sceneConfigFile'] || 'scene-config.json'))
  // The engine side: <root>/scenarios/<scene-id>.json or <root>/shell/scenarios/<scene-id>.json
  // ★ The file name is the **scene id** (English kebab-case), not the scene name —— looking it
  //   up by scene name finds nothing.
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
  return m ? { sessionId: m[1], date: m[2] } : null
}

function cmdPlan () {
  const problems = []
  const warns = []
  console.log('═══ Session Switch Plan · ' + sceneName + ' ═══')
  console.log('')

  // ① the scene exists
  if (!exists(dir)) {
    console.log('  ✗ Scene directory does not exist: ' + dir)
    return 1
  }
  console.log('  ✓ Scene directory: ' + path.relative(root, dir))

  // ② is §0 complete, is there a next step
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

  // ④ is §0 already over the red line? ⇒ writing the signature after the switch only makes it bigger, so block first
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
    // The signature adds a few dozen characters ⇒ leave a little headroom
    const headroom = 80
    if (sz + headroom > max) {
      console.log('  ✗ §0 is now ' + sz + ' B; writing the signature after the switch would exceed the hard limit of ' + max + ' B')
      console.log('    ⇒ Slim down §0 first (move history into §5), then switch')
      problems.push('§0 will exceed the hard limit after the switch (' + sz + ' B + signature)')
    } else {
      console.log('  ✓ §0 ' + sz + ' B (still within ' + max + ' B after the signature)')
    }
  }

  // ③ the current session id in the three places
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

  // ④ what the engine side has to do
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

  // Consistency —— ★ all three places must have a value, and it must be the same id.
  //   "one place missing" also counts as inconsistent: the symptom of missing one place is
  //   exactly the same as syncing the wrong one.
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

  // the §0 red line
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

  // the check must pass too
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

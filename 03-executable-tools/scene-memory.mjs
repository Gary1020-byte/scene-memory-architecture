#!/usr/bin/env node
/**
 * scene-memory.mjs —— the scene memory validation tool
 *
 * Five commands:
 *   list                    overview: what every scene is missing
 *   init   --scene <name>    create the directory skeleton + three files (never overwrites)
 *   stamp  --scene <name>    regenerate the identity card + scene portrait
 *   handover --scene <name>  archive the old version + fill the §0 subsections + stamp + register in the index
 *   check  --scene <name>    ★ full check: structure / fingerprint / §0 / project / archive (--all for every scene)
 *
 * Design principles:
 *   ① Single source of truth for the rules —— the red lines, the subsection list and the fingerprint
 *      length are all read from handover-rules.json, never hardcoded.
 *   ② fail-closed —— structural errors block (exit code 1); quality issues only warn.
 *   ③ The tool does not touch the data —— it only generates and checks; the prose of the scene
 *      memory is always written by a human.
 *
 * Usage:
 *   node scene-memory.mjs list
 *   node scene-memory.mjs check --scene scene-a
 *   node scene-memory.mjs check --all
 *   node scene-memory.mjs check --scene scene-a --root <workbench-root>
 */
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/* ───────────────────────── single source of truth for the rules ───────────────────────── */

/**
 * Rule key mapping: the rule file may use Chinese keys, the code uses English keys.
 * Both are supported —— renaming a rule or switching language never makes the tool lose a value.
 */
const RULE_KEY_ALIAS = {
  version: '版本',
  description: '說明',
  sec0MaxBytes: '交接段紅線位元組',
  mainMaxBytes: '主檔案紅線位元組',
  projectMaxBytes: '專案記憶紅線位元組',
  skillMaxBytes: '技能紅線位元組',
  mainOverLimitAction: '主檔案超標處置',
  sec0OverLimitAction: '交接段超標處置',
  fingerprintLength: '指紋長度',
  sec0Subsections: '交接段小節',
  dutyHeading: '職責區塊標題',
  dutyMinItems: '職責最少條數',
  memoryFile: '記憶檔名',
  identityFile: '身份卡檔名',
  portraitFile: '場景畫像檔名',
  fileIndexFile: '檔案索引檔名',
  locatorFile: '定位卡檔名',
  sceneConfigFile: '場景配置檔名',
  constitutionFile: '場景憲法檔名',
  skillFile: '技能檔名',
  sceneRootDir: '場景根目錄',
  projectDir: '專案記憶目錄',
  archiveDir: '歸檔目錄',
  skillDir: '技能目錄',
  indexFile: '身份索引檔名',
  indexAliasSection: '身份索引別名段落',
  boundaryMarkerFile: '邊界標記檔名',
  boundaryMarkerAltFile: '邊界標記替代檔名',
  _boundaryMarkerNote: '_邊界標記說明',
  workflowDir: '工作流目錄',
  executionDir: '執行層目錄',
  receiptDir: '回執目錄',
  executionStateFile: '執行狀態檔名',
  carryFile: '交接串檔名',
  receiptRequiredSections: '回執必要小節',
  artifactSection: '可累積物小節',
  diffSetSection: '差異集合小節',
  nextHopSection: '下一棒小節',
  artifactMinItems: '可累積物最小條數',
  accumulationTargetSection: '累積落點小節',
  dispatchField_what: '派單欄位_做什麼',
  dispatchField_criteria: '派單欄位_判據',
  dispatchField_output: '派單欄位_落盤位置',
  dispatchField_receipt: '派單欄位_回執方式',
  dispatchField_needs: '派單欄位_需要',
  archiveLayerDir: '歸檔層目錄',
  sessionArchiveDir: '會話檔案層目錄',
  sessionArchiveIndexFile: '會話檔案索引檔名',
  sessionArchiveIndexFields: '會話檔案索引欄位',
  sessionFileMaxBytes: '會話檔案單檔紅線位元組',
  sessionArchiveKeepCount: '會話檔案層保留份數',
  sessionSwitchPreconditions: '換會話前置檢查',
  sessionSwitchSyncCount: '換會話同步處數',
  sessionSwitchSyncTargets: '換會話同步處',
  sessionSwitchSignatureFormat: '換會話署名格式',
  sessionSwitchFreshnessHours: '換會話新鮮度小時',
  archivedSessionPrefix: '已歸檔會話前綴',
  engineStateFile: '引擎狀態檔名',
  engineStateArchivedField: '引擎狀態已歸檔欄位',
  memoryRootCandidates: '記憶根候選',
}

/** Built-in default rules; a handover-rules.json in the tool directory wins (★ the rules are never hardcoded) */
const DEFAULT_RULES = {
  version: 1,
  sec0MaxBytes: 4096,
  mainMaxBytes: 25600,
  projectMaxBytes: 8192,
  skillMaxBytes: 12288,
  fingerprintLength: 16,
  sec0Subsections: [
    '### 1) Last Handover',
    '### 2) Current Projects',
    '### 3) Private Memory Changes',
    '### 4) Next Steps / Blockers',
    '### 5) Full Picture',
  ],
  dutyHeading: '## Core Responsibilities',
  dutyMinItems: 3,
  memoryFile: 'scene-private-memory.md',
  identityFile: 'identity-card.md',
  portraitFile: 'scene-portrait.md',
  fileIndexFile: '_file-index.md',
  locatorFile: 'locator-card.md',
  sceneConfigFile: 'scene-config.json',
  constitutionFile: 'AGENTS.md',
  skillFile: 'SKILL.md',
  sceneRootDir: 'scenes',
  projectDir: 'project-memory',
  archiveDir: 'archive',
  skillDir: '.dsh/skills',
  indexFile: '_scene-identity-index.md',
  indexAliasSection: 'scene-alias',
  boundaryMarkerFile: '.git',
  boundaryMarkerAltFile: '.git-marker',
  workflowDir: 'workflows',
  executionDir: 'runs',
  receiptDir: 'receipts',
  executionStateFile: 'execution-state.md',
  carryFile: 'carry.md',
  receiptRequiredSections: ['Diff Set', 'Accumulable Artifact', 'Next Handoff'],
  artifactSection: 'Accumulable Artifact',
  diffSetSection: 'Diff Set',
  nextHopSection: 'Next Handoff',
  artifactMinItems: 1,
  accumulationTargetSection: '§5',
  dispatchField_what: 'What',
  dispatchField_criteria: 'Criteria',
  dispatchField_output: 'Output Location',
  dispatchField_receipt: 'Receipt Format',
  dispatchField_needs: 'Needs',
  archiveLayerDir: 'archive',
  sessionArchiveDir: 'session-archive',
  sessionArchiveIndexFile: '_session-archive-index.md',
  sessionArchiveIndexFields: ['Scene', 'Session ID', 'Session Name', 'Start Time', 'Messages', 'Path', 'Summary'],
  sessionFileMaxBytes: 524288,
  sessionArchiveKeepCount: 20,
  sessionSwitchPreconditions: ['scene exists', '§0 has all five subsections', '§0 has next steps', 'check passes'],
  sessionSwitchSyncCount: 3,
  sessionSwitchSyncTargets: ['scene config sessionId', 'identity index sessionId column', '§0 handover signature'],
  sessionSwitchSignatureFormat: 'This handover was written by session {sessionId} on {date}',
  sessionSwitchFreshnessHours: 2,
  archivedSessionPrefix: 'Archived · ',
  engineStateFile: 'engine-state.json',
  engineStateArchivedField: 'archived-sessions',
  memoryRootCandidates: [],
}

/** Normalize a rule file with Chinese keys into English keys (English keys win, Chinese keys fill in) */
function normalizeRules (raw) {
  const out = { ...raw }
  for (const [en, zh] of Object.entries(RULE_KEY_ALIAS)) {
    if (out[en] === undefined && raw[zh] !== undefined) out[en] = raw[zh]
  }
  // The Chinese keys are kept as well, so newly added fields in the rule file (such as the boundary marker) are read directly
  for (const [en, zh] of Object.entries(RULE_KEY_ALIAS)) {
    if (out[zh] === undefined && raw[en] !== undefined) out[zh] = raw[en]
  }
  return out
}

function loadRules (root) {
  const candidates = [
    path.join(HERE, 'handover-rules.json'),
    path.join(root || '', 'handover-rules.json'),
    path.join(HERE, '..', '04-templates', 'handover-rules.json'),
  ]
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue
      const j = JSON.parse(fs.readFileSync(p, 'utf8'))
      return { ...DEFAULT_RULES, ...normalizeRules(j), _source: p }
    } catch (e) {
      console.error('⚠ Cannot read rules file (' + p + '): ' + e.message + ' ⇒ using built-in defaults')
    }
  }
  return { ...DEFAULT_RULES, _source: '(built-in default)' }
}

/* ───────────────────────── path resolution ───────────────────────── */

const argv = process.argv.slice(2)
const val = (k) => { const i = argv.indexOf(k); return i >= 0 ? (argv[i + 1] || '') : '' }
const has = (k) => argv.includes(k)

function resolveRoot () {
  const explicit = val('--root')
  if (explicit) return path.resolve(explicit)
  const env = process.env.DSH_WORKBENCH_ROOT
  if (env) return path.resolve(env)
  return path.resolve(HERE, '..')
}

/**
 * Memory root candidate chain (★ one path resolution for everything, avoiding a "split dashboard")
 *   environment variable → <root>/scenes → <root>/engine-data/.dsh/scene-memory
 * The first one that exists and is a directory wins.
 */
function resolveMemoryRoot (root) {
  const cands = [
    process.env.DSH_SCENE_MEMORY,
    path.join(root, 'scenes'),
    path.join(root, 'engine-data', '.dsh', 'scene-memory'),
  ].filter(Boolean)
  for (const p of cands) {
    try { if (fs.existsSync(p) && fs.statSync(p).isDirectory()) return p } catch { /* skip */ }
  }
  return cands[1] || path.join(root, 'scenes')
}

/** Identity index candidate chain (same reasoning: the index moving must not blind the tool) */
function resolveIndexPath (root) {
  const cands = [
    path.join(root, 'scenes', '_scene-identity-index.md'),
    path.join(root, '外壳', 'scenarios', '_scene-identity-index.md'),
  ]
  return cands.find((p) => fs.existsSync(p)) || cands[0]
}

/* ───────────────────────── small utilities ───────────────────────── */

const sha = (p) => {
  try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') } catch { return '' }
}
const now = () => {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const stampId = () => now().replace(/[-: ]/g, '').slice(0, 12)
const readText = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { return '' } }
const sizeOf = (p) => { try { return fs.statSync(p).size } catch { return 0 } }

/** Byte size of the §0 section (from the §0 heading to the next heading of the same level) */
function sec0Range (txt) {
  const mNew = txt.match(/^## §0[^\n]*$/m)
  const mOld = txt.match(/^## (?:〇|§〇)[、 ]?當前交接[^\n]*$/m)
  const h = mNew ? mNew.index : (mOld ? mOld.index : -1)
  if (h < 0) return { h: -1, bytes: 0, text: '', hasOld: !!mOld, hasNew: !!mNew }
  let end = txt.length
  const nxt = txt.indexOf('\n## ', h + 5)
  if (nxt > h) end = nxt
  return { h, bytes: Buffer.byteLength(txt.slice(h, end)), text: txt.slice(h, end), hasOld: !!mOld, hasNew: !!mNew }
}

/** Get the content of a given ### subsection */
function subsection (txt, head) {
  const i = txt.indexOf(head)
  if (i < 0) return ''
  const e = txt.indexOf('\n### ', i + head.length)
  return txt.slice(i, e > i ? e : txt.length)
}

/* ───────────────────────── identity index ───────────────────────── */

function readIdentity (indexPath, root) {
  const map = new Map()
  const txt = readText(indexPath)
  if (!txt) return map
  for (const line of txt.split(/\r?\n/)) {
    const t = line.trim()
    if (!t.startsWith('|')) continue
    const c = t.replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim().replace(/`/g, ''))
    if (c.length < 7) continue
    const id = c[0]
    if (!/^[a-z0-9-]+$/.test(id)) continue
    // The locator card column may be: relative to the workbench root / relative to the scene layer / absolute —— always resolve it to an absolute path
    const cardRaw = (c[5] || '').replace(/^scenarios[\\/]/, '')
    let card = ''
    if (cardRaw) {
      if (path.isAbsolute(cardRaw)) card = cardRaw
      else {
        const cand = path.resolve(root, cardRaw)
        card = fs.existsSync(cand) ? cand : path.resolve(root, 'scenes', cardRaw)
      }
    }
    map.set(id, {
      id,
      panel: c[1],
      title: c[2],
      sessionName: c[3],
      sessionId: c[4],
      card,
      cardRaw,
      skill: c[6] || '',
    })
  }
  return map
}

/* ───────────────────────── skeleton ───────────────────────── */

function buildMemoryFile (rules, name) {
  const subs = rules.sec0Subsections.map((s, i) => {
    if (i === 0) return s + '\n- (written by the tool at handover time: the old version is archived in `Archive/<file-name>`)'
    if (i === 1) return s + '\n| Project | Memory file | Status | Next step |\n|---|---|---|---|\n| (none) | — | — | — |'
    if (i === 2) return s + '\n- (what changed this round, ≤3 lines)'
    if (i === 3) return s + '\n- (written for the next person)'
    return s + '\n- Project memory 0 · Archive 0 · Index _file-index.md\n- Identity card / scene portrait / shared-layer areas are in place\n- Blockers / waiting on: see section 4'
  }).join('\n\n')

  return `# ${name} · Scene Private Memory

> Identity and shape see \`${rules.identityFile}\` / \`${rules.portraitFile}\` (tool-generated, ⛔ hand-editing)
> The rule: only this scene may rewrite this memory; other scenes may only point out errors.

## §0 Current Handover (≤${rules.sec0MaxBytes / 1024} KB, a new session reads this section first)

${subs}

## Core Responsibilities

- Responsible for: (to be filled —— one sentence: "what finds me")
- Not touching: (to be filled —— one sentence: "what does not find me")
- In one line: (to be filled —— can you say in one sentence why this scene exists)

## §1 What I Own / What I Don't

- Own:
- Don't own:

## §2 Where to Start

- Project memory: \`${rules.projectDir}/<project-name>.md\` (the current project index table goes in §0 subsection 2 above)
- Archive: \`${rules.archiveDir}/\`
- Index: \`${rules.fileIndexFile}\`

## §5 Decisions and Pitfalls (append only)

## 0 - Notifications
`
}

function buildIdentityCard (rules, name, ident, root) {
  const card = ident?.card || ''
  const fp = card ? sha(card).slice(0, rules.fingerprintLength) : ''
  // ⛔ Only paths relative to the workbench root go into the output —— a public template must not pin the executing machine's absolute paths
  const cardShown = card ? relToRoot(card, root) : '(missing)'
  return `# ${name} · Identity Card (tool-generated · ⛔ manual edits fail validation)

<!-- Scene Binding BEGIN · generated by scene-memory.mjs -->
> **Scene** \`${ident?.id || '?'}\` ｜ **Panel** \`${ident?.panel || '?'}\` ｜ **Session** \`${ident?.sessionId || '?'}\`
> **Locator Card** \`${cardShown}\` ｜ **Card Fingerprint** \`sha256:${fp || '(missing)'}…\` ｜ **Stamped** ${now()}
> **Home** \`${name}\`
> **Permissions** Only write your own memory folder and your own assets; ⛔ do not touch other scenes, do not restart the engine
> **Dedicated Skill** ${ident?.skill || '(none)'}
<!-- Scene Binding END -->

## How to use it
- The **first thing** a new session reads is this card: who I am, which panel, which session, what I may touch.
- If the locator card changes ⇒ immediately run \`scene-memory.mjs stamp --scene ${name}\`, otherwise check reports a stale fingerprint.
- This file is fully rewritten by the tool; write extra notes into \`${rules.memoryFile}\`, not here.
`
}

// Turn an absolute path into "relative to the workbench root"; keep it as-is if it is not under the workbench
function relToRoot (abs, root) {
  if (!abs || !root) return abs
  const rel = path.relative(root, abs)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return abs
  return rel
}

function buildPortrait (rules, name, ident, root) {
  // ⛔ Paths are always written relative to the workbench root — the public template must not pin the executing machine's absolute paths
  const cardShown = ident?.card ? relToRoot(ident.card, root) : '(missing)'
  return `# ${name} · Scene Portrait (tool-generated · derived from the scene json)

> Source: scene json + locator card ｜ generated ${now()}
> In one line: (derived from the scene json description; this generic template is not bound to any particular engine)

## 1. Shape
- Panel count: see the scene json

## 2. Dedicated Skill
- ${ident?.skill || '(none)'}

## 3. Memory
- Memory folder: \`${name}/\`
- Handover section: the §0 of \`${rules.memoryFile}\` (≤ ${rules.sec0MaxBytes / 1024} KB)
- Project memory: \`${rules.projectDir}/\` (≤ ${rules.projectMaxBytes / 1024} KB per file)

## 4. Dependencies and entry points
- Locator card: ${cardShown === '(missing)' ? '(missing)' : '`' + cardShown + '`'}
- Bound session: ${ident?.sessionId || '(not bound)'}

> This file is derived by the tool; if the scene json changes, run \`stamp\`.
`
}

function buildFileIndex (rules, name) {
  const d = now().slice(0, 10)
  return `# ${name} · File Index

> Four statuses: \`active / standing / archived / to-clean\`

| File / Directory | What It Is | Status | Last Reviewed |
|---|---|---|---|
| \`${rules.memoryFile}\` | Scene private memory (human-written: handover / duties / decisions / project index) | active | ${d} |
| \`${rules.identityFile}\` | Identity card (tool-generated: identity / permissions / locator card fingerprint) | active | ${d} |
| \`${rules.portraitFile}\` | Scene portrait (tool-generated) | active | ${d} |
| \`${rules.projectDir}/\` | One memory file per project | active | ${d} |
| \`${rules.archiveDir}/\` | Old version snapshots (write-once) | archived | ${d} |
`
}

/* ───────────────────────── scene skeleton ───────────────────────── */

function ensureSkeleton (dir, name, rules) {
  fs.mkdirSync(path.join(dir, rules.archiveDir), { recursive: true })
  fs.mkdirSync(path.join(dir, rules.projectDir), { recursive: true })
  const main = path.join(dir, rules.memoryFile)
  if (!fs.existsSync(main)) {
    fs.writeFileSync(main, buildMemoryFile(rules, name), 'utf8')
    console.log('  ✓ Created ' + rules.memoryFile)
  }
  const fidx = path.join(dir, rules.fileIndexFile)
  if (!fs.existsSync(fidx)) {
    fs.writeFileSync(fidx, buildFileIndex(rules, name), 'utf8')
    console.log('  ✓ Created ' + rules.fileIndexFile)
  }
}

function cmdInit (root, memRoot, rules, name) {
  const dir = path.join(memRoot, name)
  if (!fs.existsSync(dir)) {
    console.error('✗ Cannot find scene directory: ' + dir + '\n   (create the directory and .git first, then run init)')
    return 2
  }
  console.log('▸ ' + name + ': skeleton created')
  ensureSkeleton(dir, name, rules)
  return cmdStamp(root, memRoot, rules, name)
}

function cmdStamp (root, memRoot, rules, name) {
  const dir = path.join(memRoot, name)
  if (!fs.existsSync(dir)) {
    console.error('✗ Cannot find scene directory: ' + dir)
    return 2
  }
  const indexPath = resolveIndexPath(root)
  const ident = findIdentity(indexPath, name, root)
  if (!ident) {
    console.error('✗ Cannot find this scene in the identity index: ' + name)
    console.error('   Index location: ' + indexPath + (fs.existsSync(indexPath) ? '' : ' (file does not exist)'))
    return 1
  }
  fs.writeFileSync(path.join(dir, rules.identityFile), buildIdentityCard(rules, name, ident, root), 'utf8')
  fs.writeFileSync(path.join(dir, rules.portraitFile), buildPortrait(rules, name, ident, root), 'utf8')
  console.log('✓ ' + name + ': identity card + scene portrait regenerated' +
    (ident.card ? '(card fingerprint ' + sha(ident.card).slice(0, 12) + '…)' : ' (locator card not found, fingerprint left empty)'))
  return 0
}

/** Find the index entry by scene name or id */
function findIdentity (indexPath, name, root) {
  const map = readIdentity(indexPath, root)
  for (const v of map.values()) {
    if (v.id === name || v.title === name || v.sessionName === name) return v
  }
  return null
}

function cmdHandover (root, memRoot, rules, name) {
  const dir = path.join(memRoot, name)
  if (!fs.existsSync(dir)) {
    console.error('✗ Cannot find scene directory: ' + dir)
    return 2
  }
  const main = path.join(dir, rules.memoryFile)
  ensureSkeleton(dir, name, rules)
  let body = fs.readFileSync(main, 'utf8')

  // ① archive the old snapshot
  const ident = findIdentity(resolveIndexPath(root), name, root)
  const sid6 = (ident?.sessionId || '').replace('session-', '').slice(0, 6) || 'nosid'
  const archFile = `${rules.memoryFile.replace(/\.md$/, '')}-${stampId()}-${sid6}.md`
  fs.writeFileSync(path.join(dir, rules.archiveDir, archFile), body, 'utf8')
  console.log('✓ Old version archived: ' + rules.archiveDir + '/' + archFile + ' (' + Buffer.byteLength(body) + ' B)')

  // ② only fill the missing subsections (never overwrite existing prose)
  const missing = []
  for (const sub of rules.sec0Subsections) {
    if (body.includes(sub)) continue
    const head = sub.replace(/^### /, '')
    if (sub.includes('1)')) missing.push(sub + '\n- The old version is archived in `' + rules.archiveDir + '/' + archFile + '`\n')
    else if (sub.includes('2)')) missing.push(sub + '\n| Project | Memory file | Status | Next step |\n|---|---|---|---|\n| (none) | — | — | — |\n')
    else if (sub.includes('3)')) missing.push(sub + '\n- \n')
    else if (sub.includes('4)')) missing.push(sub + '\n- \n')
    else missing.push(sub + '\n- Project memory 0 · Archive 0 · Index ' + rules.fileIndexFile + '\n- Blockers / waiting on: see section 4\n')
    void head
  }
  if (missing.length) {
    const h = body.indexOf('## §0')
    if (h >= 0) {
      const lineEnd = body.indexOf('\n', h)
      const at = lineEnd >= 0 ? lineEnd + 1 : body.length
      body = body.slice(0, at) + '\n' + missing.join('\n') + body.slice(at)
    } else {
      body = '# ' + name + ' · scene private memory\n\n## §0 Current Handover (≤' + rules.sec0MaxBytes / 1024 + ' KB)\n\n' + missing.join('\n') + '\n' + body
    }
    fs.writeFileSync(main, body, 'utf8')
  }
  console.log('✓ §0 filled in ' + missing.length + ' subsection(s) (only fills missing ones, never overwrites existing prose)')

  // ③ register in the index
  const fidx = path.join(dir, rules.fileIndexFile)
  if (fs.existsSync(fidx)) {
    fs.appendFileSync(fidx, `| \`${rules.archiveDir}/${archFile}\` | Snapshot from before the handover (write-once) | archived | ${now().slice(0, 10)} |\n`, 'utf8')
  }

  // ④ restamp the card
  return cmdStamp(root, memRoot, rules, name)
}

function cmdCheck (root, memRoot, rules, name) {
  const dir = path.join(memRoot, name)
  const problems = []   // blocking
  const warns = []      // hints only
  const ok = []         // passed

  if (!fs.existsSync(dir)) {
    console.log('\n' + name + ': ✗ no such scene directory (' + dir + ')')
    return 1
  }

  // required files and directories
  for (const f of [rules.memoryFile, rules.identityFile, rules.portraitFile, rules.fileIndexFile]) {
    if (fs.existsSync(path.join(dir, f))) ok.push(f); else problems.push('Missing file ' + f)
  }
  for (const d of [rules.projectDir, rules.archiveDir]) {
    if (fs.existsSync(path.join(dir, d))) ok.push(d + '/'); else problems.push('Missing directory ' + d + '/')
  }

  // ★ A second memory file (orphan)
  //   Source: a real measurement (2026-11-03): when a scene writes its own memory and gets
  //   the file name wrong, an extra "<scene-name>scene-private-memory.md" appears. The two
  //   drift apart (different inodes) and check only looks at the source of truth
  //   ⇒ nobody manages the orphan; if it is a hard link the content matches, but the
  //   duplicated file name confuses the other tools.
  {
    const real = path.join(dir, rules.memoryFile)
    if (fs.existsSync(real)) {
      const ri = fs.statSync(real)
      for (const f of fs.readdirSync(dir)) {
        if (f === rules.memoryFile || !f.endsWith('scene-private-memory.md')) continue
        const si = fs.statSync(path.join(dir, f))
        if (si.ino === ri.ino) {
          problems.push('Scene directory has a second memory file "' + f + '" (a hard link to the source of truth) ⇒ keep only "' + rules.memoryFile + '"')
        } else {
          problems.push('Scene directory has an orphan memory file "' + f + '" (different inode from the source of truth) ⇒ the two will diverge; move it into archive/')
        }
      }
    }
  }

  // ★ The scene boundary (existence of .git) —— without it the degradation is silent and all
  //   the dedicated skills disappear
  //   A real scene uses a real .git directory; the demo in the public repo uses a .git-marker
  //   explanatory file (git does not track a file named .git, and a nested repository without
  //   commits makes git add -A fail)
  const markName = rules['boundaryMarkerFile'] || '.git'
  const altName = rules['boundaryMarkerAltFile'] || '.git-marker'
  const hasMark = fs.existsSync(path.join(dir, markName))
  const hasAlt = altName !== markName && fs.existsSync(path.join(dir, altName))
  if (!hasMark && !hasAlt) {
    problems.push('Scene directory is missing ' + markName + ' (scene boundary broken ⇒ the dedicated skill will not load, and the symptom is subtle)')
  } else {
    ok.push((hasMark ? markName : altName) + ' (scene boundary)')
  }

  // identity index + card fingerprint
  const indexPath = resolveIndexPath(root)
  if (!fs.existsSync(indexPath)) {
    problems.push('Cannot find identity index: ' + indexPath + ' (the tool does not know the scene ↔ session mapping)')
  } else {
    ok.push('Identity index: ' + path.relative(root, indexPath))
  }
  const ident = findIdentity(indexPath, name, root)

  // ★★ Is the bound session still alive?
  //   The three places being "consistent" does not mean that session still exists —— the panel
  //   may point at an **archived** session.
  //   The symptom is exactly the same as "one sync point missed" (switching scene feels like
  //   switching people), but the root cause differs ⇒ they must be checked separately.
  //   The engine writes the engine state as <workbench-root>/engine-state.json (the repo does
  //   not know any engine-private format).
  {
    const stPath = path.join(root, rules['engineStateFile'] || 'engine-state.json')
    if (fs.existsSync(stPath)) {
      try {
        const st = JSON.parse(fs.readFileSync(stPath, 'utf8'))
        const arch = st[rules['engineStateArchivedField'] || 'archived-sessions'] || []
        const sid = ident?.sessionId || ''
        if (sid && arch.includes(sid)) {
          problems.push('The session bound to the panel has been archived (' + sid + ') ⇒ the panel points at a dead session (same symptom as "one sync point missed", different root cause)')
        } else if (sid) {
          ok.push('Bound session is still alive')
        }
      } catch (e) {
        warns.push('Cannot read engine state file (' + path.basename(stPath) + '): ' + e.message)
      }
    }
  }

  const cardPath = path.join(dir, rules.identityFile)
  if (!ident) {
    problems.push('This scene is not in the identity index: ' + name)
  } else if (fs.existsSync(cardPath)) {
    const card = fs.readFileSync(cardPath, 'utf8')
    const fp = (card.match(/sha256:([0-9a-f]+)/) || [])[1]
    if (!ident.card) {
      problems.push('Identity index locator card column is empty (value: ' + (ident.cardRaw || ' (empty)') + ')')
    } else if (!fs.existsSync(ident.card)) {
      problems.push('Locator card does not exist: ' + ident.card)
    } else if (!fp) {
      problems.push('Identity card has no card fingerprint (run stamp to restamp)')
    } else {
      const real = sha(ident.card).slice(0, fp.length)
      if (!sha(ident.card).startsWith(fp)) problems.push('Card fingerprint stale (card changed, run stamp)' + fp + '…≠' + real + '…')
      else ok.push('Card fingerprint matches')
    }
  }

  // main file content
  const mainPath = path.join(dir, rules.memoryFile)
  if (!fs.existsSync(mainPath)) {
    console.log('\n' + name + ': ✗ missing ' + rules.memoryFile + ' (run init)')
    return 1
  }
  const main = fs.readFileSync(mainPath, 'utf8')

  // core responsibilities
  {
    const i = main.search(new RegExp('^' + rules.dutyHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'm'))
    if (i < 0) {
      problems.push('missing "' + rules.dutyHeading + '" block (required in the scene private memory)')
    } else {
      const rest = main.slice(i)
      const next = rest.indexOf('\n## ', 5)
      const sec = rest.slice(0, next > 0 ? next : rest.length)
      const n = (sec.match(/^- /gm) || []).length
      if (n < rules.dutyMinItems) problems.push('Core responsibilities has only ' + n + ' items (at least ' + rules.dutyMinItems + ')')
      else ok.push('core responsibilities ' + n + ' ')
    }
  }

  // the five §0 subsections
  for (const sub of rules.sec0Subsections) {
    if (!main.includes(sub)) problems.push('§0 missing subsection ' + sub)
  }

  // the §0 red line
  const s0 = sec0Range(main)
  if (s0.h < 0) {
    problems.push('Missing §0 handover heading (## §0)')
  } else {
    if (s0.bytes > rules.sec0MaxBytes) problems.push('§0 ' + s0.bytes + ' B over ' + (rules.sec0MaxBytes / 1024) + ' KB (hard limit ' + rules.sec0MaxBytes + ')')
    else ok.push('§0 ' + s0.bytes + ' B')
    if (s0.hasOld) warns.push('Uses the old §0 heading (## 〇, current handover); change it to ## §0')
    if (s0.hasOld && s0.hasNew) warns.push('Both the old and the new §0 headings are present')
  }

  // content warnings (warn only, never block)
  {
    const pmDir = path.join(dir, rules.projectDir)
    const pmCount = fs.existsSync(pmDir) ? fs.readdirSync(pmDir).filter((x) => x.endsWith('.md')).length : 0
    const seg2 = subsection(main, '### 2) Current Projects')
    if (pmCount > 0 && /\|\s*\(none\)\s*\|/.test(seg2)) warns.push('Current projects table says "none", but project memory has ' + pmCount + ' copies (the table needs updating)')
    const seg4 = subsection(main, '### 4) Next Steps / Blockers')
    const body4 = seg4.split(/\r?\n/).filter((l) => /^-\s*\S/.test(l.trim()))
    if (!body4.length) warns.push('Section 4 (next steps / blockers) is empty')
    // project memory over the red line
    if (fs.existsSync(pmDir)) {
      for (const f of fs.readdirSync(pmDir).filter((x) => x.endsWith('.md'))) {
        const b = sizeOf(path.join(pmDir, f))
        if (b > rules.projectMaxBytes) warns.push('Project memory ' + f + ' ' + (b / 1024).toFixed(1) + ' KB over ' + (rules.projectMaxBytes / 1024) + ' KB')
      }
    }
  }

  // main file size (warn only)
  const mainBytes = Buffer.byteLength(main)
  if (mainBytes > rules.mainMaxBytes) {
    warns.push('Main file ' + (mainBytes / 1024).toFixed(1) + ' KB over ' + (rules.mainMaxBytes / 1024) + ' KB (hard limit — move old content into ' + rules.archiveDir + '/ and leave a pointer)')
  }

  console.log('\n' + name + ': ' + (problems.length ? '✗ ' + problems.length + ' problem(s)' : '✓ All checks passed') +
    ' (' + ok.length + ' passed' + (warns.length ? ' · ⚠ ' + warns.length + ' warning(s)' : '') + ')')
  problems.forEach((p) => console.log('   ✗ ' + p))
  warns.forEach((p) => console.log('   ⚠ ' + p))
  return problems.length ? 1 : 0
}

function cmdList (memRoot, rules) {
  const dirs = fs.existsSync(memRoot)
    ? fs.readdirSync(memRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name)
    : []
  let bad = 0
  for (const d of dirs.sort()) {
    const has = (f) => fs.existsSync(path.join(memRoot, d, f))
    const flag = (b) => (b ? '✓' : '✗')
    // boundary marker: a real .git or .git-marker (for the demo); either one counts as a boundary
    const markName = rules['boundaryMarkerFile'] || '.git'
    const altName = rules['boundaryMarkerAltFile'] || '.git-marker'
    const hasMark = has(markName) || (altName !== markName && has(altName))
    const line = '  ' + d + '   Memory' + flag(has(rules.memoryFile)) + ' Identity' + flag(has(rules.identityFile)) +
      ' Portrait' + flag(has(rules.portraitFile)) + ' Project' + flag(has(rules.projectDir)) +
      ' Archive' + flag(has(rules.archiveDir)) + ' Boundary' + flag(hasMark)
    if (!(has(rules.identityFile) && has(rules.portraitFile))) bad++
    console.log(line)
  }
  console.log('\nTotal ' + dirs.length + ' scene(s); missing identity card/portrait: ' + bad + ' ')
  return 0
}

/* ───────────────────────── entry point ───────────────────────── */

const root = resolveRoot()
const memRoot = resolveMemoryRoot(root)
const rules = loadRules(root)
const cmd = argv[0]

if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
  console.log(`Scene memory validation tool —— the memory lives in the files, not in the chat

Usage:
  node scene-memory.mjs list                     what every scene is missing
  node scene-memory.mjs init    --scene <name>   create the scene skeleton (the six-piece set + directory structure)
  node scene-memory.mjs stamp   --scene <name>   regenerate the identity card (with a sha256 fingerprint) and the scene portrait
  node scene-memory.mjs handover --scene <name>   archive the old §0 + fill the §0 skeleton
  node scene-memory.mjs check   --scene <name>   validate (fail-closed: it blocks when it does not pass)
  node scene-memory.mjs check   --all            validate every scene

Common options:
  --root <workbench-root>   the workbench root (default: the parent directory of the tool)
  --scene <name>            the scene name (you may also pass a path directly)

Exit codes:
  0 = passed  1 = something did not pass  2 = usage error

Rules source: handover-rules.json (the red-line numbers are defined there exactly once)
Acceptance: bash negative-acceptance.sh —— proves "it fails when it should fail"`)
  process.exit(0)
}

if (!cmd) {
  console.log(' (no subcommand — list all scenes)\n')
}
if (!cmd || cmd === 'list') {
  console.log('Memory root: ' + memRoot + '\nRules source: ' + rules._source + '\n')
  process.exit(cmdList(memRoot, rules))
}

const name = val('--scene') || val('--scene')

if (cmd === 'check' && has('--all')) {
  const dirs = fs.existsSync(memRoot)
    ? fs.readdirSync(memRoot, { withFileTypes: true }).filter((e) => e.isDirectory() && !e.name.startsWith('_')).map((e) => e.name).sort()
    : []
  let n = 0
  for (const d of dirs) n += cmdCheck(root, memRoot, rules, d) ? 1 : 0
  console.log('\n' + (n ? '✗ ' + n + ' scene(s) failed' : '✓ All scenes passed'))
  process.exit(n ? 1 : 0)
}

if (!name) {
  console.error('Usage: node scene-memory.mjs <list|init|stamp|handover|check> --scene <name> [--root <workbench-root>]')
  console.error('       check every scene: node scene-memory.mjs check --all')
  process.exit(2)
}

switch (cmd) {
  case 'init': process.exit(cmdInit(root, memRoot, rules, name))
  case 'stamp': process.exit(cmdStamp(root, memRoot, rules, name))
  case 'handover':
  case 'handover': process.exit(cmdHandover(root, memRoot, rules, name))
  case 'check': process.exit(cmdCheck(root, memRoot, rules, name))
  default:
    console.error('Unknown command: ' + cmd)
    process.exit(2)
}

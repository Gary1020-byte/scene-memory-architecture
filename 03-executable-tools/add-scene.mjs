#!/usr/bin/env node
/**
 * Scene Builder —— create a "standard scene" in one shot
 *
 * Usage:
 *   node add-scene.mjs --root <workbench-root> --id <scene-id> --name <scene-name> [--duties "a;b;c"] [--dir <dir-name>]
 *   node add-scene.mjs --root <workbench-root> --spec <spec-file.json>   # batch / from a file
 *
 * Exit codes: 0 = created; 1 = something went wrong; 2 = usage error
 *
 * ★ What this tool does — the "engine-neutral part":
 *   create the directory, git init, write the six-piece set, register the identity index.
 *   **It does not touch the engine** — creating the resident session is the engine's job
 *   (DSH: 工具/建會話.sh). After the engine side is done, fill the sessionId back into
 *   both places, then run stamp + check.
 *
 * ★ Why this tool exists:
 *   The failure modes of adding a scene are all "missed one step but the symptom is subtle"
 *   (forgot git init ⇒ the dedicated skill disappears but the scene just looks dumber;
 *   sessionId filled in only one place ⇒ check is all red but you cannot see what is wrong).
 *   The tool automates the mechanical steps; the rest belongs to the engine side and to people.
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  loadRules, resolveMemoryRoot, resolveIndexPath, readText, writeText, exists, today,
} from './workbench.mjs'

const args = process.argv.slice(2)
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }

const root = getArg('--root')
const sceneId = getArg('--id')
const sceneName = getArg('--name')
const dutiesArg = getArg('--duties')
const dirName = getArg('--dir')
const specFile = getArg('--spec')

if (!root) {
  console.error('Usage: node add-scene.mjs --root <workbench-root> --id <scene-id> --name <scene-name> [--duties "a;b;c"] [--dir <dir-name>]')
  process.exit(2)
}

const rules = loadRules(root)
const memRoot = resolveMemoryRoot(root)
const indexPath = resolveIndexPath(root)

/* ───────────────────────── templates ───────────────────────── */

function tplLocatorCard (id, name, dir, panelRel) {
  return `# ${name} · Locator Card

- Scene ID: \`${id}\`
- Scene Name: ${name}
- Panel: \`${panelRel}\`
- Memory Directory: ${rules.sceneRootDir}/${dir}/
- Dedicated Skill: \`${id}\` (\`${rules.sceneRootDir}/${dir}/${rules.skillDir}/${id}/${rules.skillFile}\`)
- Locator Card Version: 1
`
}

function tplConstitution (id, name) {
  return `# Scene Constitution · ${name} (\`${id}\`)

> This file is the "constitution layer" of this scene; it is injected into this scene's session context by the engine's \`agent-instructions\`.
> Scope: this directory is an independent git repository ⇒ only sessions whose cwd falls inside this directory tree get this constitution.

## Who I Am

- Scene id: \`${id}\` ｜ Scene name: ${name}
- Locator card: \`./${rules.locatorFile}\` (read it first)
- Dedicated skill: \`${id}\` (visible only to sessions inside this scene's repository)
- Source of truth for memory: \`./${rules.memoryFile}\` (**the only source of truth**, not the chat log)

## Responsibility Boundary (draw it hard, do not cross it)

- **Responsible for**: see the locator card and the "Core Responsibilities" in \`./${rules.memoryFile}\`.
- **Not touching**: other scenes' memory directories. Finding someone else's mistake ⇒ **you may only send a request, you may never edit it for them**.
- Write only your own \`./${rules.memoryFile}\`, \`./${rules.projectDir}/\`, \`./${rules.archiveDir}/\`.
- No mail sending / receiving / Gmail・IMAP access (that is the mail-handling scene)
- No publishing / exposing anything to external services (that is the product-release scene)
- No deleting files, no editing another scene's memory (if you find a mistake → dispatch a notice or leave a message)
- No touching Docker／containerd／fstab and no deleting files (report a plan and get the user's consent first)

## Ownership Check (do this before touching anything)

1. **Decide who owns this job first**: \`node <workbench-root>/工具/派單.mjs 路由 --要 "<one line>"\`.
   - Hit ⇒ that is the right owner. **This scene only does its own share, the rest is dispatched to it**, then wait for the receipt before moving on.
   - Exit code 3 (no mechanical hit) → read the responsibilities section of that scene's \`AGENTS.md\`; still unsure → ask the user.
2. **Any job outside this scene's responsibilities is dispatched, never done here.**
3. **"This machine can run it" ≠ "this scene should run it".** If you find a key (password／token／API key／credential file), stop and confirm the ownership first.
4. **Once dispatched, do not do that share yourself.** A dispatch is a handover, not a request for help; the job is done only when the receipt comes back.

## Memory Rules (the four most important ones)

1. **The very first thing at the start of a session**: read the \`## §0 Current Handover\` of \`./${rules.memoryFile}\`.
2. **§0 ≤ 4 KB**, written by overwriting in place; main file ≤ 25 KB; details sink into \`## §5 Decisions and Pitfalls\` (append only).
3. **Write-back criterion**: record conclusions, not process; each write-back ≤ 10 lines / ≤ 2 KB.
4. **Before switching sessions**: write the handover first → run \`scene-memory.mjs check --scene ${name}\`, **if it does not pass you may not switch**.

## Session Switch Protocol (four steps, step ③ cannot be skipped)

1. Overwrite \`§0 Current Handover\`
2. Create the new session, archive the old session
3. **Sync three places**: the scene json's \`sessionId\` / the session id column of the identity index table / the \`§0\` handover signature
4. Self-check: \`node <workbench-root>/工具/scene-memory.mjs check --scene ${name}\`

## Cross-Scene

- You may only send **notifications / dispatches / receipts**; ⛔ you may never modify the other side's memory.
- The dispatch four-part contract: **What · Criteria · Output Location · Receipt Format**; **one dispatch = one receipt**.
- No reply from the other side ⇒ it counts as "not receipted"; do not treat it as already done.

## Tools

\`\`\`bash
node <workbench-root>/工具/scene-memory.mjs list                    # list what every scene is missing
node <workbench-root>/工具/scene-memory.mjs check --scene ${name}    # self-check
node <workbench-root>/工具/scene-memory.mjs handover --scene ${name}    # archive the old version + fill in §0
\`\`\`
`
}

function tplSkill (id, name, absDir) {
  return `---
name: ${id}
description: 【Scene: ${name}】The dedicated skill of the ${name} scene: take over this scene's memory when a session opens, write the conclusions back into the scene private memory when the work is done, send dispatches/receipts to other scenes. Use it when the session's working directory is ${absDir}.
---

# ${name} · Scene Dedicated Skill

1. **Take over**: read the \`## §0 Current Handover\` of \`./${rules.memoryFile}\` (≤4 KB, five subsections: Last Handover / Current Projects / Private Memory Changes / Next Steps · Blockers / Full Picture).
2. **Do the work**: touch only this scene's directory and this scene's memory; other people's territory is request-only.
3. **Write back**: write the conclusions back into \`§0\` (≤10 lines/≤2 KB, conclusions only, not process); append the details into \`## §5 Decisions and Pitfalls\`.
4. **Hand over**: before wrapping up or switching sessions run \`scene-memory.mjs handover --scene ${name}\`, then only switch after \`check\` passes.
5. **Cross-scene**: decide the ownership before acting (run \`派單.mjs 路由\`); the dispatch must state What · Criteria · Output Location · Receipt Format.

> ⚠️ **The path in the description must be the absolute path of the scene directory** —— that is what the engine
> uses to decide "is this skill visible in this scene". A wrong path ⇒ the skill shows up in other scenes too.
`
}

function tplMemory (name, duties) {
  const dutyLines = duties.map((d) => `- ${d}`).join('\n')
  return `# ${name} · Scene Private Memory

> Identity and shape see \`${rules.identityFile}\` / \`${rules.portraitFile}\` (tool-generated, ⛔ hand-editing)
> The rule: only this scene may rewrite this memory; other scenes may only point out errors.

## §0 Current Handover (≤ 4 KB, a new session reads this section first)

${rules.sec0Subsections[0]}
- (the tool writes this at handover time: the old version is archived in \`${rules.archiveDir}/<file-name>\`)

${rules.sec0Subsections[1]}
| Project | Memory file | Status | Next step |
|---|---|---|---|
| (none) | — | — | — |

${rules.sec0Subsections[2]}
-

${rules.sec0Subsections[3]}
- Next step:
- Blockers:

${rules.sec0Subsections[4]}
- Project memory 0 · ${rules.archiveDir} 0 copies · Index ${rules.fileIndexFile}

## ${rules.dutyHeading.replace('## ', '')}

${dutyLines}
- Does not touch: never edits another scene's memory (if you find an error, dispatch a notice instead).
- In one line:

## §1 What I Own / What I Don't

- Own:
- Don't own:

## §2 Where to Start

- Project memory: \`${rules.projectDir}/<project-name>.md\` (the index table goes in §0 subsection 2 above)
- ${rules.archiveDir}: \`${rules.archiveDir}/\`
- Index: \`${rules.fileIndexFile}\`

## §5 Decisions and Pitfalls (append only)

## 0 - Notifications
`
}

function tplFileIndex (name) {
  const d = today()
  return `# ${name} · File Index

> Four states: \`active / standing / archived / to-clean\`

| File / Directory | What It Is | Status | Last Reviewed |
|---|---|---|---|
| \`${rules.memoryFile}\` | Scene private memory (human-written: handover / duties / decisions / project index) | active | ${d} |
| \`${rules.identityFile}\` | Identity card (tool-generated: identity / permissions / locator card fingerprint) | active | ${d} |
| \`${rules.portraitFile}\` | Scene portrait (tool-generated) | active | ${d} |
| \`${rules.projectDir}/\` | One memory file per project | active | ${d} |
| \`${rules.archiveDir}/\` | Old snapshots (write-once) | archived | ${d} |
`
}

/* ───────────────────────── main flow ───────────────────────── */

function createScene ({ id, name, dir, duties }) {
  const sceneDir = path.join(memRoot, dir)
  const absDir = path.resolve(sceneDir)
  const panelRel = `scenarios/${id}.json`
  const steps = []

  // ① directory
  for (const d of ['', path.join(rules.skillDir, id), rules.projectDir, rules.archiveDir]) {
    fs.mkdirSync(path.join(sceneDir, d), { recursive: true })
  }
  steps.push(['Create directory', path.relative(root, sceneDir)])

  // ② git init (the scene boundary)
  const mark = rules.boundaryMarkerFile
  if (!exists(path.join(sceneDir, mark))) {
    try {
      execFileSync('git', ['init', '-q'], { cwd: sceneDir, stdio: 'pipe' })
      execFileSync('git', ['config', 'user.name', 'workbench'], { cwd: sceneDir, stdio: 'pipe' })
      execFileSync('git', ['config', 'user.email', 'workbench@local'], { cwd: sceneDir, stdio: 'pipe' })
      steps.push(['git init (scene boundary)', '★ Without it the dedicated skill will not load, and the symptom is subtle'])
    } catch (e) {
      console.error('✗ git init failed: ' + e.message)
      return 1
    }
  } else {
    steps.push(['git init', 'already exists, skipped'])
  }

  // ③ the six-piece set
  const files = [
    [rules.locatorFile, tplLocatorCard(id, name, dir, panelRel)],
    [rules.constitutionFile, tplConstitution(id, name)],
    [path.join(rules.skillDir, id, rules.skillFile), tplSkill(id, name, absDir)],
    [rules.memoryFile, tplMemory(name, duties)],
    [rules.fileIndexFile, tplFileIndex(name)]
  ]
  for (const [rel, body] of files) {
    const p = path.join(sceneDir, rel)
    if (exists(p)) {
      steps.push([rel, 'already exists, not overwritten'])
      continue
    }
    writeText(p, body)
    steps.push([rel, 'Create'])
  }

  // ④ register in the identity index
  const idx = readText(indexPath)
  const row = `| \`${id}\` | \`${id}-ai\` | AI·${name} | ${name} | \`（待回填）\` | \`${absDir}/${rules.locatorFile}\` | \`${id}\` |`
  if (idx.includes(`\`${id}\``)) {
    steps.push(['identity index', 'this line already present, not duplicated'])
  } else {
    const lines = idx.split('\n')
    const out = []
    let inserted = false
    for (const line of lines) {
      out.push(line)
      // insert after the last table data row (table rows all start with "| `")
      if (!inserted && line.startsWith('| `') && line.includes('|')) {
        out.push(row)
        inserted = true
      }
    }
    if (!inserted) {
      // no table ⇒ append at the end of the file
      out.push('')
      out.push(row)
    }
    writeText(indexPath, out.join('\n'))
    steps.push(['identity index', 'register a row for `' + id + '` (sessionId to be filled in later)'])
  }

  return { steps, sceneDir, absDir }
}

/* ───────────────────────── run ───────────────────────── */

const specs = []
if (specFile) {
  const j = JSON.parse(readText(specFile))
  const arr = Array.isArray(j) ? j : [j]
  for (const s of arr) specs.push(s)
} else {
  if (!sceneId || !sceneName) {
    console.error('Need --id and --name (or --spec)')
    process.exit(2)
  }
  specs.push({
    id: sceneId,
    name: sceneName,
    dir: dirName || sceneName,
    duties: (dutiesArg || '').split(/[;；]/).map(s => s.trim()).filter(Boolean),
  })
}

for (const s of specs) {
  const id = s.id
  const name = s.name
  const dir = s.dir || name
  const duties = (s.duties || []).length ? s.duties : [
    `Owns: the responsibilities of scene ${name} (make this one concrete sentence)`,
    'Does not touch: never edits another scene\'s memory (if you find an error, dispatch a notice instead).',
    'In one line: ',
  ]

  console.log('\n▸ Create scene "' + name + '" (' + id + ')')
  const res = createScene({ id, name, dir, duties })
  if (res === 1) process.exit(1)
  for (const [what, note] of res.steps) {
    console.log(`  ✓ ${what.padEnd(24)} ${note}`)
  }
  console.log('\n  Scene directory: ' + res.absDir)
}

console.log('\n═══ Not Done Yet (Engine Side) ═══')
console.log('① On the engine side, create the scene definition json (use 04-templates/scene-definition-template.json; the name field = the scene directory name)')
console.log('② Create the resident session (DSH: bash 工具/建會話.sh <scene-name>)')
console.log('③ Fill sessionId back into both the scene definition json and the identity index')
console.log('④ node scene-memory.mjs stamp --scene <scene-name> --root <workbench-root>')
console.log('⑤ node scene-memory.mjs check --scene <scene-name> --root <workbench-root>   ← must be all green')

#!/usr/bin/env node
/**
 * 工作流執行器 —— 讓「場景串成一條線」真的跑起來
 *
 * 用法：
 *   node run-workflow.mjs start  --root <工作台根> --工作流 <id>   啟動（預檢 → 建 run 狀態）
 *   node run-workflow.mjs step   --root <工作台根> --run <run-id>  推進下一跳（開派單）
 *   node run-workflow.mjs 回執   --root <工作台根> --run <run-id> --回執 <檔>  收回執並驗收
 *   node run-workflow.mjs status --root <工作台根> [--run <run-id>]  看狀態
 *
 * 退出碼：0 = 成功；1 = 有阻擋；2 = 用法/找不到
 *
 * ★ 這個版本是「離線執行器」：它不真的呼叫引擎，而是把每一步該做什麼
 *   （派單內容、該讀的檔案、該檢查的東西）寫成檔案並推進狀態機。
 *   這是刻意的：**引擎中立**——引擎專用版只要把「產生派單」換成「真的派出去」即可，
 *   狀態機與驗收邏輯完全沿用。
 *
 * ★ 這支工具的真正價值：它把「規格」變成「會卡住你的東西」。
 *   預檢不過就不准啟動；回執不合格就不准往下走。
 */
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  loadRules, resolveMemoryRoot, resolveIndexPath, resolveWorkflowDir, resolveExecRoot,
  parseYaml, readText, writeText, exists, now, today, sectionLines,
} from './workbench.mjs'

const args = process.argv.slice(2)
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const cmd = args[0]

const root = getArg('--root')
const wfId = getArg('--workflow')
const runId = getArg('--run')
const receiptArg = getArg('--receipt')

if (!root) {
  console.error('Usage: node run-workflow.mjs <start|step|receipt|status> --root <workbench-root> [...]')
  process.exit(2)
}

const rules = loadRules(root)
const memRoot = resolveMemoryRoot(root)
const execRoot = resolveExecRoot(root)
const wfDir = resolveWorkflowDir(root)

/* ───────────────────────── Tools ───────────────────────── */

function fail (msg, code = 1) {
  console.error('✗ ' + msg)
  process.exit(code)
}

function loadWorkflow (id) {
  if (!exists(wfDir)) fail('Cannot find workflow directory: ' + wfDir, 2)
  const files = fs.readdirSync(wfDir).filter(f => /\.ya?ml$/.test(f))
  const hit = files.find(f => f.replace(/\.ya?ml$/, '') === id)
  if (!hit) fail('Cannot find workflow: ' + id + '(has: ' + files.join(', ') + '）', 2)
  const p = path.join(wfDir, hit)
  let doc
  try {
    doc = parseYaml(readText(p))
  } catch (e) {
    fail('Workflow parse failed: ' + e.message)
  }
  return { path: p, name: hit.replace(/\.ya?ml$/, ''), doc }
}

function stepsOf (doc) {
  return Array.isArray(doc['steps']) ? doc['steps'] : []
}

function readState (runDir) {
  const p = path.join(runDir, rules.executionStateFile)
  if (!exists(p)) return null
  const lines = readText(p).split('\n')
  const state = { steps: [] }
  let inTable = false
  for (const raw of lines) {
    const line = raw.trim()
    const m = line.match(/^-\s*([^：:]+)[：:]\s*(.*)$/)
    if (m) {
      const k = m[1].trim()
      const v = m[2].trim()
      // ★ 寫與讀的用字只要差一個字，狀態就會靜默變成 undefined。
      if (k === 'Current Step' || k === 'currentStep') state.currentStep = Number(v)
      if (k === 'Status' || k === 'status') state.status = v
      if (k === 'Workflow' || k === 'workflow') state.workflow = v
      // ★ run id / 啟動時間也要讀回來。
      //   少了這兩行，第二次讀狀態檔時 state.runId 會變 undefined，
      //   派單 id 就會變成「派單-undefined-步N-xxxx」——派單 id 毀了，
      //   回執認領校驗也就形同虛設。
      if (k === 'Run ID' || k === 'run id' || k === 'runId') state.runId = v
      if (k === 'Start Time' || k === 'startTime') state.startTime = v
      continue
    }
    if (line.startsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c !== '')
      if (cells.length >= 4 && /^\d+$/.test(cells[0])) {
        state.steps.push({ index: Number(cells[0]), scene: cells[1], status: cells[2], receipt: cells[3] })
        inTable = true
        continue
      }
      if (inTable && /^\|?\s*---/.test(line)) continue
    }
  }
  return state
}

function writeState (runDir, state) {
  const rows = state.steps.map(s => `| ${s.index} | ${s.scene} | ${s.status} | ${s.receipt || '—'} |`).join('\n')
  const body = `# Execution State · ${state.workflow}

> This file is the **private state of this one execution** (not a plan). The workflow definition lives in the shared layer.
> If it is closed midway, the machine crashes, or someone else takes over ⇒ this file is what lets them pick it up.

- Workflow: ${state.workflow}
- Run ID: ${state.runId}
- Start Time: ${state.startTime}
- Updated: ${now()}
- Status: ${state.status}
- Current Step: ${state.currentStep}

## Step Progress

| # | Scene | Status | Receipt |
|---|---|---|---|
${rows}

## Blocker

${state.blocker || '- none'}

## Next Action

${state.nextAction || '-  (none)'}
`
  writeText(path.join(runDir, rules.executionStateFile), body)
}

function listRuns () {
  if (!exists(execRoot)) return []
  return fs.readdirSync(execRoot, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
}

/* ───────────────────────── Dispatch Self-Check ───────────────────────── */

/**
 * 產生派單後立刻檢查：缺判據的派單送出去會靜默失效。
 * 這是「送出之前」的最後一道閘，比「收到之後才發現不對」便宜得多。
 */
function checkDispatch (p) {
  try {
    execFileSync(process.execPath, [
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'verify-dispatch.mjs'),
      '--root', root, '--dispatch', p,
    ], { stdio: 'pipe' })
    return { ok: true, problems: [] }
  } catch (e) {
    const out = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
    const problems = out.split('\n')
      .filter(l => l.trim().startsWith('· '))
      .map(l => l.trim().slice(2))
    return { ok: false, problems: problems.length ? problems : ['Dispatch validation failed (exit ' + (e.status || '?') + '）'] }
  }
}

/* ───────────────────────── start ───────────────────────── */

function cmdStart () {
  if (!wfId) fail('start requires --workflow <id>')
  const wf = loadWorkflow(wfId)
  const steps = stepsOf(wf.doc)

  // ★ 預檢（fail-closed）：任一不過就拒絕啟動
  const problems = []
  if (!wf.doc['id']) problems.push('Workflow is missing id')
  if (!wf.doc['version']) problems.push('Workflow is missing version')
  if (!steps.length) problems.push('Workflow has no steps')
  steps.forEach((s, i) => {
    for (const f of ['scene', 'purpose', 'criteria']) {
      if (!s || !s[f]) problems.push(`step${i + 1} missing "${f}」`)
    }
    if (s && s['scene']) {
      const dir = path.join(memRoot, s['scene'])
      if (!exists(dir)) {
        problems.push('Step ' + (i + 1) + ': the scene "' + s['scene'] + '" does not exist (' + dir + ')')
      } else {
        const mark = rules.boundaryMarkerFile
        const alt = rules.boundaryMarkerAltFile
        if (!exists(path.join(dir, mark)) && !exists(path.join(dir, alt))) {
          problems.push('Step ' + (i + 1) + ': the scene "' + s['scene'] + '" has no boundary marker (' + mark + ')')
        }
      }
    }
  })
  if (problems.length) {
    console.log('\n✗ Preconditions failed, refusing to start: ')
    for (const p of problems) console.log('  · ' + p)
    process.exit(1)
  }

  const id = `${wf.name}-${today()}-${String(Date.now()).slice(-6)}`
  const runDir = path.join(execRoot, id)
  writeText(path.join(runDir, 'workflow.yaml'), readText(wf.path))
  writeText(path.join(runDir, rules.carryFile), `# Carry File · ${wf.name}\n\n> The carrier that passes each hop's accumulable artifact down the chain. The next hop's dispatch quotes this content.\n\n## step 1 的Accumulable Artifact\n\n（尚未執行）\n`)

  const state = {
    工作流: wf.name,
    runId: id,
    startTime: now(),
    status: 'running',
    currentStep: 1,
    blocker: '- none',
    nextAction: 'Run `run-workflow.mjs step --run ' + id + "` to produce step 1's dispatch",
    steps: steps.map((s, i) => ({ index: i + 1, scene: s['scene'], status: 'pending', receipt: '' })),
  }
  writeState(runDir, state)

  console.log('\n✓ Preconditions pass, workflow started')
  console.log('  run id：' + id)
  console.log('  Step count: ' + steps.length)
  console.log('  State file: ' + path.join(runDir, rules.executionStateFile))
  console.log('\nNext: node run-workflow.mjs step --root <workbench-root> --run ' + id)
}

/* ───────────────────────── step ───────────────────────── */

function cmdStep () {
  if (!runId) fail('step requires --run <run-id>')
  const runDir = path.join(execRoot, runId)
  if (!exists(runDir)) fail('Cannot find run: ' + runId, 2)
  const state = readState(runDir)
  if (!state) fail('Cannot read run state file: ' + path.join(runDir, rules.executionStateFile))
  if (state.status !== 'running') fail('run status is "' + state.status + '"; cannot advance')

  const wfDoc = parseYaml(readText(path.join(runDir, 'workflow.yaml')))
  const steps = stepsOf(wfDoc)
  const idx = state.currentStep - 1
  if (idx < 0 || idx >= steps.length) {
    state.status = 'completed'
    state.currentStep = steps.length
    writeState(runDir, state)
    console.log('\n✓ Workflow ran all steps')
    return
  }
  const step = steps[idx]
  const stepNo = idx + 1

  const r = produceStep(runDir, state, wfDoc, steps, step, stepNo)
  console.log('\n▶ Step ' + stepNo + '/' + steps.length + ' Dispatch generated')
  console.log('  Scene: ' + step['scene'])
  console.log('  Dispatch file: ' + r.dispatchPath)
  console.log('  Dispatch id: ' + r.dispatchId)
  if (r.carried) console.log('  Carried the previous hop\'s accumulable artifact (' + r.carried.split('\n').length + ' lines)')
  if (step['needsConfirmation'] === true || step['needsConfirmation'] === 'true') console.log('  ⚠ This step is a gate; after collecting the receipt it stops and waits')
  console.log('\nDispatch content:\n' + r.dispatch)
}

/**
 * ★ 產生某一步的派單檔（step 與 run 共用同一份邏輯）。
 *
 * 為什麼要抽出來：`step` 是手動跑一格，`run` 是迴圈跑一格。
 *   兩邊若各寫一份 producing logic，就會出現「手動跑跟自動跑產出的派單長得不一样」
 *   ——然後自動推進會在某些步驟失敗而你查不出原因。
 *
 * @returns {{dispatchPath:string, dispatch:string, dispatchId:string, carried:string}}
 */
function produceStep (runDir, state, wfDoc, steps, step, stepNo) {
  // 上一跳的可累積物（從交接串取）
  let carried = ''
  const carryFile = path.join(runDir, rules.carryFile)
  if (exists(carryFile) && stepNo > 1) {
    const txt = readText(carryFile)
    const re = new RegExp(`## Step ${stepNo - 1} Accumulable Artifact[ \\t]*\\n([\\s\\S]*?)(?=\\n## |$)`)
    const m = txt.match(re)
    if (m) carried = m[1].trim()
  }

  // ★ 派單 id：這一跳的唯一識別。
  //   回執必須自報這個 id，否則無法確認「這份回覆是回給這張派單的」。
  //   沒有它，兩條工作流併發送同一場景時會互相認領錯回執而且沒有任何錯誤訊號。
  const dispatchId = 'dispatch-' + state.runId + '-step' + stepNo + '-' +
    Math.random().toString(36).slice(2, 6)

  const dispatch = `# Dispatch · ${wfDoc['name'] || 'workflow'} · step ${stepNo}/${steps.length}

【${step['scene']} · Dispatch · please reply with a receipt】

- Dispatch ID: ${dispatchId}
- From: the orchestrator (workflow ${wfDoc['id'] || ''})
- To: ${step['scene']}

${rules.dispatchField_what}:
  ${step['purpose']}

${rules.dispatchField_criteria}:
  ${step['criteria']}
${step['output'] ? `\n${rules.dispatchField_output}:\n  ${step['output']}\n` : ''}${carried ? `\n${rules.dispatchField_needs}:\n  ${carried}\n` : ''}
${rules.dispatchField_receipt}:
  ① Conclusion + Evidence + Path
  ② Must carry the "${rules.diffSetSection}"
  ③ Must carry the "${rules.artifactSection}" ★ without this one = this round was wasted
  ④ Must state the "${rules.nextHopSection}"
  ⑤ ★ The **first line** of the receipt must repeat this line verbatim (to confirm this reply answers this dispatch, not another one):
      Dispatch ID: ${dispatchId}
${step['needsConfirmation'] === true || step['needsConfirmation'] === 'true' ? '\n⚠ This step is a gate: when it is done, stop and wait for confirmation — it will not auto-advance.\n' : ''}
`
  const dispatchPath = path.join(runDir, rules.receiptDir, `dispatch-${stepNo}.md`)
  writeText(dispatchPath, dispatch)

  // ★ 產生派單後立刻自檢（送出之前的最後一道閘）
  const dispatchCheck = checkDispatch(dispatchPath)
  if (!dispatchCheck.ok) {
    console.log('\n✗ The generated dispatch is invalid: ')
    for (const p2 of dispatchCheck.problems) console.log('  · ' + p2)
    console.log('  (dispatch written to ' + dispatchPath + ', but do not send it out)')
  }

  const st = state.steps.find(s => s.index === stepNo)
  if (st) st.status = 'running'
  state.nextAction = 'Hand the dispatch to "' + step['scene'] + '", then run `run-workflow.mjs receipt --run ' + runId + ' --receipt <file>`'
  writeState(runDir, state)

  return { dispatchPath, dispatch, dispatchId, carried }
}

/* ───────────────────────── resume ───────────────────────── */

/**
 * ★ 這是實跑之後才發現要的東西。
 * 原規格只寫「失敗就地停」，沒寫「修好之後怎麼接回去」。
 * 實跑第一次被 fail-closed 擋下時，就卡死在「已停」——修好回執也收不進去。
 * 所以必須有 resume：把狀態從「已停」拉回「執行中」，重收同一跳的回執。
 */
function cmdResume () {
  if (!runId) fail('resume requires --run <run-id>')
  const runDir = path.join(execRoot, runId)
  if (!exists(runDir)) fail('Cannot find run: ' + runId, 2)
  const state = readState(runDir)
  if (!state) fail('Cannot read run state file')
  if (state.status === 'running') {
    console.log('\n· run is already "running", no need to resume')
    return
  }
  // ★ 門檻通過：跳過目前這一步，繼續下一跳
  if (getArg('--gate-passed') !== null) {
    const wfDoc0 = parseYaml(readText(path.join(runDir, 'workflow.yaml')))
    const steps0 = stepsOf(wfDoc0)
    const stepNo0 = state.currentStep
    state.currentStep = stepNo0 + 1
    state.status = state.currentStep > steps0.length ? 'completed' : 'running'
    state.blocker = '- none'
    state.nextAction = state.status === 'completed'
      ? '- (all done)'
      : 'Run `run-workflow.mjs step --run ' + runId + "` to produce step " + state.currentStep + "'s dispatch"
    writeState(runDir, state)
    console.log('\n✓ Gate confirmed, run advanced to step' + state.currentStep + '(status: ' + state.status + '）')
    return
  }
  const wfDoc = parseYaml(readText(path.join(runDir, 'workflow.yaml')))
  const steps = stepsOf(wfDoc)
  const stepNo = state.currentStep
  const step = steps[stepNo - 1]
  if (!step) fail('Current step is out of range')

  state.status = 'running'
  state.blocker = '- none'
  state.nextAction = 'Re-collect the receipt for step ' + stepNo + ': `run-workflow.mjs receipt --run ' + runId + ' --receipt <file>`'
  writeState(runDir, state)
  console.log('\n✓ run moved from "stopped" back to "running"')
  console.log('  Re-collect step ' + stepNo + " (" + step['scene'] + ")'s receipt")
}

/* ───────────────────────── Receipt ───────────────────────── */

function cmdReceipt () {
  if (!runId) fail('receipt requires --run <run-id>')
  if (!receiptArg) fail('receipt requires --receipt <file>')
  const runDir = path.join(execRoot, runId)
  if (!exists(runDir)) fail('Cannot find run: ' + runId, 2)
  const state = readState(runDir)
  if (!state) fail('Cannot read run state file')
  if (state.status !== 'running') fail('run status is "' + state.status + '"; cannot collect the receipt')

  const wfDoc = parseYaml(readText(path.join(runDir, 'workflow.yaml')))
  const steps = stepsOf(wfDoc)
  const stepNo = state.currentStep
  const step = steps[stepNo - 1]
  if (!step) fail('Current step is out of range')

  const receiptPath = path.resolve(receiptArg)
  const r = acceptReceipt(runDir, state, wfDoc, steps, receiptPath)
  if (!r.ok) process.exit(1)
  if (r.gate) return
  console.log('\n✓ Receipt accepted, run advanced to step' + state.currentStep + (state.status === 'completed' ? ' (all done)' : ''))
}

/**
 * ★ 收回執 = 驗收（fail-closed）＋ 推進（cmdReceipt 與 run 共用）。
 *
 * 為什麼要抽出來：手動收回執與迴圈收回執必須是**同一套**邏輯，
 *   否則會出現「手動跑會擋、跑起來不擋」的漏洞——那等於自動推進沒有護欄。
 *
 * @returns {{ok:boolean, gate:boolean}}
 */
function acceptReceipt (runDir, state, wfDoc, steps, receiptPath) {
  const stepNo = state.currentStep
  const step = steps[stepNo - 1]
  if (!step) fail('Current step is out of range')

  // ★ 收回執 = 驗收（fail-closed）
  let rc = 0
  try {
    execFileSync(process.execPath, [
      path.join(path.dirname(fileURLToPath(import.meta.url)), 'verify-receipt.mjs'),
      '--root', root,
      '--scene', step['scene'],
      '--receipt', receiptPath,
    ], { stdio: 'inherit' })
  } catch (e) {
    rc = e.status || 1
  }
  if (rc !== 0) {
    state.status = 'stopped'
    state.blocker = '- step ' + stepNo + ': the receipt was rejected (see above)'
    state.nextAction = 'fix the receipt (add the accumulable artifact), then re-collect'
    writeState(runDir, state)
    console.log('\n✗ Receipt rejected ⇒ run stopped at step' + stepNo + '（fail-closed）')
    return { ok: false, gate: false }
  }

  // 存回執副本
  const saved = path.join(runDir, rules.receiptDir, `receipt-${stepNo}.md`)
  writeText(saved, readText(receiptPath))

  // 可累積物寫進交接串（下一跳要吃）
  const carryText = readText(receiptPath)
  const carriedLines = sectionLines(carryText, rules.artifactSection)
  const carried = carriedLines.length
    ? carriedLines.join('\n')
    : '(the receipt had no accumulable artifact section — the receipt validator already blocked it; this is a backstop)'
  const carryFile = path.join(runDir, rules.carryFile)
  let carryBody = exists(carryFile) ? readText(carryFile) : `# Carry File · ${wfDoc['name']}\n\n`
  carryBody = carryBody.replace(
    new RegExp(`## Step ${stepNo} Accumulable Artifact[ \\t]*\\n[\\s\\S]*?(?=\\n## |$)`),
    `## Step ${stepNo} Accumulable Artifact\n\n${carried}\n`
  )
  if (!carryBody.includes(`## Step ${stepNo} Accumulable Artifact`)) {
    carryBody += `\n## Step ${stepNo} Accumulable Artifact\n\n${carried}\n`
  }
  writeText(carryFile, carryBody)

  const st = state.steps.find(s => s.index === stepNo)
  if (st) { st.status = 'completed'; st.receipt = path.basename(saved) }

  // 門檻？
  const isGate = step['needsConfirmation'] === true || step['needsConfirmation'] === 'true'
  if (isGate) {
    state.status = 'waiting-for-gate'
    state.nextAction = '★ Gate: have someone confirm, then run `run-workflow.mjs resume --run ' + runId + ' --gate-passed`'
    state.blocker = '- step ' + stepNo + ' is a gate, waiting for confirmation'
    writeState(runDir, state)
    console.log('\n✓ Receipt accepted, but this step is a gate ⇒ run stops at step' + stepNo + ', waiting for confirmation')
    console.log('  After confirming, run `run-workflow.mjs resume --run ' + runId + ' --gate-passed`')
    return { ok: true, gate: true }
  }

  state.currentStep = stepNo + 1
  if (stepNo >= steps.length) {
    state.status = 'completed'
    state.nextAction = '- (all done)'
  } else {
    state.nextAction = 'Run `run-workflow.mjs step --run ' + runId + "` to produce step " + (stepNo + 1) + "'s dispatch"
  }
  writeState(runDir, state)
  return { ok: true, gate: false }
}

/* ───────────────────────── run (auto-advance) ───────────────────────── */

/**
 * ★ 自動推進：while 迴圈，把「產生派單 → 送出 → 等回覆 → 收回執 → 驗收 → 推進」
 *   一次跑完。
 *
 * ★ 為什麼迴圈要寫在**腳本**裡而不是讓主控端 agent 一輪輪查：
 *   等待期間 agent 每查一次就是一次 LLM 回合（token 成本隨時間線性成長、
 *   context 越滾越大、還會被壓縮弄壞）。腳本迴圈等待期間 LLM 完全不參與，
 *   只有需要人介入（門檻／拒絕／逾時）才停下來回報。
 *
 * ★ 停下來的條件（每一個都要寫清楚原因，不能默默停）：
 *   ① 門檻（需確認: true）→ 狀態「等門檻」，等人 resume
 *   ② 場景忙到逾時 → 狀態「已停（場景忙）」，附拒絕原因
 *   ③ 回執不合格 → 狀態「已停」（既有 fail-closed 行為）
 *   ④ 回執疑似錯配 → 狀態「已停（回執疑似錯配）」
 *   ⑤ 逾時沒回覆 → 狀態「已停（逾時）」
 *   ⑥ 全部步驟完成 → 狀態「已完成」
 *
 * 用法：
 *   node run-workflow.mjs run --root <工作台根> --run <run-id>
 */
function cmdRun () {
  if (!runId) fail('run requires --run <run-id>')
  const runDir = path.join(execRoot, runId)
  if (!exists(runDir)) fail('Cannot find run: ' + runId, 2)

  // 派單要送到場景去，需要引擎端的派單工具。
  const dispatchTool = getArg('--dispatch-tool') || process.env.DSH_DISPATCH_TOOL ||
    path.join(root, 'tool', '派單.mjs')
  if (!exists(dispatchTool)) {
    fail('Cannot find dispatch tool: ' + dispatchTool + ' (use --dispatch-tool, or set DSH_DISPATCH_TOOL)', 2)
  }

  const maxWaitSec = getArg('--等場景秒數') ? Number(getArg('--等場景秒數')) : 300

  console.log('▶ Auto-advance started (run ' + runId + '）')
  console.log('  Dispatch tool: ' + dispatchTool)
  console.log('  Max wait while the scene is busy: ' + maxWaitSec + ' seconds')
  console.log('  ★ The loop runs inside the script; no model calls while waiting (zero LLM cost)\n')

  while (true) {
    const state = readState(runDir)
    if (!state) fail('Cannot read run state file')
    if (state.status === 'completed') {
      console.log('\n✓ All steps complete, run finished')
      break
    }
    if (state.status === 'waiting-for-gate') {
      console.log('\n⏸ run stopped at a gate (status: waiting-for-gate) — have someone confirm, then run')
      console.log('  `run-workflow.mjs resume --run ' + runId + ' --gate-passed`')
      break
    }
    if (state.status !== 'running') {
      console.log('\n⏸ run status is "' + state.status + '", not "running" — auto-advance stops')
      if (state.blocker && state.blocker !== '- none') console.log('  Blocker: ' + state.blocker.replace(/^- /, ''))
      break
    }

    const wfDoc = parseYaml(readText(path.join(runDir, 'workflow.yaml')))
    const steps = stepsOf(wfDoc)
    const idx = state.currentStep - 1
    if (idx < 0 || idx >= steps.length) {
      state.status = 'completed'
      state.currentStep = steps.length
      writeState(runDir, state)
      console.log('\n✓ Workflow ran all steps')
      break
    }
    const step = steps[idx]
    const stepNo = idx + 1

    // ── 1. 產生派單 ──
    const produced = produceStep(runDir, state, wfDoc, steps, step, stepNo)
    console.log('\n▶ Step ' + stepNo + '/' + steps.length + '（' + step['scene'] + ') dispatch generated')

    // ── 2. 送出去 + 等回覆 ──
    const receiptOut = path.join(runDir, rules.receiptDir, `receipt-${stepNo}.md`)
    let rc = 0
    let out = ''
    try {
      out = execFileSync(process.execPath, [
        dispatchTool, '送',
        '--file', produced.dispatchPath,
        '--reply-output', receiptOut,
        '--recipient', step['scene'],
        '--等scene秒數', String(maxWaitSec),
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      rc = 0
    } catch (e) {
      rc = e.status || 1
      out = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
    }
    for (const line of out.split('\n')) if (line.trim()) console.log('    ' + line)

    // ── 3. 送出失敗分支：明確拒絕 / 逾時 / 錯配 ──
    if (rc !== 0) {
      state.status = 'stopped'
      if (rc === 4) {
        state.blocker = '- step ' + stepNo + ': the dispatch was rejected or the receipt id does not match (see the output above)'
        state.nextAction = 'Read the dispatch state file\'s "rejection reason" / "mismatch reason", then run `run-workflow.mjs resume --run ' + runId + '`'
      } else if (rc === 3) {
        state.blocker = '- step ' + stepNo + ': timed out without reading a reply'
        state.nextAction = 'Check whether the scene is still working; then run `run-workflow.mjs resume --run ' + runId + '`'
      } else {
        state.blocker = '- step ' + stepNo + ': dispatch failed (exit code ' + rc + ')'
        state.nextAction = 'After fixing, run `run-workflow.mjs resume --run ' + runId + '`'
      }
      writeState(runDir, state)
      console.log('\n✗ Step ' + stepNo + ' did not run ⇒ run stops here (fail-closed); the reason is written out')
      console.log('  Blocker: ' + state.blocker.replace(/^- /, ''))
      process.exit(rc)
    }

    // ── 4. 收回執 + 驗收 + 推進 ──
    if (!exists(receiptOut)) {
      state.status = 'stopped'
      state.blocker = '- step ' + stepNo + ': it claims to have sent it but there is no receipt file'
      state.nextAction = 'manually check the scene status, then resume'
      writeState(runDir, state)
      console.log('\n✗ No receipt file ⇒ run has stopped')
      process.exit(1)
    }
    const accepted = acceptReceipt(runDir, state, wfDoc, steps, receiptOut)
    if (!accepted.ok) {
      console.log('\n✗ Receipt rejected ⇒ run stopped at step' + stepNo)
      process.exit(1)
    }
    if (accepted.gate) {
      console.log('\n⏸ Gate ⇒ auto-advance stops, waiting for confirmation')
      break
    }
    console.log('✓ step ' + stepNo + ' done, entering step ' + state.currentStep)
  }
}

/* ───────────────────────── status ───────────────────────── */

function cmdStatus () {
  const runs = runId ? [runId] : listRuns()
  if (!runs.length) {
    console.log('No runs at all (' + execRoot + '）')
    return
  }
  for (const r of runs) {
    const dir = path.join(execRoot, r)
    const st = readState(dir)
    if (!st) { console.log('\n' + r + ': cannot read state file'); continue }
    console.log('\n■ ' + r + '  [' + st.status + ']')
    console.log('  Workflow: ' + st.workflow + ' Current step: ' + st.currentStep)
    for (const s of st.steps) {
      console.log('    ' + s.index + '. ' + s.scene + '  → ' + s.status + (s.receipt ? '（' + s.receipt + '）' : ''))
    }
    if (st.blocker && st.blocker !== '- none') console.log('  Blocker: ' + st.blocker.replace(/^- /, ''))
  }
}

/* ───────────────────────── Dispatch ───────────────────────── */

switch (cmd) {
  case 'start': cmdStart(); break
  case 'step': cmdStep(); break
  case 'run': cmdRun(); break
  case 'resume': cmdResume(); break
  case 'receipt': cmdReceipt(); break
  case 'status': cmdStatus(); break
  default:
    console.error('Usage: node run-workflow.mjs <start|step|run|receipt|resume|status> --root <workbench-root> [...]')
    process.exit(2)
}

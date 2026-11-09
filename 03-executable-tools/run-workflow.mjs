#!/usr/bin/env node
/**
 * Workflow executor —— makes "a chain of scenes" actually run.
 *
 * Usage:
 *   node run-workflow.mjs start  --root <workbench-root> --workflow <id>   start (preconditions → create the run state)
 *   node run-workflow.mjs step   --root <workbench-root> --run <run-id>    advance to the next hop (produce a dispatch)
 *   node run-workflow.mjs receipt --root <workbench-root> --run <run-id> --receipt <file>  collect a receipt and validate it
 *   node run-workflow.mjs status --root <workbench-root> [--run <run-id>]  show the state
 *
 * Exit codes: 0 = success; 1 = blocked; 2 = usage error / not found
 *
 * ★ This version is the "offline executor": it does not really call the engine, it writes
 *   down what each step should do (the dispatch content, the files to read, the things to
 *   check) and advances the state machine.
 *   That is deliberate: **engine-neutral** — the engine-specific version only has to swap
 *   "produce a dispatch" for "really send it"; the state machine and the acceptance logic
 *   are used as-is.
 *
 * ★ The real value of this tool: it turns "the spec" into "something that blocks you".
 *   If the preconditions fail it refuses to start; if a receipt is not acceptable it refuses
 *   to move on.
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
      // ★ If the writing and the reading differ by a single word, the state silently becomes undefined.
      if (k === 'Current Step' || k === 'currentStep') state.currentStep = Number(v)
      if (k === 'Status' || k === 'status') state.status = v
      if (k === 'Workflow' || k === 'workflow') state.workflow = v
      // ★ The run id / start time must be read back too.
      //   Without these two lines, state.runId becomes undefined the second time the state
      //   file is read, and the dispatch id turns into "dispatch-undefined-stepN-xxxx" — the
      //   dispatch id is ruined, and the receipt claim check becomes useless.
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
 * Check the dispatch immediately after producing it: a dispatch without acceptance
 * criteria fails silently once it is sent.
 * This is the last gate "before sending", far cheaper than "finding it wrong after receiving".
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

  // ★ Preconditions (fail-closed): if any of them fails, refuse to start
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
  writeText(path.join(runDir, rules.carryFile), `# Carry File · ${wf.name}\n\n> The carrier that passes each hop's accumulable artifact down the chain. The next hop's dispatch quotes this content.\n\n## Step 1 Accumulable Artifact\n\n(not executed yet)\n`)

  const state = {
    workflow: wf.name,
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
 * ★ Produce the dispatch file of one step (step and run share the same logic).
 *
 * Why it is factored out: `step` runs one hop by hand, `run` runs one hop in a loop.
 *   If each side had its own producing logic, the dispatch produced by hand and the dispatch
 *   produced automatically could drift apart — and then auto-advance fails at some step with
 *   no reason you can find.
 *
 * @returns {{dispatchPath:string, dispatch:string, dispatchId:string, carried:string}}
 */
function produceStep (runDir, state, wfDoc, steps, step, stepNo) {
  // The accumulable artifact of the previous hop (taken from the carry file)
  let carried = ''
  const carryFile = path.join(runDir, rules.carryFile)
  if (exists(carryFile) && stepNo > 1) {
    const txt = readText(carryFile)
    const re = new RegExp(`## Step ${stepNo - 1} Accumulable Artifact[ \\t]*\\n([\\s\\S]*?)(?=\\n## |$)`)
    const m = txt.match(re)
    if (m) carried = m[1].trim()
  }

  // ★ The dispatch id: the unique identifier of this hop.
  //   The receipt has to report this id, otherwise there is no way to confirm "this reply
  //   answers this dispatch".
  //   Without it, two workflows sending to the same scene at the same time claim each
  //   other's receipts and there is not a single error message.
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

  // ★ Self-check the dispatch right after producing it (the last gate before sending)
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
 * ★ This is something you only discover by actually running it.
 * The original spec only said "stop in place on failure", never "how do you pick it up
 * after fixing it".
 * The first time fail-closed blocked a real run, it was stuck in "stopped" — even a fixed
 * receipt could not be collected.
 * So resume has to exist: it pulls the state back from "stopped" to "running" and collects
 * the receipt of the same hop again.
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
  // ★ Gate passed: skip the current step, continue to the next hop
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
 * ★ Collect a receipt = validate it (fail-closed) + advance (shared by cmdReceipt and run).
 *
 * Why it is factored out: collecting a receipt by hand and collecting it in the loop must be
 *   the **same** logic, otherwise there is a hole of the "by hand it is blocked, in the loop
 *   it is not" kind — which means auto-advance has no guardrail.
 *
 * @returns {{ok:boolean, gate:boolean}}
 */
function acceptReceipt (runDir, state, wfDoc, steps, receiptPath) {
  const stepNo = state.currentStep
  const step = steps[stepNo - 1]
  if (!step) fail('Current step is out of range')

  // ★ Collect a receipt = validate it (fail-closed)
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

  // Save a copy of the receipt
  const saved = path.join(runDir, rules.receiptDir, `receipt-${stepNo}.md`)
  writeText(saved, readText(receiptPath))

  // Write the accumulable artifact into the carry file (the next hop consumes it)
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

  // Is it a gate?
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
 * ★ Auto-advance: a while loop that runs "produce a dispatch → send it → wait for the reply
 *   → collect the receipt → validate it → advance" all in one go.
 *
 * ★ Why the loop lives in the **script** instead of the orchestrating agent polling it:
 *   while waiting, every poll by the agent is one LLM turn (the token cost grows linearly
 *   with time, the context keeps rolling and may get mangled by compression). The LLM does
 *   not take part at all while the script loop waits; it only stops and reports when a human
 *   has to step in (gate / rejection / timeout).
 *
 * ★ The conditions for stopping (each one must state the reason clearly, never stop silently):
 *   ① gate (needsConfirmation: true) → status "waiting-for-gate", wait for a human to resume
 *   ② the scene stayed busy until the timeout → status "stopped (scene busy)", with the rejection reason
 *   ③ the receipt was not acceptable → status "stopped" (the existing fail-closed behaviour)
 *   ④ the receipt looks like a mismatch → status "stopped (receipt mismatch)"
 *   ⑤ no reply before the timeout → status "stopped (timeout)"
 *   ⑥ all steps done → status "completed"
 *
 * Usage:
 *   node run-workflow.mjs run --root <workbench-root> --run <run-id>
 */
function cmdRun () {
  if (!runId) fail('run requires --run <run-id>')
  const runDir = path.join(execRoot, runId)
  if (!exists(runDir)) fail('Cannot find run: ' + runId, 2)

  // Sending a dispatch to a scene needs the engine-side dispatch tool.
  const dispatchTool = getArg('--dispatch-tool') || process.env.DSH_DISPATCH_TOOL ||
    path.join(root, '工具', '派單.mjs')
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

    // ── 1. produce the dispatch ──
    const produced = produceStep(runDir, state, wfDoc, steps, step, stepNo)
    console.log('\n▶ Step ' + stepNo + '/' + steps.length + '（' + step['scene'] + ') dispatch generated')

    // ── 2. send it out + wait for the reply ──
    const receiptOut = path.join(runDir, rules.receiptDir, `receipt-${stepNo}.md`)
    let rc = 0
    let out = ''
    try {
      out = execFileSync(process.execPath, [
        dispatchTool, '送',
        // ★ The flags of the external dispatch tool stay Chinese —— that is the real machine's CLI.
        '--檔', produced.dispatchPath,
        '--回覆輸出', receiptOut,
        '--收件', step['scene'],
        '--等場景秒數', String(maxWaitSec),
      ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      rc = 0
    } catch (e) {
      rc = e.status || 1
      out = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
    }
    for (const line of out.split('\n')) if (line.trim()) console.log('    ' + line)

    // ── 3. send-failure branch: explicit rejection / timeout / mismatch ──
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

    // ── 4. collect the receipt + validate + advance ──
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

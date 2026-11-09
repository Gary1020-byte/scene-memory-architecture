#!/usr/bin/env node
/**
 * Workflow validation — checks that a workflow definition file matches the spec.
 *
 * Usage:
 *   node verify-workflow.mjs --root <workbench-root>             check every workflow
 *   node verify-workflow.mjs --root <workbench-root> --file <id>  check one of them
 *   node verify-workflow.mjs --file <path.yaml>                   check a file directly
 *
 * Exit codes: 0 = all good (warnings allowed); 1 = blocking problems; 2 = no workflow found
 *
 * ★ Design principle: this tool is **read-only** and **depends on no npm packages**.
 *   It parses the restricted YAML subset this project defines (scalars, "- " lists, two
 *   levels of indentation), not general YAML. If a workflow definition grows a more
 *   complicated structure, this tool reports an explicit error instead of guessing.
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadRules, parseYaml, findWorkflowFiles } from './workbench.mjs'

/* ───────────────────────── single source of truth for the rules ───────────────────────── */

const RULES = {
  requiredFields: ['id', 'name', 'version', 'steps'],
  stepRequiredFields: ['scene', 'purpose', 'criteria'],
  optionalFields: ['output', 'needs', 'needsConfirmation'],
  failureStrategyValues: ['stop-and-wait', 'continue', 'rollback'],
  needsConfirmationValues: [true, false, 'true', 'false'],
}

/* ───────────────────────── checks ───────────────────────── */

function checkWorkflow (doc, fileName) {
  const problems = []   // blocking
  const warns = []      // hints only
  const ok = []         // passed

  // ① required fields
  const missingFields = RULES.requiredFields.filter((f) => doc[f] === undefined || doc[f] === '')
  if (missingFields.length) {
    problems.push('missing required fields: ' + missingFields.join(', '))
  } else {
    for (const f of RULES.requiredFields) ok.push('field ' + f)
  }

  // ② steps must be a list
  const steps = doc['steps']
  if (steps !== undefined && !Array.isArray(steps)) {
    problems.push('"steps" must be a list (in YAML it starts with "- ")')
  }

  if (Array.isArray(steps)) {
    if (steps.length === 0) {
      problems.push('"steps" is empty')
    }
    steps.forEach((s, i) => {
      const at = `step${i + 1}`
      if (!s || typeof s !== 'object') {
        problems.push(`${at} is not an item`)
        return
      }
      for (const f of RULES.stepRequiredFields) {
        if (s[f] === undefined || s[f] === '') problems.push(`${at} missing ${f}`)
      }
      // criteria must look verifiable (anything too short is usually fluff)
      if (s['criteria'] && String(s['criteria']).length < 6) {
        warns.push(`${at} criteria is too short, it may not be verifiable`)
      }
      // needsConfirmation value domain
      if (s['needsConfirmation'] !== undefined && !RULES.needsConfirmationValues.includes(s['needsConfirmation'])) {
        problems.push(`${at} needsConfirmation can only be true / false (got: ${JSON.stringify(s['needsConfirmation'])})`)
      }
      // failureStrategy value domain
      if (s['failureStrategy'] !== undefined && !RULES.failureStrategyValues.includes(s['failureStrategy'])) {
        problems.push(`${at} failureStrategy can only be one of: ${RULES.failureStrategyValues.join(' / ')} (got: ${s['failureStrategy']})`)
      }
      // unknown fields
      for (const k of Object.keys(s)) {
        if (![...RULES.stepRequiredFields, ...RULES.optionalFields, 'failureStrategy'].includes(k)) {
          warns.push(`${at} has an unknown field "${k}" (not in the spec ⇒ maybe a typo)`)
        }
      }
    })
    ok.push(`step ${steps.length} `)
  }

  // ③ failure strategy
  if (doc['failureStrategy'] !== undefined) {
    if (!RULES.failureStrategyValues.includes(doc['failureStrategy'])) {
      problems.push(`failureStrategy can only be one of: ${RULES.failureStrategyValues.join(' / ')} (got: ${doc['failureStrategy']})`)
    } else ok.push('failureStrategy')
  }

  // ④ gate statistics (hints only)
  if (Array.isArray(steps)) {
    const gates = steps.filter(s => s && (s['needsConfirmation'] === true || s['needsConfirmation'] === 'true'))
    if (gates.length === 0) {
      warns.push('No gate steps at all (if the whole flow contains an irreversible operation, set at least one)')
    } else if (gates.length === steps.length) {
      warns.push('Every step sets a gate — that degrades the workflow into per-hop manual confirmation')
    } else {
      ok.push(`gate ${gates.length} place(s)`)
    }
  }

  return { problems, warns, ok, fileName }
}

/* ───────────────────────── main flow ───────────────────────── */

function report (res) {
  console.log('\n' + res.fileName)
  if (res.problems.length) {
    console.log('  ✗ Blocked: ')
    for (const p of res.problems) console.log('    · ' + p)
  }
  if (res.warns.length) {
    console.log('  ⚠ Hint: ')
    for (const w of res.warns) console.log('    · ' + w)
  }
  if (!res.problems.length) {
    console.log('  ✓ Passed (' + res.ok.join(' · ') + ')')
  }
}

const args = process.argv.slice(2)
const getArg = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : null
}
const root = getArg('--root')
const fileArg = getArg('--file')

let files = []
if (fileArg && (fileArg.includes('/') || /\.ya?ml$/i.test(fileArg))) {
  // a path was given → check that file directly
  files = [fileArg]
} else {
  if (!root) {
    console.error('Usage: node verify-workflow.mjs --root <workbench-root> [--file <id>]')
    process.exit(2)
  }
  const rules = loadRules(root)
  files = findWorkflowFiles(root, rules)
  if (fileArg) files = files.filter(f => path.basename(f).replace(/\.ya?ml$/, '') === fileArg)
}

if (!files.length) {
  const rules = loadRules(root)
  console.log('Cannot find the workflow definition file (check the path: ' + (root || '.') + '/' + rules.workflowDir + '/)')
  process.exit(2)
}

let bad = 0
for (const f of files) {
  let doc
  try {
    doc = parseYaml(fs.readFileSync(f, 'utf8'))
  } catch (e) {
    console.log('\n' + path.basename(f))
    console.log('  ✗ Blocked: ')
    console.log('    · parse failed: ' + e.message)
    bad++
    continue
  }
  const res = checkWorkflow(doc, path.basename(f))
  report(res)
  if (res.problems.length) bad++
}

console.log('\nChecking ' + files.length + ' workflow definitions')
if (bad) {
  console.log('✗ ' + bad + ' with blocking issues')
  process.exit(1)
}
console.log('✓ All checks passed')

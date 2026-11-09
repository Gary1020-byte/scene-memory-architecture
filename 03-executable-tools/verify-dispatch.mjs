#!/usr/bin/env node
/**
 * Dispatch validation —— checks whether a dispatch file can be sent out.
 *
 * Usage:
 *   node verify-dispatch.mjs --root <workbench-root> --dispatch <dispatch-file>
 *   node verify-dispatch.mjs --root <workbench-root> --scene <scene-name>   check the dispatch of a run
 *
 * Exit codes: 0 = accepted; 1 = blocking problems; 2 = file not found
 *
 * ★ Why this tool is needed:
 *   A dispatch without "Criteria" ⇒ the receipt cannot be judged true or false ⇒ the whole
 *   chain fails silently.
 *   This is the last gate "before sending" —— far cheaper than "finding it wrong after
 *   receiving".
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadRules, parseSections, readText, exists, getArgAny } from './workbench.mjs'

const args = process.argv.slice(2)
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const getArgA = (n) => getArgAny(args, n)

const root = getArg('--root')
const dispatchPath = getArgA('--dispatch')

if (!dispatchPath) {
  console.error('Usage: node verify-dispatch.mjs --root <workbench-root> --dispatch <dispatch-file>')
  process.exit(2)
}
if (!exists(dispatchPath)) {
  console.error('✗ Cannot find dispatch file: ' + dispatchPath)
  process.exit(2)
}

/* ───────────────────────── dispatch format ─────────────────────────
 * The body of a dispatch is "field style", not markdown-section style:
 *
 *   What:
 *     <the action>
 *   Criteria:
 *     <the verifiable completion condition>
 *   Output Location:
 *     <the path>
 *   Needs (the accumulable artifact of the previous hop):   ← optional
 *     <the content>
 *   Receipt Format:
 *     ① ...
 *
 * So it is parsed as "field name + colon + indented content".
 */

/** Get the content lines under a given field */
function fieldLines (text, label) {
  const lines = text.split('\n')
  const out = []
  let inField = false
  for (const raw of lines) {
    const line = raw.trimEnd()
    // The start of a field: the line begins with "label:" and has no leading indentation
    const m = line.match(/^([^\s#][^：:]{0,30})[：:]\s*(.*)$/)
    if (m) {
      const name = m[1].trim()
      if (name === label) {
        inField = true
        if (m[2].trim()) out.push(m[2].trim())
        continue
      }
      // A different field ⇒ this one ends here
      if (inField) break
      continue
    }
    if (inField && line.trim()) out.push(line.trim())
  }
  return out
}

/** Find all the field names */
function fieldNames (text) {
  const names = []
  for (const raw of text.split('\n')) {
    if (raw.trim().startsWith('#')) continue
    const m = raw.match(/^([^\s#][^：:]{0,30})[：:]\s*(.*)$/)
    if (m) names.push(m[1].trim())
  }
  return names
}

const problems = []
const warns = []
const ok = []

const text = readText(dispatchPath)
const names = fieldNames(text)

/* ① required fields */
const rules = loadRules(root)
const REQUIRED = [
  { key: rules.dispatchField_what, hint: 'what to do' },
  { key: rules.dispatchField_criteria, hint: 'what counts as done (verifiable)' },
  { key: rules.dispatchField_output, hint: 'where the output goes' },
  { key: rules.dispatchField_receipt, hint: 'what to reply, and where' },
]

for (const f of REQUIRED) {
  const lines = fieldLines(text, f.key)
  if (!names.includes(f.key)) {
    problems.push('missing required field "' + f.key + '" (' + f.hint + ')')
    continue
  }
  if (lines.length === 0) {
    problems.push('The dispatch field "' + f.key + '" is empty')
  } else {
    ok.push(`${f.key} (${lines.length} line(s))`)
  }
}

/* ② the criteria must look verifiable */
const judge = fieldLines(text, rules.dispatchField_criteria)
if (judge.length) {
  const j = judge.join(' ')
  if (j.length < 6) {
    warns.push('"Criteria" is too short to be verifiable (e.g. "cleaned up" is not a criterion)')
  }
  // common unverifiable words
  const vague = ['cleaned up', 'normal', 'done', 'done', 'handled', 'OK', 'ok了']
  for (const v of vague) {
    if (j.includes(v) && j.length < 20) {
      warns.push(`the criteria contain the vague word "${v}" and are very short ⇒ they may not be mechanically judgeable`)
      break
    }
  }
}

/* ③ the receipt format must mention the three-part contract */
const receipt = fieldLines(text, rules.dispatchField_receipt).join(' ')
if (receipt) {
  for (const k of rules.receiptRequiredSections) {
    if (!receipt.includes(k)) {
      problems.push(`the receipt format does not mention "${k}" (the receipt would be missing that section)`)
    }
  }
  if (receipt.includes('Accumulable Artifact')) ok.push('Receipt format contains the three-part contract')
}

/* ④ gate hints */
if (text.includes('gate')) {
  ok.push('marked as a gate step')
} else {
  const needGate = /irreversible|delete|delet|remove|rm -|publish|deploy|send out|不可逆|刪|刪除|刪檔|rm -|發送|發布/i.test(text)
  if (needGate) {
    warns.push('The content looks like it has an irreversible operation but no gate marker ⇒ consider setting "needsConfirmation"')
  }
}

/* ───────────────────────── output ───────────────────────── */

console.log('\nDispatch validation: ' + path.basename(dispatchPath))
if (ok.length) console.log('  ✓ ' + ok.join(' · '))
if (warns.length) {
  console.log('  ⚠ Hint: ')
  for (const w of warns) console.log('    · ' + w)
}
if (problems.length) {
  console.log('  ✗ Blocked: ')
  for (const p of problems) console.log('    · ' + p)
  console.log('\n✗ Dispatch rejected (a dispatch without acceptance criteria fails silently once sent)')
  process.exit(1)
}
console.log('\n✓ Dispatch accepted')

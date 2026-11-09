#!/usr/bin/env node
/**
 * Receipt validation —— checks that a receipt is worth accepting.
 *
 * Usage:
 *   node verify-receipt.mjs --root <workbench-root> --scene <scene-name> --receipt <receipt-file>
 *
 * Exit codes: 0 = accepted; 1 = blocking problems; 2 = usage error / file not found
 *
 * ★ Why this tool exists:
 *   A receipt without the "Accumulable Artifact" ⇒ this round of work was wasted.
 *   A receipt whose artifact never landed in the scene memory ⇒ nothing was accumulated.
 *   Both are silent failures; this tool makes them loud.
 */
import fs from 'node:fs'
import path from 'node:path'
import { loadRules, parseSections, readText, exists, resolveMemoryRoot } from './workbench.mjs'

const args = process.argv.slice(2)
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }

const root = getArg('--root')
const sceneName = getArg('--scene')
const receiptPath = getArg('--receipt')

if (!root || !sceneName || !receiptPath) {
  console.error('Usage: node verify-receipt.mjs --root <workbench-root> --scene <scene-name> --receipt <receipt-file>')
  process.exit(2)
}
if (!exists(receiptPath)) {
  console.error('✗ Cannot find receipt file: ' + receiptPath)
  process.exit(2)
}

const rules = loadRules(root)
const memRoot = resolveMemoryRoot(root)

/* ───────────────────────── parse ───────────────────────── */

const text = readText(receiptPath)
const sections = parseSections(text)

/* ───────────────────────── checks ───────────────────────── */

const problems = []
const warns = []
const ok = []

/* ① the three required sections */
for (const key of rules.receiptRequiredSections) {
  if (!sections[key]) {
    problems.push(`missing subsection「${key}」 (the receipt is incomplete — this section must be present)`)
  } else {
    ok.push('§ ' + key)
  }
}

/* ② the artifact must have substance */
const artifactLines = (sections[rules.artifactSection] || []).filter(l => !/^（暫無）$/.test(l))
if (sections[rules.artifactSection]) {
  if (!artifactLines.length) {
    problems.push(`the "${rules.artifactSection}" section is empty (an empty artifact means this round of work was wasted)`)
  } else {
    ok.push('artifact lines ' + artifactLines.length)
  }
}

/* ③ the artifact must have landed in the scene memory (or the scene skill) */
const artifactText = artifactLines.join('\n').trim()
if (artifactText) {
  const sceneDir = path.join(memRoot, sceneName)
  const memFile = path.join(sceneDir, rules.memoryFile)
  const skillFile = path.join(sceneDir, rules.skillDir, sceneName, rules.skillFile)
  const memBody = exists(memFile) ? readText(memFile) : ''
  const skillBody = exists(skillFile) ? readText(skillFile) : ''
  const landed = artifactLines.filter(l => {
    const frag = l.replace(/^[-*]\s*/, '').trim()
    return frag && (memBody.includes(frag) || skillBody.includes(frag))
  })
  if (!landed.length) {
    problems.push(
      'the "Accumulable Artifact" was not landed in the scene memory (' +
      path.relative(root, memFile) + ' → "' + rules.accumulationTargetSection + ' Decisions and Pitfalls"), ' +
      'so nothing was accumulated — only writing it in the receipt does not count'
    )
  } else {
    ok.push('artifact landed in the scene memory (' + landed.length + ' line(s))')
  }
}

/* ④ the diff set must not be empty either */
const diffLines = (sections[rules.diffSetSection] || []).filter(l => !/^（暫無）$/.test(l))
if (sections[rules.diffSetSection] && !diffLines.length) {
  warns.push('the "' + rules.diffSetSection + '" section is empty (nothing changed ⇒ was this round really necessary?)')
}

/* ───────────────────────── output ───────────────────────── */

console.log('\nReceipt validation: ' + path.basename(receiptPath))
if (ok.length) console.log('  ✓ ' + ok.join(' · '))
if (warns.length) {
  console.log('  ⚠ Hint: ')
  for (const w of warns) console.log('    · ' + w)
}
if (problems.length) {
  console.log('  ✗ Blocked: ')
  for (const p of problems) console.log('    · ' + p)
  console.log('\n✗ Receipt rejected (a receipt without the accumulable artifact means the round was wasted)')
  process.exit(1)
}
console.log('\n✓ Receipt accepted')

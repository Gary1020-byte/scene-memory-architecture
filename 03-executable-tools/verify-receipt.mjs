#!/usr/bin/env node
/**
 * Receipt validation —— checks whether the receipt really carries the accumulable artifact.
 *
 * Usage:
 *   node verify-receipt.mjs --root <workbench-root> --scene <scene-name> --receipt <receipt-file>
 *   node verify-receipt.mjs --root <workbench-root> --scene <scene-name> --receipt <receipt-file> --accum-file <scene-memory-file>
 *
 * Exit codes: 0 = passed; 1 = blocking problems; 2 = something not found
 *
 * ★ Why this tool exists:
 *   "A receipt without the accumulable artifact ＝ this round of work was wasted" is the red
 *   line of the whole architecture.
 *   A red line that no tool enforces is just a reminder you hope people remember.
 *   This tool turns that red line into an exit code.
 *
 * ★ Two levels of checking:
 *   ① Does the receipt itself carry the three-part contract (Diff Set · Accumulable Artifact ·
 *     Next Handoff)?
 *   ② ★ Did those accumulable artifacts actually land in the scene memory?
 *      —— writing them only in the receipt does not count; they have to be findable in the
 *      scene's §5 Decisions and Pitfalls (or in the dedicated skill).
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  loadRules, resolveMemoryRoot, readText, exists, parseSections, getArgAny } from './workbench.mjs'

const args = process.argv.slice(2)
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const getArgA = (n) => getArgAny(args, n)

const root = getArg('--root')
const sceneName = getArgA('--scene')
const receiptPath = getArgA('--receipt')
const accumPathArg = getArg('--accum-file')

if (!root || !sceneName || !receiptPath) {
  console.error('Usage: node verify-receipt.mjs --root <workbench-root> --scene <scene-name> --receipt <receipt-file> [--accum-file <scene-memory-file>]')
  process.exit(2)
}

const rules = loadRules(root)
const memRoot = resolveMemoryRoot(root, rules)

/* ───────────────────────── find the scene memory file ───────────────────────── */

function resolveAccumFile () {
  if (accumPathArg) return accumPathArg
  const cand = path.join(memRoot, sceneName, rules.memoryFile)
  return exists(cand) ? cand : null
}

/* ───────────────────────── parse the receipt ───────────────────────── */

/**
 * Receipt format (defined by 04-templates/dispatch-template.md):
 *
 *   【<scene-name> · Receipt】
 *
 *   Conclusion: ...
 *   Evidence: ...
 *   Path: ...
 *
 *   ## Diff Set
 *   ...
 *   ## Accumulable Artifact
 *   ...
 *   ## Next Handoff
 *   ...
 *
 * The section parsing goes through the shared module's parseSections (line-by-line scanning,
 * not a regex —— see the explanation in workbench.mjs).
 */
function parseReceipt (text) {
  return { sections: parseSections(text) }
}

/** Get the substantial content lines of a section (dropping blank lines, and lines that are meaningless after the markdown list marker is stripped) */
function contentLines (arr) {
  return (arr || [])
    .map(l => l.replace(/^[-*+]\s*/, '').replace(/^>\s*/, '').trim())
    .filter(l => l.length > 0)
    .filter(l => !/^[-—=─━]{3,}$/.test(l))     // horizontal rule
    .filter(l => !/^待補$/.test(l))
    .filter(l => !/^\(暫無\)$/.test(l))
}

/**
 * Grab the "whole block of raw text" of a section, including the subsections under it.
 * @param {string} text - the whole markdown
 * @param {string} key - the section key (e.g. '§5')
 * @returns {string} all the text of that section, from its heading to the next heading of the same level
 */
export function sectionBlock (text, key) {
  const lines = String(text).split('\n')
  let start = -1
  let level = 0
  for (let i = 0; i < lines.length; i++) {
    const m = /^(\s*)(#{1,6})\s*(.+?)\s*$/.exec(lines[i])
    if (!m) continue
    if (!m[3].includes(key)) continue
    start = i
    level = m[2].length
    break
  }
  if (start < 0) return ''
  const out = []
  // ★ Skip the ``` fenced code blocks: the # headings inside them are example text, not real
  //   section headings; otherwise §5 is cut short and the accumulable artifacts after it
  //   become invisible (a false "did not land").
  let inFence = false
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) { inFence = !inFence; out.push(lines[i]); continue }
    if (inFence) { out.push(lines[i]); continue }
    const m = /^\s*(#{1,6})\s+/.exec(lines[i])
    if (m && m[1].length <= level) break
    out.push(lines[i])
  }
  return out.join('\n')
}

/**
 * Do two texts share a common substring of at least minRun characters?
 * @param {string} a - the first text (whitespace and markdown stripped)
 * @param {string} b - the second text (whitespace and markdown stripped)
 * @param {number} minRun - the length of the shortest common substring
 * @returns {boolean}
 */
export function hasCommonRun (a, b, minRun) {
  if (!a || !b) return false
  if (b.includes(a)) return true
  // slide a window over the shorter one and look for it inside the longer one
  const short = a.length <= b.length ? a : b
  const long = a.length <= b.length ? b : a
  for (let i = 0; i + minRun <= short.length; i++) {
    if (long.includes(short.slice(i, i + minRun))) return true
  }
  return false
}

/* ───────────────────────── main flow ───────────────────────── */

const problems = []
const warns = []
const ok = []

if (!exists(receiptPath)) {
  console.error('✗ Cannot find the receipt file: ' + receiptPath)
  process.exit(2)
}

const receipt = readText(receiptPath)
const { sections } = parseReceipt(receipt)

// ① are all three parts there
for (const key of rules.receiptRequiredSections) {
  const sec = sections[key]
  if (!sec) {
    problems.push(`missing subsection「${key}」 (the receipt is incomplete — this section must be present)`)
    continue
  }
  const lines = contentLines(sec)
  if (lines.length === 0) {
    problems.push(`the subsection「${key}」 is empty`)
  } else {
    ok.push(`section "${key}" (${lines.length} line(s))`)
  }
}

// ② ★ did the accumulable artifact actually land
const accumFile = resolveAccumFile()
if (!accumFile) {
  problems.push(`cannot find the scene memory file (${sceneName}) —— cannot verify whether the accumulable artifact landed`)
} else if (!exists(accumFile)) {
  problems.push('The accumulation file does not exist: ' + accumFile)
} else {
  const accumText = readText(accumFile)
  const accumSections = parseReceipt(accumText).sections
  const landingKey = Object.keys(accumSections).find(k => k.includes(rules.accumulationTargetSection))
  // ★ The landing text has to grab "the whole raw block of §5 (including its ### subsections)".
  //   parseSections is flat (the last heading wins), so a ### subsection under §5 digs the
  //   content out from under §5 ⇒ what was clearly written down gets judged as "not landed".
  const landingText = sectionBlock(accumText, rules.accumulationTargetSection) ||
    (landingKey ? accumSections[landingKey].join('\n') : '')
  // The scene's dedicated skill counts as a landing place too
  const skillDir = path.join(memRoot, sceneName, rules.skillDir)
  let skillText = ''
  if (exists(skillDir)) {
    for (const e of fs.readdirSync(skillDir, { withFileTypes: true })) {
      const sp = path.join(skillDir, e.name, rules.skillFile)
      if (exists(sp)) skillText += '\n' + readText(sp)
    }
  }

  const accumSection = sections[rules.artifactSection] || []
  const accumLines = contentLines(accumSection)

  if (accumLines.length < rules.artifactMinItems) {
    problems.push(`not enough accumulable artifact (at least ${rules.artifactMinItems} item(s), actually ${accumLines.length})`)
  } else {
    // every accumulable artifact has to be findable in the landing section of the scene memory
    // or in the dedicated skill
    const haystack = landingText + '\n' + skillText
    const hay = haystack.replace(/[\s`*_]/g, '')
    // ★ Do NOT compare verbatim: when the scene lands the artifact it may rephrase it or use a
    //   different script (the receipt is simple, the memory is detailed), and a verbatim
    //   comparison judges "it was clearly written down" as "not landed".
    //   Use "a longest common substring ≥ 8 characters" instead —— file paths, commands and
    //   identifiers always reappear, which is enough to prove it really landed, without being
    //   blocked by differences in wording.
    const missed = accumLines.filter(l => {
      const norm = l.replace(/[\s`*_]/g, '')
      if (norm.length < 4) return false
      return !hasCommonRun(norm, hay, 8)
    })
    if (missed.length) {
      for (const m of missed) {
        problems.push(`the accumulable artifact is not landed in the scene memory: ${m.slice(0, 60)}`)
      }
    } else {
      ok.push(`all ${accumLines.length} accumulable artifact(s) landed (${landingKey || 'the dedicated skill'})`)
    }
  }
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

#!/usr/bin/env node
/**
 * Link check —— verifies that all internal markdown links point at existing files.
 * Usage: node check-links.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function walk (dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git') continue
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

let broken = 0
let checked = 0
const files = walk(ROOT)

for (const f of files) {
  const txt = fs.readFileSync(f, 'utf8')
  const rel = path.relative(ROOT, f)
  // a markdown link [text](target)
  const re = /\[[^\]]*\]\(([^)]+)\)/g
  let m
  while ((m = re.exec(txt))) {
    let target = m[1].trim()
    if (target.startsWith('http') || target.startsWith('#') || target.startsWith('mailto:')) continue
    target = target.split('#')[0]
    if (!target) continue
    checked++
    const abs = path.resolve(path.dirname(f), target)
    if (!fs.existsSync(abs)) {
      console.log('✗ ' + rel + '  →  ' + m[1])
      broken++
    }
  }
}

console.log('\nChecking ' + files.length + ' markdown files, ' + checked + ' internal links')
if (broken) {
  console.log('✗ ' + broken + ' broken links')
  process.exit(1)
}
console.log('✓ All links valid')

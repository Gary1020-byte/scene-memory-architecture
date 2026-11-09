// Remove every boundary marker (.git / .git-marker) under a scene directory —— used by the negative acceptance test V9
import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2]
for (const m of ['.git', '.git-marker']) {
  const p = path.join(dir, m)
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}

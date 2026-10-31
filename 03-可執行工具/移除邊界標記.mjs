// 移除場景目錄下的所有邊界標記（.git / .git-marker）—— 反例驗收 V9 用
import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2]
for (const m of ['.git', '.git-marker']) {
  const p = path.join(dir, m)
  if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true })
}

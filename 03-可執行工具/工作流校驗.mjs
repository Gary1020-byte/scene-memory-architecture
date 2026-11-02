#!/usr/bin/env node
/**
 * 工作流校驗 —— 檢查工作流定義檔是否符合規格
 *
 * 用法：
 *   node 工作流校驗.mjs --root <工作台根>            檢查全部工作流
 *   node 工作流校驗.mjs --root <工作台根> --檔 <id>  只檢查某一份
 *   node 工作流校驗.mjs --檔 <path.yaml>             直接檢查一個檔案
 *
 * 退出碼：0 = 全過（或只有警告）；1 = 有阻擋項；2 = 找不到工作流
 *
 * ★ 設計原則：這支工具**只讀不寫**，且**不依賴任何 npm 套件**。
 *   它解析的是本專案定義的那個受限 YAML 子集（純量、- 清單、兩層縮排），
 *   不是通用 YAML。若工作流定義長出更複雜的結構，這支工具會明確報錯而不是猜。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

/* ───────────────────────── 規則單一來源 ───────────────────────── */

const RULES = {
  必要欄位: ['id', '名稱', '版本', '步驟'],
  步驟必要欄位: ['場景', '目的', '判據'],
  可選欄位: ['落盤', '需要', '需確認'],
  失敗策略合法值: ['停在原地等人', '繼續', '回滾'],
  需確認合法值: [true, false, 'true', 'false'],
  執行層目錄: '執行',
  工作流目錄: '工作流',
}

/* ───────────────────────── 受限 YAML 解析 ───────────────────────── */

/**
 * 只支援本專案需要的子集：
 *   key: value
 *   key:
 *   - item
 *   - key: value
 *     key2: value
 * 出現任何無法判定的行就丟錯 —— 寧可報「看不懂」，也不要默默猜錯。
 */
function parseYaml (text) {
  const lines = text.split('\n')
  const root = {}

  // 以「縮排深度」追蹤目前在寫哪個容器：
  //   root            → 頂層物件
  //   listCtx         → 某個 key 底下的清單（listCtx.key 是清單名）
  //   itemCtx         → 清單裡的某個項目物件
  let listCtx = null    // { key, arr, indent }
  let itemCtx = null    // { obj, indent }

  const resetToRoot = () => { listCtx = null; itemCtx = null }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    if (raw.includes('\t')) {
      throw new Error(`第 ${i + 1} 行含 tab（本工具只用空格縮排）：${raw.trim()}`)
    }
    const cur = raw.match(/^(\s*)/)[0].length
    const body = raw.trim()

    // ── 清單項目：- key: value / - 純量 ──
    if (body.startsWith('- ')) {
      if (!listCtx) throw new Error(`第 ${i + 1} 行是清單項目，但沒有對應的 key：${body}`)
      const val = body.slice(2).trim()
      const obj = {}
      listCtx.arr.push(obj)
      itemCtx = { obj, indent: cur }
      const m = val.match(/^([^:]+):(.*)$/)
      if (m) obj[m[1].trim()] = parseScalar(m[2].trim())
      else obj.__value = parseScalar(val)
      continue
    }

    const m = body.match(/^([^:]+):(.*)$/)
    if (!m) throw new Error(`第 ${i + 1} 行看不懂：${body}`)
    const key = m[1].trim()
    const val = m[2].trim()

    // ── 巢狀於清單項目裡的 key（縮排比項目深）──
    if (itemCtx && cur > itemCtx.indent) {
      itemCtx.obj[key] = val === '' ? '' : parseScalar(val)
      continue
    }

    // ── 回到頂層或新的 key ──
    if (itemCtx && cur <= itemCtx.indent) {
      // 離開項目，但可能仍在清單裡（下一行是 - ）→ 由後續行決定
      itemCtx = null
    }

    if (val === '') {
      const next = nextMeaningful(lines, i + 1)
      if (next && next.trim().startsWith('- ')) {
        const arr = []
        root[key] = arr
        listCtx = { key, arr, indent: cur }
        itemCtx = null
        continue
      }
      root[key] = ''
      resetToRoot()
      continue
    }

    root[key] = parseScalar(val)
    listCtx = null
    itemCtx = null
  }
  return root
}

function nextMeaningful (lines, from) {
  for (let i = from; i < lines.length; i++) {
    const t = lines[i].trim()
    if (t && !t.startsWith('#')) return t
  }
  return null
}

function parseScalar (v) {
  if (v === 'true') return true
  if (v === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v)
  return v.replace(/^["']|["']$/g, '')
}

/* ───────────────────────── 檢查 ───────────────────────── */

function checkWorkflow (doc, fileName) {
  const problems = []   // 擋
  const warns = []      // 只提示
  const ok = []         // 通過

  // ① 必要欄位
  for (const f of RULES.必要欄位) {
    if (doc[f] === undefined || doc[f] === '') problems.push(`缺必要欄位「${f}」`)
    else ok.push(`欄位 ${f}`)
  }

  // ② 步驟必須是清單
  const steps = doc['步驟']
  if (steps !== undefined && !Array.isArray(steps)) {
    problems.push('「步驟」必須是清單（YAML 裡用 "- " 開頭）')
  }

  if (Array.isArray(steps)) {
    if (steps.length === 0) {
      problems.push('「步驟」是空的')
    }
    steps.forEach((s, i) => {
      const at = `步驤${i + 1}`.replace('步驤', '步驟')
      if (!s || typeof s !== 'object') {
        problems.push(`${at} 不是一個項目`)
        return
      }
      for (const f of RULES.步驟必要欄位) {
        if (s[f] === undefined || s[f] === '') problems.push(`${at} 缺「${f}」`)
      }
      // 判準必須看起來像可驗證的（太短的多半是廢話）
      if (s['判據'] && String(s['判據']).length < 6) {
        warns.push(`${at} 的「判據」太短，可能不可驗證`)
      }
      // 需確認值域
      if (s['需確認'] !== undefined && !RULES.需確認合法值.includes(s['需確認'])) {
        problems.push(`${at} 的「需確認」只能是 true / false（收到：${JSON.stringify(s['需確認'])}）`)
      }
      // 未知欄位
      for (const k of Object.keys(s)) {
        if (![...RULES.步驟必要欄位, ...RULES.可選欄位].includes(k)) {
          warns.push(`${at} 有未知欄位「${k}」（規格裡沒有 ⇒ 可能打錯字）`)
        }
      }
    })
    ok.push(`步驟 ${steps.length} 個`)
  }

  // ③ 失敗策略
  if (doc['失敗策略'] !== undefined) {
    if (!RULES.失敗策略合法值.includes(doc['失敗策略'])) {
      problems.push(`「失敗策略」只能是：${RULES.失敗策略合法值.join(' / ')}（收到：${doc['失敗策略']}）`)
    } else ok.push('失敗策略')
  }

  // ④ 門檻統計（只提示）
  if (Array.isArray(steps)) {
    const gates = steps.filter(s => s && (s['需確認'] === true || s['需確認'] === 'true'))
    if (gates.length === 0) {
      warns.push('沒有任何門檻步驟（若整條流程含不可逆操作，應至少設一道）')
    } else if (gates.length === steps.length) {
      warns.push('每一步都設了門檻 —— 這會讓工作流退化成逐跳人工確認')
    } else {
      ok.push(`門檻 ${gates.length} 處`)
    }
  }

  return { problems, warns, ok, fileName }
}

/* ───────────────────────── 主流程 ───────────────────────── */

function findWorkflowFiles (root) {
  const out = []
  const candidates = [
    path.join(root, RULES.工作流目錄),
    path.join(root, '場景', '_共享記憶', RULES.工作流目錄),
    path.join(root, '共享', RULES.工作流目錄),
  ]
  for (const d of candidates) {
    if (!fs.existsSync(d)) continue
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isFile() && /\.ya?ml$/.test(e.name)) out.push(path.join(d, e.name))
    }
  }
  return out
}

function report (res) {
  console.log('\n' + res.fileName)
  if (res.problems.length) {
    console.log('  ✗ 阻擋：')
    for (const p of res.problems) console.log('    · ' + p)
  }
  if (res.warns.length) {
    console.log('  ⚠ 提示：')
    for (const w of res.warns) console.log('    · ' + w)
  }
  if (!res.problems.length) {
    console.log('  ✓ 通過（' + res.ok.join(' · ') + '）')
  }
}

const args = process.argv.slice(2)
const getArg = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : null
}
const root = getArg('--root')
const only = getArg('--檔')
const direct = getArg('--檔案')

let files = []
if (direct) {
  files = [direct]
} else {
  if (!root) {
    console.error('用法：node 工作流校驗.mjs --root <工作台根> [--檔 <id>]')
    process.exit(2)
  }
  files = findWorkflowFiles(root)
  if (only) files = files.filter(f => path.basename(f).replace(/\.ya?ml$/, '') === only)
}

if (!files.length) {
  console.log('找不到工作流定義檔（檢查路徑：' + (root || '.') + '/' + RULES.工作流目錄 + '/）')
  process.exit(2)
}

let bad = 0
for (const f of files) {
  let doc
  try {
    doc = parseYaml(fs.readFileSync(f, 'utf8'))
  } catch (e) {
    console.log('\n' + path.basename(f))
    console.log('  ✗ 阻擋：')
    console.log('    · 解析失敗：' + e.message)
    bad++
    continue
  }
  const res = checkWorkflow(doc, path.basename(f))
  report(res)
  if (res.problems.length) bad++
}

console.log('\n檢查 ' + files.length + ' 份工作流定義')
if (bad) {
  console.log('✗ ' + bad + ' 份有阻擋項')
  process.exit(1)
}
console.log('✓ 全部通過')

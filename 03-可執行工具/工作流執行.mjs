#!/usr/bin/env node
/**
 * 工作流執行器 —— 讓「場景串成一條線」真的跑起來
 *
 * 用法：
 *   node 工作流執行.mjs start  --root <工作台根> --工作流 <id>   啟動（預檢 → 建 run 狀態）
 *   node 工作流執行.mjs step   --root <工作台根> --run <run-id>  推進下一跳（開派單）
 *   node 工作流執行.mjs 回執   --root <工作台根> --run <run-id> --回執 <檔>  收回執並驗收
 *   node 工作流執行.mjs status --root <工作台根> [--run <run-id>]  看狀態
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
} from './工作台.mjs'

const args = process.argv.slice(2)
const getArg = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null }
const cmd = args[0]

const root = getArg('--root')
const wfId = getArg('--工作流')
const runId = getArg('--run')
const receiptArg = getArg('--回執')

if (!root) {
  console.error('用法：node 工作流執行.mjs <start|step|回執|status> --root <工作台根> [...]')
  process.exit(2)
}

const rules = loadRules(root)
const memRoot = resolveMemoryRoot(root)
const execRoot = resolveExecRoot(root)
const wfDir = resolveWorkflowDir(root)

/* ───────────────────────── 工具 ───────────────────────── */

function fail (msg, code = 1) {
  console.error('✗ ' + msg)
  process.exit(code)
}

function loadWorkflow (id) {
  if (!exists(wfDir)) fail('找不到工作流目錄：' + wfDir, 2)
  const files = fs.readdirSync(wfDir).filter(f => /\.ya?ml$/.test(f))
  const hit = files.find(f => f.replace(/\.ya?ml$/, '') === id)
  if (!hit) fail('找不到工作流：' + id + '（有：' + files.join(', ') + '）', 2)
  const p = path.join(wfDir, hit)
  let doc
  try {
    doc = parseYaml(readText(p))
  } catch (e) {
    fail('工作流解析失敗：' + e.message)
  }
  return { path: p, name: hit.replace(/\.ya?ml$/, ''), doc }
}

function stepsOf (doc) {
  return Array.isArray(doc['步驟']) ? doc['步驟'] : []
}

function readState (runDir) {
  const p = path.join(runDir, rules.執行狀態檔名)
  if (!exists(p)) return null
  const lines = readText(p).split('\n')
  const state = { 步驤: [] }
  let inTable = false
  for (const raw of lines) {
    const line = raw.trim()
    const m = line.match(/^-\s*([^：:]+)[：:]\s*(.*)$/)
    if (m) {
      const k = m[1].trim()
      const v = m[2].trim()
      if (k === '目前步驟') state.目前步驤 = Number(v)
      if (k === '狀態') state.狀態 = v
      if (k === '工作流') state.工作流 = v
      continue
    }
    if (line.startsWith('|')) {
      const cells = line.split('|').map(c => c.trim()).filter(c => c !== '')
      if (cells.length >= 4 && /^\d+$/.test(cells[0])) {
        state.步驤.push({ 序號: Number(cells[0]), 場景: cells[1], 狀態: cells[2], 回執: cells[3] })
        inTable = true
        continue
      }
      if (inTable && /^\|?\s*---/.test(line)) continue
    }
  }
  return state
}

function writeState (runDir, state) {
  const rows = state.步驤.map(s => `| ${s.序號} | ${s.場景} | ${s.狀態} | ${s.回執 || '—'} |`).join('\n')
  const body = `# 執行狀態 · ${state.工作流}

> 這份檔案是**這一次執行**的私有狀態（不是計畫）。工作流定義在共享層。
> 中途關掉、當機、換人接手 ⇒ 靠這份檔案接得上。

- 工作流：${state.工作流}
- run id：${state.runId}
- 啟動時間：${state.啟動時間}
- 更新時間：${now()}
- 狀態：${state.狀態}
- 目前步驟：${state.目前步驤}

## 步驟進度

| # | 場景 | 狀態 | 回執 |
|---|---|---|---|
${rows}

## 卡點

${state.卡點 || '- 無'}

## 下一個動作

${state.下一個動作 || '- （無）'}
`
  writeText(path.join(runDir, rules.執行狀態檔名), body)
}

function listRuns () {
  if (!exists(execRoot)) return []
  return fs.readdirSync(execRoot, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => e.name)
}

/* ───────────────────────── 派單自檢 ───────────────────────── */

/**
 * 產生派單後立刻檢查：缺判據的派單送出去會靜默失效。
 * 這是「送出之前」的最後一道閘，比「收到之後才發現不對」便宜得多。
 */
function checkDispatch (p) {
  try {
    execFileSync(process.execPath, [
      path.join(path.dirname(fileURLToPath(import.meta.url)), '派單校驗.mjs'),
      '--root', root, '--派單', p,
    ], { stdio: 'pipe' })
    return { ok: true, problems: [] }
  } catch (e) {
    const out = (e.stdout ? e.stdout.toString() : '') + (e.stderr ? e.stderr.toString() : '')
    const problems = out.split('\n')
      .filter(l => l.trim().startsWith('· '))
      .map(l => l.trim().slice(2))
    return { ok: false, problems: problems.length ? problems : ['派單校驗失敗（exit ' + (e.status || '?') + '）'] }
  }
}

/* ───────────────────────── start ───────────────────────── */

function cmdStart () {
  if (!wfId) fail('start 需要 --工作流 <id>')
  const wf = loadWorkflow(wfId)
  const steps = stepsOf(wf.doc)

  // ★ 預檢（fail-closed）：任一不過就拒絕啟動
  const problems = []
  if (!wf.doc['id']) problems.push('工作流缺 id')
  if (!wf.doc['版本']) problems.push('工作流缺版本')
  if (!steps.length) problems.push('工作流沒有步驟')
  steps.forEach((s, i) => {
    for (const f of ['場景', '目的', '判據']) {
      if (!s || !s[f]) problems.push(`步驟${i + 1} 缺「${f}」`)
    }
    if (s && s['場景']) {
      const dir = path.join(memRoot, s['場景'])
      if (!exists(dir)) {
        problems.push(`步驟${i + 1} 的場景「${s['場景']}」不存在（${dir}）`)
      } else {
        const mark = rules.邊界標記檔名
        const alt = rules.邊界標記替代檔名
        if (!exists(path.join(dir, mark)) && !exists(path.join(dir, alt))) {
          problems.push(`步驟${i + 1} 的場景「${s['場景']}」缺邊界標記（${mark}）`)
        }
      }
    }
  })
  if (problems.length) {
    console.log('\n✗ 預檢不通過，拒絕啟動：')
    for (const p of problems) console.log('  · ' + p)
    process.exit(1)
  }

  const id = `${wf.name}-${today()}-${String(Date.now()).slice(-6)}`
  const runDir = path.join(execRoot, id)
  writeText(path.join(runDir, '工作流.yaml'), readText(wf.path))
  writeText(path.join(runDir, rules.交接串檔名), `# 交接串 · ${wf.name}\n\n> 每一跳的可累積物往下傳的載體。下一跳的派單會引用這裡的內容。\n\n## 步驟 1 的可累積物\n\n（尚未執行）\n`)

  const state = {
    工作流: wf.name,
    runId: id,
    啟動時間: now(),
    狀態: '執行中',
    目前步驤: 1,
    卡點: '- 無',
    下一個動作: `跑 \`工作流執行.mjs step --run ${id}\` 產生步驟1 的派單`,
    步驤: steps.map((s, i) => ({ 序號: i + 1, 場景: s['場景'], 狀態: '待執行', 回執: '' })),
  }
  writeState(runDir, state)

  console.log('\n✓ 預檢通過，工作流已啟動')
  console.log('  run id：' + id)
  console.log('  步驟數：' + steps.length)
  console.log('  狀態檔：' + path.join(runDir, rules.執行狀態檔名))
  console.log('\n下一步：node 工作流執行.mjs step --root <工作台根> --run ' + id)
}

/* ───────────────────────── step ───────────────────────── */

function cmdStep () {
  if (!runId) fail('step 需要 --run <run-id>')
  const runDir = path.join(execRoot, runId)
  if (!exists(runDir)) fail('找不到 run：' + runId, 2)
  const state = readState(runDir)
  if (!state) fail('run 狀態檔讀不到：' + path.join(runDir, rules.執行狀態檔名))
  if (state.狀態 !== '執行中') fail(`run 狀態是「${state.狀態}」，不能繼續推進`)

  const wfDoc = parseYaml(readText(path.join(runDir, '工作流.yaml')))
  const steps = stepsOf(wfDoc)
  const idx = state.目前步驤 - 1
  if (idx < 0 || idx >= steps.length) {
    state.狀態 = '已完成'
    state.目前步驤 = steps.length
    writeState(runDir, state)
    console.log('\n✓ 工作流已跑完所有步驟')
    return
  }
  const step = steps[idx]
  const stepNo = idx + 1

  // 上一跳的可累積物（從交接串取）
  let carried = ''
  const carryFile = path.join(runDir, rules.交接串檔名)
  if (exists(carryFile) && stepNo > 1) {
    const txt = readText(carryFile)
    const re = new RegExp(`## 步驟 ${stepNo - 1} 的可累積物[ \\t]*\\n([\\s\\S]*?)(?=\\n## |$)`)
    const m = txt.match(re)
    if (m) carried = m[1].trim()
  }

  // 產生派單檔
  const dispatch = `# 派單 · ${wfDoc['名稱'] || '工作流'} · 步驟${stepNo}/${steps.length}

【${step['場景']} · 派單 · 請回執】

做什麼：
  ${step['目的']}

判據：
  ${step['判據']}
${step['落盤'] ? `\n落盤位置：\n  ${step['落盤']}\n` : ''}${carried ? `\n需要（上一跳的可累積物）：\n${carried}\n` : ''}
回執方式：
  ① 結論 + 證據 + 路徑
  ② 必須帶「${rules.差異集合小節}」
  ③ 必須帶「${rules.可累積物小節}」★ 少了這條＝這次活白做
  ④ 必須寫明「${rules.下一棒小節}」
${step['需確認'] === true || step['需確認'] === 'true' ? '\n⚠ 本步是門檻：做完要停下等人確認，不會自動接下一跳。\n' : ''}
`
  const dispatchPath = path.join(runDir, rules.回執目錄, `派單-${stepNo}.md`)
  writeText(dispatchPath, dispatch)

  // ★ 產生派單後立刻自檢（送出之前的最後一道閘）
  const dispatchCheck = checkDispatch(dispatchPath)
  if (!dispatchCheck.ok) {
    console.log('\n✗ 產生的派單不合格：')
    for (const p2 of dispatchCheck.problems) console.log('  · ' + p2)
    console.log('  （派單已寫入 ' + dispatchPath + '，但不要送出去）')
  }

  const st = state.步驤.find(s => s.序號 === stepNo)
  if (st) st.狀態 = '執行中'
  state.下一個動作 = `把派單交給「${step['場景']}」，收回執後跑 \`工作流執行.mjs 回執 --run ${runId} --回執 <檔>\``
  writeState(runDir, state)

  console.log('\n▶ 步驟' + stepNo + '/' + steps.length + ' 派單已產生')
  console.log('  場景：' + step['場景'])
  console.log('  派單檔：' + dispatchPath)
  if (carried) console.log('  已帶入上一跳的可累積物（' + carried.split('\n').length + ' 行）')
  if (step['需確認'] === true || step['需確認'] === 'true') console.log('  ⚠ 本步是門檻，收完回執會停下等人')
  console.log('\n派單內容：\n' + dispatch)
}

/* ───────────────────────── resume ───────────────────────── */

/**
 * ★ 這是實跑之後才發現要的東西。
 * 原規格只寫「失敗就地停」，沒寫「修好之後怎麼接回去」。
 * 實跑第一次被 fail-closed 擋下時，就卡死在「已停」——修好回執也收不進去。
 * 所以必須有 resume：把狀態從「已停」拉回「執行中」，重收同一跳的回執。
 */
function cmdResume () {
  if (!runId) fail('resume 需要 --run <run-id>')
  const runDir = path.join(execRoot, runId)
  if (!exists(runDir)) fail('找不到 run：' + runId, 2)
  const state = readState(runDir)
  if (!state) fail('run 狀態檔讀不到')
  if (state.狀態 === '執行中') {
    console.log('\n· run 已經在「執行中」，不需 resume')
    return
  }
  // ★ 門檻通過：跳過目前這一步，繼續下一跳
  if (getArg('--門檻通過') !== null) {
    const wfDoc0 = parseYaml(readText(path.join(runDir, '工作流.yaml')))
    const steps0 = stepsOf(wfDoc0)
    const stepNo0 = state.目前步驤
    state.目前步驤 = stepNo0 + 1
    state.狀態 = state.目前步驤 > steps0.length ? '已完成' : '執行中'
    state.卡點 = '- 無'
    state.下一個動作 = state.狀態 === '已完成'
      ? '- （已完成）'
      : '跑 `工作流執行.mjs step --run ' + runId + '` 產生步驟' + state.目前步驤 + ' 的派單'
    writeState(runDir, state)
    console.log('\n✓ 門檻已確認通過，run 前進到步驟' + state.目前步驤 + '（狀態：' + state.狀態 + '）')
    return
  }
  const wfDoc = parseYaml(readText(path.join(runDir, '工作流.yaml')))
  const steps = stepsOf(wfDoc)
  const stepNo = state.目前步驤
  const step = steps[stepNo - 1]
  if (!step) fail('目前步驟超出範圍')

  state.狀態 = '執行中'
  state.卡點 = '- 無'
  state.下一個動作 = '重收步驟' + stepNo + ' 的回執：`工作流執行.mjs 回執 --run ' + runId + ' --回執 <檔>`'
  writeState(runDir, state)
  console.log('\n✓ run 已從「' + '已停' + '」拉回「執行中」')
  console.log('  重收步驟' + stepNo + '（' + step['場景'] + '）的回執')
}

/* ───────────────────────── 回執 ───────────────────────── */

function cmdReceipt () {
  if (!runId) fail('回執 需要 --run <run-id>')
  if (!receiptArg) fail('回執 需要 --回執 <檔>')
  const runDir = path.join(execRoot, runId)
  if (!exists(runDir)) fail('找不到 run：' + runId, 2)
  const state = readState(runDir)
  if (!state) fail('run 狀態檔讀不到')
  if (state.狀態 !== '執行中') fail(`run 狀態是「${state.狀態}」，不能收回執`)

  const wfDoc = parseYaml(readText(path.join(runDir, '工作流.yaml')))
  const steps = stepsOf(wfDoc)
  const stepNo = state.目前步驤
  const step = steps[stepNo - 1]
  if (!step) fail('目前步驤超出範圍')

  // ★ 收回執 = 驗收（fail-closed）
  const receiptPath = path.resolve(receiptArg)
  let rc = 0
  try {
    execFileSync(process.execPath, [
      path.join(path.dirname(fileURLToPath(import.meta.url)), '回執校驗.mjs'),
      '--root', root,
      '--場景', step['場景'],
      '--回執', receiptPath,
    ], { stdio: 'inherit' })
  } catch (e) {
    rc = e.status || 1
  }
  if (rc !== 0) {
    state.狀態 = '已停'
    state.卡點 = `- 步驟${stepNo} 回執不合格（見上）`
    state.下一個動作 = '修好回執（補可累積物）後重收'
    writeState(runDir, state)
    console.log('\n✗ 回執不合格 ⇒ run 已停在步驟' + stepNo + '（fail-closed）')
    process.exit(1)
  }

  // 存回執副本
  const saved = path.join(runDir, rules.回執目錄, `回執-${stepNo}.md`)
  writeText(saved, readText(receiptPath))

  // 可累積物寫進交接串（下一跳要吃）
  const carryText = readText(receiptPath)
  const carriedLines = sectionLines(carryText, rules.可累積物小節)
  const carried = carriedLines.length
    ? carriedLines.join('\n')
    : '（回執未提供可累積物段落——但回執校驗已擋下，這是保險）'
  const carryFile = path.join(runDir, rules.交接串檔名)
  let carryBody = exists(carryFile) ? readText(carryFile) : `# 交接串 · ${wfDoc['名稱']}\n\n`
  carryBody = carryBody.replace(
    new RegExp(`## 步驟 ${stepNo} 的可累積物[ \\t]*\\n[\\s\\S]*?(?=\\n## |$)`),
    `## 步驟 ${stepNo} 的可累積物\n\n${carried}\n`
  )
  if (!carryBody.includes(`## 步驟 ${stepNo} 的可累積物`)) {
    carryBody += `\n## 步驟 ${stepNo} 的可累積物\n\n${carried}\n`
  }
  writeText(carryFile, carryBody)

  const st = state.步驤.find(s => s.序號 === stepNo)
  if (st) { st.狀態 = '已完成'; st.回執 = path.basename(saved) }

  // 門檻？
  const isGate = step['需確認'] === true || step['需確認'] === 'true'
  if (isGate) {
    state.狀態 = '等門檻'
    state.下一個動作 = '★ 門檻：請人確認後跑 `工作流執行.mjs resume --run ' + runId + ' --門檻通過`'
    state.卡點 = `- 步驟${stepNo} 是門檻，等人確認`
    writeState(runDir, state)
    console.log('\n✓ 回執合格，但本步是門檻 ⇒ run 停在步驟' + stepNo + '，等人確認')
    console.log('  確認後：跑 `工作流執行.mjs resume --run ' + runId + ' --門檻通過`')
    return
  }

  state.目前步驤 = stepNo + 1
  if (stepNo >= steps.length) {
    state.狀態 = '已完成'
    state.下一個動作 = '- （已完成）'
  } else {
    state.下一個動作 = `跑 \`工作流執行.mjs step --run ${runId}\` 產生步驟${stepNo + 1} 的派單`
  }
  writeState(runDir, state)
  console.log('\n✓ 回執合格，run 前進到步驟' + state.目前步驤 + (state.狀態 === '已完成' ? '（全部完成）' : ''))
}

/* ───────────────────────── status ───────────────────────── */

function cmdStatus () {
  const runs = runId ? [runId] : listRuns()
  if (!runs.length) {
    console.log('沒有任何 run（' + execRoot + '）')
    return
  }
  for (const r of runs) {
    const dir = path.join(execRoot, r)
    const st = readState(dir)
    if (!st) { console.log('\n' + r + '：狀態檔讀不到'); continue }
    console.log('\n■ ' + r + '  [' + st.狀態 + ']')
    console.log('  工作流：' + st.工作流 + '　目前步驟：' + st.目前步驤)
    for (const s of st.步驤) {
      console.log('    ' + s.序號 + '. ' + s.場景 + '  → ' + s.狀態 + (s.回執 ? '（' + s.回執 + '）' : ''))
    }
    if (st.卡點 && st.卡點 !== '- 無') console.log('  卡點：' + st.卡點.replace(/^- /, ''))
  }
}

/* ───────────────────────── 分派 ───────────────────────── */

switch (cmd) {
  case 'start': cmdStart(); break
  case 'step': cmdStep(); break
  case 'resume': cmdResume(); break
  case '回執': cmdReceipt(); break
  case 'status': cmdStatus(); break
  default:
    console.error('用法：node 工作流執行.mjs <start|step|回執|resume|status> --root <工作台根> [...]')
    process.exit(2)
}

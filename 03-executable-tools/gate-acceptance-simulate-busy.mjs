#!/usr/bin/env node
/**
 * 守門驗收-造忙碌 —— 讓某個場景 session 處於 running=true（用來測「場景忙會被擋」）
 *
 * 用法：
 *   node gate-acceptance-simulate-busy.mjs <sessionId> ["instruction for the scene"]
 *
 * ★ 為什麼需要：引擎沒有「忙就拒收」的開關，要驗證「忙 ⇒ 明確拒絕」，
 *   就得真的讓那個場景處於忙碌狀態。這個工具直接對 session 送一個
 *   會佔用一點時間的 prompt（建議 bash sleep），再用 session/list 的
 *   running 旗標確認它真的忙起來了。
 */
import { execFileSync } from 'node:child_process'

const sid = process.argv[2]
if (!sid) {
  console.error('用法：node gate-acceptance-simulate-busy.mjs <sessionId> ["指令"]')
  process.exit(2)
}
const text = process.argv[3] || '請用 bash 執行 sleep 90，然後回覆「長任務done」。'

function findToken () {
  if (process.env.DSH_TOKEN) return process.env.DSH_TOKEN
  try {
    const out = execFileSync('journalctl', ['--user', '-u', 'dsh-web', '-n', '80', '--no-pager'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const m = [...out.matchAll(/token=([A-Za-z0-9_\-]{16,})/g)]
    if (m.length) return m[m.length - 1][1]
  } catch { /* 沒 journal */ }
  return ''
}

const BASE = process.env.DSH_GUI_BASE || 'http://127.0.0.1:3080'
let cookie = ''
async function auth () {
  if (cookie) return
  const r = await fetch(BASE + '/?token=' + findToken(), { redirect: 'manual' })
  const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : []
  cookie = sc.map(c => c.split(';')[0]).join('; ')
}

async function rpc (method, args) {
  await auth()
  const r = await fetch(BASE + '/api/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ type: 'client-request', rpcId: 'r1', method, payload: { args } }),
  })
  const j = await r.json()
  if (!j.result || !j.result.ok) throw new Error(method + ' failed: ' + JSON.stringify(j.result && j.result.error))
  return j.result.value
}

const ack = await rpc('session/prompt', {
  request: {
    requestId: 'make-busy-' + Date.now(),
    sessionId: sid,
    mode: 'queue',
    content: [{ type: 'text', text }],
  },
})
console.log('prompt sent: ', JSON.stringify(ack).slice(0, 80))

await new Promise(r => setTimeout(r, 3000))
const l = await rpc('session/list', { _request: {} })
const it = (l.items || []).find(s => s.sessionId === sid)
console.log('running =', it ? it.running : '(session is not in the list)')
if (!it || !it.running) process.exit(1)

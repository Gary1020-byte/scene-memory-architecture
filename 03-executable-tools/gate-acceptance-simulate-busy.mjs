#!/usr/bin/env node
/**
 * Gate acceptance — simulate a busy scene: put a scene session into running=true
 * (used to test "a busy scene gets blocked").
 *
 * Usage:
 *   node gate-acceptance-simulate-busy.mjs <sessionId> ["instruction for the scene"]
 *
 * ★ Why it is needed: the engine has no "reject while busy" switch, so verifying
 *   "busy ⇒ explicit rejection" requires really making that scene busy. This tool sends the
 *   session a prompt that takes a little while (a bash sleep is recommended), then uses the
 *   running flag of session/list to confirm it really is busy.
 */
import { execFileSync } from 'node:child_process'

const sid = process.argv[2]
if (!sid) {
  console.error('Usage: node gate-acceptance-simulate-busy.mjs <sessionId> ["instruction"]')
  process.exit(2)
}
const text = process.argv[3] || 'Please run "sleep 90" with bash, then reply "long task done".'

function findToken () {
  if (process.env.DSH_TOKEN) return process.env.DSH_TOKEN
  try {
    const out = execFileSync('journalctl', ['--user', '-u', 'dsh-web', '-n', '80', '--no-pager'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const m = [...out.matchAll(/token=([A-Za-z0-9_\-]{16,})/g)]
    if (m.length) return m[m.length - 1][1]
  } catch { /* no journal */ }
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

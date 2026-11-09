# 4 · Dispatch and Receipt —— how work goes out, how the accumulation comes back

> "Dispatch" sounds simple: throw a sentence at some agent.
> The hard part is **coming back**——**how do you know the other side really did it, instead of saying it did.**
>
> And there is something harder still: **how do you turn the work you just finished into the starting point of the next one.**

---

## 1. First, to be clear: a dispatch is not an announcement

| | Announcement | Dispatch |
|---|---|---|
| Expectation | "Everyone have a look" | "You do this thing, then give me a receipt" |
| End condition | None | **One receipt** |
| Who follows up | Nobody | Whoever dispatched it |

> **One dispatch ＝ one receipt.** A dispatch without a receipt is a dispatch that never happened.
> "Work finished but the other side does not know" ＝ **not finished**.

---

## 2. The dispatch four-part set

Any dispatch must state four things. Missing one turns it into "done but nobody knows":

```
What · Criteria · Output Location · Receipt Format
```

| Part | What to write | A bad example | A good example |
|---|---|---|---|
| **What** | A one-line action | "Tidy up the disk" | "Produce a list of cleanable items under /mnt" |
| **Criteria** | What counts as done (verifiable) | "Clean it up" | "List items that free ≥ 1 GB, each with path and size" |
| **Output Location** | Where the file is written | "Write it down" | "Write it into `scenes/scene C/project-memory/disk-check-2026-10-31.md`" |
| **Receipt Format** | How to reply, and what to reply with | "Let me know when you're done" | "State in §0 section 4 that the receipt is in, and append the first line of the conclusion to the shared board" |

> **The Criteria column is skipped most often, and it is the most fatal.** Without criteria there is no way to judge whether the receipt is true.

---

## 3. The receipt three-part set

This is the most important single rule in the whole mechanism. **A receipt is not a report, it is a delivery.**

```
Receipt ＝ Diff Set ＋ Accumulable Artifact ＋ Next Handoff
```

| Part | What it records | Why it cannot be missing |
|---|---|---|
| **Diff Set** | What the state changed by | "Everything normal" cannot be verified —— it might be made up |
| **Accumulable Artifact** ★ | Usable next time: practices, pitfalls, criteria, a better way to do it | **Without it, this round of work was wasted** |
| **Next Handoff** | Who this thing goes to next | Without it, the chain breaks here |

### 3.1 Diff Set: not "everything normal", but "the difference against last round"

```
❌ Disk cleaned, everything normal.

✅ Disk check complete, difference against last round:
   /mnt/minecraft   56% → 41% (-8.2G)
   swap usage       67% → 22% (-3.1G)
   free            4.0Gi → 2.5Gi
   Deleted: 3 old map backups (-1.4G)
   Written to: scenes/scene C/project-memory/disk-check-2026-10-31.md
```

**Why**:
- "Everything normal" cannot be verified —— it might be made up
- The diff set is **checkable**: compare with last round's numbers and you know whether anything moved
- The diff set **saves tokens**: no repeated background

**Write-back ceiling**: ≤ 10 lines / ≤ 2 KB. Over that means you are copying the process, not writing a receipt.

### 3.2 Accumulable Artifact: what this round leaves for the next one

The diff set answers "what changed in the **state**"; the accumulable artifact answers "what changed in the **understanding**".

| | Diff Set | Accumulable Artifact |
|---|---|---|
| Content | Numbers, files, what was deleted | Practices, pitfalls, criteria, "do it this way next time" |
| Landing place | Project memory (the current state of that project) | **`§5 Decisions and Pitfalls`** (append only) + scene-private skills |
| Who reads it | The next step of that project | **Every future instance of this kind of work** |

```
✅ Disk check complete, difference against last round: …
   Accumulable artifact:
     · Old map backups under /mnt are safe to delete, but confirm nobody is running that world first
     · Criterion: check with lsof before deleting; only act on >1GB
     · Pitfall: swap sitting at 67% is held up by Minecraft, not real memory pressure
   Next handoff: cleanup (scene C)
```

> **A receipt without an accumulable artifact ＝ this round of work was wasted.**
>
> This hard limit is the same disease as the existing "work finished but the other side does not know ＝ not finished":
> **done, but not left behind.**
>
> The first leaves behind "the other side knows"; the second leaves behind "the next round knows".

**The difference between the two landing places**:

| Landing place | When to write | Example |
|---|---|---|
| `§5 Decisions and Pitfalls` (append only) | One-off pitfalls, criteria | "Only delete after checking with lsof" |
| **Scene-private skills** | This practice will be **used repeatedly** | "The disk check procedure" becomes a scene-private skill |

> **Criterion: if it will be used more than once, make it a scene-private skill; if it is a one-off, write it into `§5`.**
> These are the two levels of accumulation —— `§5` is piling up, a scene-private skill is refining.
>
> ★ **This is a split, not a double write: one accumulable artifact goes to exactly one of them, do not copy it to both.**
> Copying to both ⇒ editing one makes the other stale, and "two sets of numbers disagree" is the most expensive failure mode of this architecture.
> If you need to see another scene's artifact ⇒ **write a pointer** ("see scene X §5 2026-11-05"), do not copy the body over.
>
> ★ The landing check compares the **longest common substring ≥ 8 characters**, **not exact equality** ——
> the landing check has to prove "it really is there", not "it is there word for word".
> Exact comparison would judge "obviously it was written in" as not landed (scenes often reword or use a different script when landing).

### 3.3 Next Handoff: where the chain picks up

| Situation | How the next handoff is determined |
|---|---|
| Single-point dispatch | The next scene the human names |
| Workflow execution | **Decided by the workflow definition** (see [5 · Workflow](5-workflow.md)) |

The accumulable artifact does not just stay where it is —— **it has to be read by the next handoff**.
That is the difference between a workflow and "queueing three scenes": information flows between hops, and the carrier of that flow is the accumulable artifact.

---

## 4. Two channels: how a ticket gets delivered

There are two ways to deliver the same thing, **use both**.

### Channel A | Engine RPC (a real call, it wakes the other side up)

Send a prompt straight to the target session to wake it up; then use `session/page` to pull its answer back and check it —— **do not rely on trust, read the evidence**.

```js
// 建會話.mjs:92
async function rpc (method, args) {
  await auth()
  const r = await fetch(BASE + '/api/' + method, {   // BASE = http://127.0.0.1:3080
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8', cookie },
    body: JSON.stringify({ type: 'client-request', rpcId: 'r1', method, payload: { args } }),
  })
  ...
}
```

**Waking the other side up**:

```js
// 建會話.mjs:217
await rpc('session/prompt', {
  request: {
    requestId: crypto.randomUUID(),
    sessionId: targetSessionId,
    mode: 'queue',                                    // queue, do not interrupt the current turn
    content: [{ type: 'text', text: '……dispatch body……' }],
  },
})
```

As soon as `session/prompt` is sent, the target session receives the message and the agent starts running. It comes with `session/page` (pull back the other side's latest 200 messages to **check the result**), `session/cancel` (interrupt), `workspace/pinSession` (pin to the sidebar).

> **One authentication trap**: the token is not in the config file, you have to fish it out of the systemd log;
> when rotating the cookie you must use `redirect: 'manual'`—— following the redirect instead gives you a 401.

### Channel B | File message (the other side can receive it even when it is not awake)

```js
// 發消息.mjs
const line = '- [' + ts + '] → ' + to + '：' + text
fs.appendFileSync(BOARD, line + '\n')                 // shared-layer board
// then append the same line into the recipient's "## 0 - Notifications"
```

### Division of labour between the two channels

| | Engine RPC | File message |
|---|---|---|
| Does the other side wake up immediately | ✅ | ❌ |
| Can the result be confirmed | ✅ `session/page` | ❌ you can only wait for the receipt |
| Depends on | The engine running + a valid token | A writable file |
| Use for | Dispatch, roll call, gathering evidence | Messages, leaving a trail, offline delivery |

> **A file message is like a note passed across a table**: same table, whoever sees the note is responsible, whoever does not reply goes and looks at the table.
> RPC is like a phone meeting: there is a connected state, and there is "I'm still checking, I'll get back to you".
> Use both: **RPC for the urgent, files for the record**.

---

## 5. The dispatch chain: from one sentence of the machine owner to a receipt

```
One sentence from the machine owner
   ↓
Orchestrator (read + route only, does not act)
   ↓  match on "item → owner"
Dispatch (four-part set)──── Channel A: RPC wakes it up
   ↓                Channel B: file message (leaves a trail at the same time)
The owner does the work
   ↓
Receipt three-part set (diff set + accumulable artifact + next handoff)
   ↓
Orchestrator reads the receipt → acceptance (★ read the scene memory, confirm the accumulable artifact really landed)
   ↓
Assemble the reply to the machine owner
```

**The orchestrator only routes, it does not act** —— that is the boundary of its responsibility.
The moment it starts doing the work itself, the boundaries between scenes blur and auditability disappears.

---

## 6. Three rules for cross-scene collaboration

| Rule | Content |
|---|---|
| **⛔ Requests only, never edit the other side's memory** | Whose memory you change is whose it stays. To change it, dispatch. |
| **One dispatch = one receipt = done** | No back-and-forth pleasantries, no "did you get it?" |
| **Done means there is an observable landing point** | It was written, but written somewhere nobody looks ＝ not done |

> The third rule comes from a real incident: **the board split** —— messages were written into an old board,
> so the recipient's memory file never received them. **Written ≠ effective**; effective requires an observable landing point.

---

## 7. Receipt collection: the biggest gap right now

**The orchestrator only sends the prompt, there is no program to read the answer back.** That is the most concrete hole in the mechanism today.

The technical difficulty: `session/prompt` is asynchronous, **so when does a message count as complete?**

| Approach | Explanation | Verdict |
|---|---|---|
| **A. Polling** | `session/list` for the `running` flag + read the message content | ✅ Recommended —— the existing tools already use `session/list` to get the `running` flag |
| B. Event stream | The WebSocket endpoint of `dsh-api-gateway` | ⚠ Heavier, not needed yet |

> Once the collection leg is added, this chain closes: **can be sent out → can be pulled back → can be checked**.

---

## 8. Failure modes

| Symptom | Root cause | Fix |
|---|---|---|
| "Work finished but the other side does not know" | No receipt mechanism | One dispatch ＝ one receipt; the orchestrator needs a collection leg |
| The receipt is "everything normal" | The diff set was not demanded | State the criteria explicitly in the dispatch four-part set |
| **The work is done but the understanding did not accumulate** | The receipt carried no accumulable artifact | The receipt three-part set; **no accumulable artifact ＝ wasted work** |
| **The accumulable artifact is only in the receipt, never landed** | No acceptance | The orchestrator reads the scene memory to confirm the landing |
| The message was written but the other side never got it | The memory root path split, it was written into the old board | Unify path resolution; **and there must be an observable landing point** |
| The orchestrator did the work itself | The responsibility boundary blurred | The orchestrator only routes |
| Dispatched to the wrong scene | No routing table, relying on judgement in the moment | Put the routing table in the shared layer; only hand it to the model when there is no hit |

---

> ➡️ **Next**: [5 · Workflow](5-workflow.md) (how scenes are strung into one line)
> ⬜ **Previous**: [3 · Scene Memory](3-scene-memory.md) ｜ **Back**: [Core Mechanisms README](README.md) ｜ **Related**: [1 · Accumulation](1-accumulation.md) · [2 · Scene](2-scene.md)

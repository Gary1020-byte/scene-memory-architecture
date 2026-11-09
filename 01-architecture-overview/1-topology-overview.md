# 1 · Topology Overview —— who is on which layer, who may write whom

> The diagram is a **topology graph**: nodes = which layer a thing lives on, edges = who reads whom／who writes whom.
>
> 📐 Visual version: [`diagrams/topology-scene-memory-architecture.svg`](diagrams/topology-scene-memory-architecture.svg)
> (vector, scales losslessly; the text version below opens in any environment)

---

## One, the full picture

```
╔═══════════════════════════════════════════════════════════════════════════════════════════════════╗
║ L0 Global constitution                                                                            ║
║   <global>/AGENTS.md · global skills                                                              ║
║   ───────────────────────────────────────────────────────────────────                             ║
║   Content: memory lives in files · scene sovereignty · one dispatch = one receipt                 ║
║          · done means there is a landing point                                                    ║
║          · a receipt without an accumulable artifact = wasted work                                ║
║   Who writes: the machine owner only                                                              ║
║   Who reads: injected every turn, shared by all sessions (must be tiny)                           ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════╝
              ▲ C1 injection (every turn)
              │
╔═══════════════════════════════════════════════════════════════════════════════════════════════════╗
║ L2 Scene private layer                                                                            ║
║   ─────────────────                                                                               ║
║   one git repo per scene                                                                          ║
║   scene-private-memory.md §0 handover                                                             ║
║   identity card / scene portrait                                                                  ║
║   project-memory/  archive/                                                                       ║
║   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                                            ║
║   │scene A       │  │scene B       │  │scene C       │                                            ║
║   │scene A       │  │scene D       │  │scene C       │                                            ║
║   ├──────────────┤  ├──────────────┤  ├──────────────┤                                            ║
║   │constitution  │  │constitution  │  │constitution  │                                            ║
║   │skills        │  │skills        │  │skills        │                                            ║
║   │memory        │  │memory        │  │memory        │                                            ║
║   │projects      │  │projects      │  │projects      │                                            ║
║   └──────────────┘  └──────────────┘  └──────────────┘                                            ║
║   Who writes: this scene only                                                                     ║
║   ⛔ Scenes cannot write another scene's memory directly — requests only                          ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════╝
              ▲ C2 read own tree only   ▲ C3 project memory  ▲ C4 skill visibility
              │
╔═══════════════════════════════════════════════════════════════════════════════════════════════════╗
║ L1 Shared layer (five boards)                                                                     ║
║   ───────────────────────────────────────────────────────────────────                             ║
║   Identity index · cross-scene board · to-do · conflict log · workflows (★ plan)                  ║
║   Who writes: partitioned writes, each owner writes only its own                                  ║
║   ★ A workflow definition is the "plan": order · criteria · gates · branches                      ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════╝
              ▲ C5 dispatch (engine RPC wakes it up / file message leaves a trail)
              │      ▼ C6 receipt (diff set)
╔═══════════════════════════════════════════════════════════════════════════════════════════════════╗
║ L3 Execution and tool layer                                                                       ║
║   ───────────────────────────────────────────────────────────────────                             ║
║   Engine · validation tools (check / stamp / handover) · create session · send message · dispatch ║
║   Who writes: one dedicated maintainer; ★ tools live outside the data — upgrades do not break data║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════╝
              ▲ C7 write
              ▼ C8 audit (git log / audit log)
╔═══════════════════════════════════════════════════════════════════════════════════════════════════╗
║ L2′ Execution layer (orchestrator-private)                                                        ║
║   ───────────────────────────────────────────────────────────────────                             ║
║   runs/<run-id>/: execution state (where it got to · where it is stuck)                           ║
║   carry chain (the accumulable artifact travels down)                                             ║
║   Who writes: the orchestrator only                                                               ║
║   ★ The plan is in L1 (shared), the state is here (private) — mixing them splits                  ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════╝
              ▲ C9 execution state is private
              ▼ C10 audit (git log / audit log)
╔═══════════════════════════════════════════════════════════════════════════════════════════════════╗
║ L4 Audit layer  ·  L5 Archive layer (append only, recoverable)                                    ║
╚═══════════════════════════════════════════════════════════════════════════════════════════════════╝
```

---

## Two, the edges one by one

| # | Edge | From → To | What it does | What breaks if it is broken |
|---|---|---|---|---|
| **C1** | Injection | L0 → every turn | The global hard rules are injected automatically every turn | The injection layer grows ⇒ every turn costs more tokens |
| **C2** | Read own tree only | L2 scene A → A's memory | Read the §0 handover at the opening | Reading another scene's memory across scenes ⇒ the boundary fails |
| **C3** | Project memory | Scene → its own `project-memory/` | One per project, ≤ 8 KB | Project memory leaks into §0 ⇒ the opening never finishes reading |
| **C4** | Skill visibility | Engine → the project root's `.dsh/skills/` | Only this scene's skills are mounted | Other scenes' skills become visible too ⇒ the scene is no longer independent |
| **C5** | Dispatch | L1 shared layer → target scene | RPC wakes it up / file message | Send but never collect ⇒ the work never comes back |
| **C6** | Receipt | Target scene → L1 shared layer | Conclusion + evidence + path + **the three-part set** | The receipt is "everything normal" ⇒ unverifiable |
| **C6b** | **Accumulable artifact written back** ★ | Target scene → its own L2 memory | The accumulable artifact from the receipt lands in `§5 Decisions and Pitfalls`／private skills | **Not written back ⇒ accumulation breaks ⇒ next time starts from zero again** |
| **C9** | Execution state | L2′ execution layer ↔ workflow | Records where it got to, where it is stuck, what it is waiting for | The execution was interrupted and nobody knows where it is stuck |
| **C10** | Audit | L2/L1/L2′ → L4 | git log holds everything | Changes leave no trace ⇒ memory is not an asset |
| **C7** | Write | L3 tools → L2/L1 | Tools stamp, fill in the skeleton | Tool paths are hardcoded ⇒ **the board splits** |
| **C8** | Audit | L2/L1 → L4 | git log holds everything | Changes leave no trace ⇒ memory is not an asset |

---

## Three, one full cycle

```
 ① One sentence from the machine owner (or start a workflow)
        ↓
 ② The orchestrator reads the routing table (scene → scene id → trigger words)
        ↓
 ③ Scene routing hits ⇒ dispatch with the four-part set
        │           └─ no hit ⇒ hand it to the model to judge by responsibility
        ↓
 ④ Channel A: engine RPC (session/prompt) —— wake the other side up
    Channel B: file message —— write into the board + the other side's §0 notifications (leaving a trail)
        ↓
 ⑤ The owner reads its own §0 (★ carrying the last accumulation)
        ↓
 ⑥ The owner works ⇒ the conclusion goes into its own project memory
        ↓
 ⑦ The owner receipts: conclusion + evidence + path + the three-part set (≤10 lines / ≤2 KB)
        │     · diff set · accumulable artifact · next handoff
        ↓
 ⑧ The orchestrator collects the receipt → checks the criteria → ★reads the scene memory to confirm the accumulable artifact really landed
        ↓
 ⑨ Wrap up: overwrite §0 → run check → only switch the session once it passes → the old version goes to the archive
        ↓
 ⑩ Workflow: pick the next hop by the branch conditions (each hop opens a new conversation and binds one scene)
```

---

## Four, three lines that cannot be broken

| Line | Explanation |
|---|---|
| **Every thing is the source of truth in exactly one place** | Everywhere else holds only pointers. Break this and you get "the board split" and "two sets of numbers disagree" |
| **Between scenes, only go through the L1 shared layer** | No direct cross-scene file writes. The shared layer is the only legal cross-scene channel |
| **L2 and L5 stay separate** | The archive is append-only. Any upgrade can be rolled back |
| **★ The plan (L1 workflows) and the state (L2′ execution layer) stay separate** | Mixed together ⇒ the execution state splits and nobody can read the authoritative version |
| **★ The accumulable artifact must be written back to the scene** | Only in the receipt ⇒ next time there is nothing to read. **A receipt without an accumulable artifact ＝ wasted work** |

---

## Five, the relationship to the engine

```
        ┌──────────────────────────────────────┐
        │  What the engine (DSH) provides       │
        │  ───────────────────────────────────  │
        │  · findProjectRoot: .git draws the boundary ★ │
        │  · loads only the AGENTS.md on the project root → cwd ancestor chain │
        │  · skill roots hang off the project root │
        │  · session / workspace / prompt RPC     │
        └──────────────────────────────────────┘
                        ▲
                        │ this architecture does **not rebuild** the engine, it uses it as the base
                        │
        ┌──────────────────────────────────────┐
        │  What this architecture provides      │
        │  ───────────────────────────────────  │
        │  · the document form of memory and its hard limits │
        │  · the spec of the scene six-part set  │
        │  · the criteria of the dispatch four-part set and the receipt three-part set │
        │  · the workflow definition format and the gate rules │
        │  · the validation tools (fail-closed)  │
        │  · the maintenance manual              │
        └──────────────────────────────────────┘
```

> **The boundary matters**: drawing the boundary with `.git` is the engine's behaviour, it is not invented here.
> What this architecture does is **turn memory from "convention" into "a file with a contract", on top of the engine**.

---

⬅️ **Back**: [Architecture Overview README](../README.md) ｜ **Next**: [Implementation](../02-implementation/1-directory-and-file-spec.md)

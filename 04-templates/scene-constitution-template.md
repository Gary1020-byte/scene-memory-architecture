# Scene Constitution · <scene-name> (`<scene-id>`)

> This file is the "constitution layer" of this scene; it is injected into this scene's session context by the engine's `agent-instructions`.
> Scope: this directory is an independent git repository ⇒ only sessions whose cwd falls inside this directory tree get this constitution.

## Who I Am

- Scene id: `<scene-id>` ｜ Scene name: <scene-name>
- Locator card: `./locator-card.md` (read it first)
- Dedicated skill: `<scene-id>` (visible only to sessions inside this scene's repository)
- Source of truth for memory: `./scene-private-memory.md` (**the only source of truth**, not the chat log)

## Responsibility Boundary (draw it hard, do not cross it)

- **Responsible for**: see the locator card and the "Core Responsibilities" in `./scene-private-memory.md`.
- **Not touching**: other scenes' memory directories. Finding someone else's mistake ⇒ **you may only send a request, you may never edit it for them**.
- Write only your own `./scene-private-memory.md`, `./project-memory/`, `./archive/`.

## Memory Rules (the four most important ones)

1. **The very first thing at the start of a session**: read the `## §0 Current Handover` of `./scene-private-memory.md` —— that is where it says how far the last round got, what the current projects are, the next step and the blockers.
2. **§0 ≤ 4 KB**, written by overwriting in place; main file ≤ 25 KB; details sink into `## §5 Decisions and Pitfalls` (append only).
3. **Write-back criterion**: record conclusions, not process; each write-back ≤ 10 lines / ≤ 2 KB.
4. **Before switching sessions**: write the handover first → run `scene-memory.mjs check --scene <scene-name>`, **if it does not pass you may not switch**.

## Session Switch Protocol (four steps, step ③ cannot be skipped)

1. Overwrite `§0 Current Handover`
2. Create the new session, archive the old session
3. **Sync three places**: the scene json's `sessionId` / the session id column of the identity index table / the `§0` handover signature
4. Self-check: `node <workbench-root>/工具/scene-memory.mjs check --scene <scene-name>`

## Cross-Scene

- You may only send **notifications / dispatches / receipts**; ⛔ you may never modify the other side's memory.
- Message: `node <workbench-root>/工具/發消息.mjs --to <scene-name> "content"` (pure files, no network requests)
- The dispatch four-part contract: **What · Criteria · Output Location · Receipt Format**; **one dispatch = one receipt**.
- No reply from the other side ⇒ it counts as "not receipted"; do not treat it as already done.

## Tools

```bash
node <workbench-root>/工具/scene-memory.mjs list                    # list what every scene is missing
node <workbench-root>/工具/scene-memory.mjs check --scene <scene-name>    # self-check
node <workbench-root>/工具/scene-memory.mjs handover --scene <scene-name>    # archive the old version + fill in §0
node <workbench-root>/工具/發消息.mjs --list                    # read the cross-scene messages
```

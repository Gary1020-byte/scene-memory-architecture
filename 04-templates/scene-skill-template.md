---
name: <scene-id>
description: 【Scene: <scene-name>】The dedicated skill of the <scene-name> scene: take over this scene's memory when a session opens, write the conclusions back into the scene private memory when the work is done, send dispatches/receipts to other scenes. Use it when the session's working directory is <workbench-root>/scenes/<scene-name>.
---

# <scene-name> · Scene Dedicated Skill

1. **Take over**: read the `## §0 Current Handover` of `./scene-private-memory.md` (≤4 KB, five subsections: Last Handover / Current Projects / Private Memory Changes / Next Steps · Blockers / Full Picture).
2. **Do the work**: touch only this scene's directory and this scene's memory; other people's territory is request-only.
3. **Write back**: write the conclusions back into `§0` (≤10 lines/≤2 KB, conclusions only, not process); append the details into `## §5 Decisions and Pitfalls`.
4. **Hand over**: before wrapping up or switching sessions run `node <workbench-root>/工具/scene-memory.mjs handover --scene <scene-name>`, then only switch after `check` passes.
5. **Cross-scene**: `node <workbench-root>/工具/發消息.mjs --to <scene-name> "content"`; the dispatch must state What · Criteria · Output Location · Receipt Format.

> ⚠️ **The path in the description must be the absolute path of the scene directory** —— that is what the engine
> uses to decide "is this skill visible in this scene". A wrong path ⇒ the skill shows up in other scenes too.

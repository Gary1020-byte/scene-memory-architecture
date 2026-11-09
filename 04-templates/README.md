# 04 · Templates

> Pure shells you can copy straight away. **After copying you must rewrite them with your own content**——
> these are the "shape", not the "content". An empty template does not grow a memory by itself.

| File | Purpose | Who writes it |
|---|---|---|
| [`scene-private-memory.md`](scene-private-memory.md) | The source of truth of scene memory (§0 handover + responsibilities + decisions) | Human |
| [`locator-card.md`](locator-card.md) | The scene identity spec sheet (the anchor for validation) | Human |
| [`identity-card.md`](identity-card.md) | Identity / permissions / fingerprint | **Tool-generated** |
| [`scene-portrait.md`](scene-portrait.md) | Layout / panels / dependencies | **Tool-generated** |
| [`handover-rules.json`](handover-rules.json) | **The single source of truth for the rules** (hard limits etc.) | Human (rarely changed) |
| [`dispatch-template.md`](dispatch-template.md) | The dispatch and receipt format (**the receipt three-part contract**) | Human |
| [`workflow-template.md`](workflow-template.md) | The workflow definition format (steps / criteria / gates / branches) | Human |
| [`scene-constitution-template.md`](scene-constitution-template.md) | The `AGENTS.md` of a new scene (the scene constitution) | Human |
| [`scene-skill-template.md`](scene-skill-template.md) | The `SKILL.md` of a new scene (the scene's dedicated skill) | Human |
| [`scene-definition-template.json`](scene-definition-template.json) | The panel json of a new scene (the `name` field = the scene directory name) | Human |
| [`execution-state-template.md`](execution-state-template.md) | The private state of one execution (how far it got, where it is stuck) | Tool writes |
| [`carry-template.md`](carry-template.md) | The carrier that passes each hop's accumulable artifact onward | Tool writes |
| [`demo-workbench/`](demo-workbench/) | A **runnable** minimal example | —— |

---

## How to use

```bash
# 1) Copy a scene skeleton
cp -r 04-templates/demo-workbench/scenes/demo-scene scenes/my-scene/
cd scenes/my-scene && git init      # ★ the scene boundary

# 2) Change the locator card (scene id, name, panel path, dedicated skill)

# 3) Change the §0 and the core responsibilities of the scene private memory (replace the "to be filled in")

# 4) Add it to the identity index
#    add a row to the table in scenes/_scene-identity-index.md (7 columns)

# 5) Let the tool stamp it
node 03-executable-tools/scene-memory.mjs stamp --scene my-scene --root .

# 6) Check (must be all green)
node 03-executable-tools/scene-memory.mjs check --scene my-scene --root .
```

---

## ⚠️ Three things to know before you copy

| # | Thing | Why |
|---|---|---|
| 1 | **The scene directory must be `git init`ed** | Without `.git` ⇒ the dedicated skill is not loaded, the scene boundary fails, and **the symptom is not obvious** |
| 2 | **The "to be filled in" in §0 must be replaced** | "Core Responsibilities" has only 3 items but they are all "to be filled in" ⇒ that equals no responsibilities, and a new session does not know who it is |
| 3 | **The identity index must line up across 7 columns** | One column short ⇒ the tool cannot read this card ⇒ validation is completely ineffective for this scene |

---

## What the templates do not include (you have to write it yourself)

| Thing | Why it is not given |
|---|---|
| Your scene list and division | This is **your** responsibility structure; there is no universal answer |
| Your project memory | The projects are yours, not the template's |
| Engine-related settings | They differ by engine version and environment; hardcoding them does more harm than good |

---

> ⬅️ **Back**: [Document Map](../README.md) ｜ **Related**: [1 · Directory and File Spec](../02-implementation/1-directory-and-file-spec.md)

# 6 · Archive Layer: where the full chat transcript goes

> **Scene memory only handles "conclusions"; the full chat transcript is a different thing.**
> This doc makes that "different thing" clear: where it is stored, how it is retrieved, when it is cleared, how it is split from the memory layer.
>
> **This is not a new idea, it is filling a hole.** If a replaced old session does not land in a file,
> it is only a black box inside the engine — **one engine version change and the whole batch is unreadable**.

---

## 1. Why this layer exists

### 1.1 A real failure mode

2026-11-03, measured against a workbench's session store:

| | Count |
|---|---|
| Session files on disk | 30 |
| Recognised by the engine's `session/list` | 11 |
| **Actually readable by the engine** | **7** |
| Reported `corrupt` and unreadable by the engine | **23** |

Those 23 report `corrupt Zstandard session log: first frame is not exactly one header line`.
But `zstd -t` **passes on all of them, not a single byte of data is broken** — **the engine changed its session log format**,
the new one has one frame per line, the old one packs the whole thing into the first frame.

> **The data is not broken; the engine cannot read it.** And the engine will change version again.

### 1.2 The conclusion

> **The full chat transcript cannot live only inside the engine.**
> The engine's storage format is the engine's private implementation detail, it will change; **your files will not.**

### 1.3 But it is not memory either

| | Memory layer | Archive layer |
|---|---|---|
| What it holds | **Conclusions** (what you need to start the next session) | **The full chat transcript** (a one-off process) |
| Who writes it | Human / scene | Tool (exported from the engine) |
| Who reads it | **Read at every session start** | Looked up only when needed |
| Size hard limit | `§0` 4 KB / main file 25 KB | 512 KB per file |
| ⛔ | —— | **Do not copy the body text into the memory file** |

> **That "do not copy" is a hard rule.** If you copy, the memory file gets fat, goes stale, and makes the new session read a pile of process chatter —
> and what the new session needs is "what am I doing now", not the 200 keystrokes typed three hours ago.

---

## 2. The split of the three layers (complete version)

| Layer | What it holds | Where | Lifecycle | Who writes it |
|---|---|---|---|---|
| **Memory layer** | Conclusions | `scenes/<name>/scene-private-memory.md` | Permanent, overwritten in place | Human / scene |
| **Memory archive** | Old memory snapshots | `scenes/<name>/archive/` | Append only | Tool (at handover) |
| **Session archive layer** ★ | **The full chat transcript** | `session-archive/<scene-name>/` | Append only, can be cleared | Tool (exported from the engine) |

Each layer has its own problem:

- **The memory layer** answers "what should I do now" ⇒ read at every session start ⇒ it must be small
- **The memory archive** answers "what this scene's memory looks like" ⇒ read only when tracing history ⇒ a snapshot is enough
- **The session archive layer** answers "what actually happened at the time" ⇒ read very rarely, but it must be greppable

---

## 3. Directory spec

```
<workbench-root>/
├── scenes/<scene-name>/
│   ├── scene-private-memory.md          ← Memory layer (conclusions)
│   └── archive/                     ← Memory archive (old snapshots, append only)
└── session-archive/                     ← ★ Session archive layer (cross-scene, lives at the workbench root)
    ├── _session-archive-index.md          ← Index: where each copy is, when, how many messages, summary
    └── <scene-name>/
        └── <YYYY-MM-DDTHH-mm-ss>-<first 8 of session id>.md
```

> **Why it lives at the workbench root and not inside a scene**:
> a session archive is **cross-scene history**, not some scene's private data.
> Putting it inside a scene makes the scene directory fatter and fatter, and switching scenes means moving files.

### 3.1 The format of one session file

```markdown
# Session Archive · <session-name>

> This is **the full chat transcript**, not conclusions. The conclusions are in the scene's memory file.
> ⛔ Do not copy the body text from here into the memory file — that is a different thing.

| Field | Value |
|---|---|
| Session ID | `session-xxxx` |
| Session Name | <name> |
| Scene ID | <id> |
| Start Time | <ISO8601> |
| Messages | <n> |

---

### User

<message>

### Assistant

<message>

### Tool

<message>
```

> **There are only three roles**: user / assistant / tool.
> Do not subdivide further — the cost of subdividing (every engine has a different message structure) far outweighs the benefit.

---

## 4. The engine-side contract (repo ↔ engine)

### 4.1 Export format

The engine side exports a session as one JSON file and hands it to the repo's tool:

```json
{
  "sessionId": "session-xxxx",
  "sessionName": "scene name",
  "sceneId": "scene-id",
  "startTime": "2026-11-02T15:03:19+08:00",
  "messages": [
    { "role": "user", "text": "……" },
    { "role": "assistant", "text": "……" }
  ]
}
```

| Field | Required | Note |
|---|---|---|
| `sessionId` | ✅ | The index identifies the session by it |
| `sessionName` | | If missing, use the scene name |
| `sceneId` | | If missing, use whatever `--scene` specifies |
| `startTime` | | If missing, use the current moment |
| `messages` | ✅ | The role may be written in Chinese or English |

> **The repo defines the format, not how the engine exports it.** The engine side may use JSONL, SQLite, or read its own log directly —
> as long as the result takes the shape above.

### 4.2 The index: three ways to read it

| Way to read | How |
|---|---|
| **By scene** | `node session-archive.mjs list --root <root> --scene <name>` |
| **By date** | `--keyword 2026-11-02` (the date is in the path and in the fields) |
| **By keyword** | `--keyword <text>` (grep the index and the files) |

---

## 5. The tool

```bash
# Extract from the engine export file (the index is rebuilt automatically)
node 03-executable-tools/session-archive.mjs extract --root <workbench-root> \
  --engine-export <export.json> --scene <scene-name>

# Rebuild the index
node 03-executable-tools/session-archive.mjs index --root <workbench-root>

# Self-check (do the files the index points at still exist? Is a hard limit broken?)
node 03-executable-tools/session-archive.mjs check --root <workbench-root>

# Query
node 03-executable-tools/session-archive.mjs list --root <workbench-root> --scene <name>
node 03-executable-tools/session-archive.mjs list --root <workbench-root> --keyword <text>
```

### 5.1 What `check` blocks

| Problem | Handling |
|---|---|
| The index points at a file that does not exist | **Blocked** (exit 1) |
| The index is missing | **Blocked** |
| A single file over 512 KB | Warned |
| A scene has more than 20 copies | Warned (the old ones should be cleared) |
| The scene is missing `archive/` | Warned |

> ★ **`check` does not rebuild the index.** It only reads.
> If the check rebuilt it, a broken index would be overwritten at the moment of the check — **the check could then never find the problem**.
> This is a lesson that repeats in this repo: **a checker must be read-only**.

---

## 6. Hard limits and retention

| Object | Hard limit | What to do when over | Block or warn |
|---|---|---|---|
| A single session file | 512 KB (524288 B) | Open another file for that scene; or keep only the summary | Warned |
| The number of copies for one scene | 20 copies | Clear the oldest | Warned |
| Index size | —— | If too large, split the index by scene | Convention |

> **Keeping 20 copies is not arbitrary**, it is the compromise between "enough to look back" and "will not blow up the disk".
> If you really need more, adjust the `sessionArchiveKeepCount` in `handover-rules.json` — **single source of truth for the rules, never a second copy in the code**.

---

## 7. When you should archive

| Trigger | Should you archive? |
|---|---|
| Switching sessions (the old session is replaced) | ✅ Should archive |
| The scene is done and idle for the short term | ✅ Should archive |
| The engine just changed version and the old logs are unreadable | ✅ **Most in need of archiving** (this is their only remaining chance) |
| The session is still actively used | ❌ Don't rush — the engine can still read it |

> **That last row is the point**: a session the engine cannot read is the **only** kind that archiving can rescue.
> If the engine can still read it, let the engine keep using it.

---

## 8. Common mistakes

| Symptom | Root cause | Fix |
|---|---|---|
| Nothing can be extracted | The export file's `messages` field is not an array | Compare against the format in §4.1 |
| The index is empty | `index` was never run | `extract` rebuilds it automatically; run it manually once |
| `check` says the index points at a file that does not exist | The file was deleted by hand | Run `index` to rebuild |
| The extracted file name has odd characters | The engine's timestamp format is odd | The tool normalizes it; if it is still odd, edit the export file by hand |

---

> ⬅️ **Back**: [Implementation README](README.md) ｜ **Previous**: [5 · New Scene Spec](5-new-scene-spec.md) ｜ **Related**: [3 · Scene Memory](../00-core-mechanisms/3-scene-memory.md) · [7 · Session Switch](7-session-switch.md)

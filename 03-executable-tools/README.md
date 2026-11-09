# 03 · Executable Tools

| File | Description |
|---|---|
| [`scene-memory.mjs`](scene-memory.mjs) | Validation tool: `list` / `init` / `stamp` / `handover` / `check` |
| [`add-scene.mjs`](add-scene.mjs) | Create a complete scene: skeleton ＋ the six-piece set ＋ identity index registration |
| [`switch-session.mjs`](switch-session.mjs) | Session switch: `plan` (precondition check) / `check` (three-point sync self-check) |
| [`session-archive.mjs`](session-archive.mjs) | Session archive layer: `extract` / `index` / `check` / `list` |
| [`handover-rules.json`](handover-rules.json) | **Single source of truth for the rules**: hard limits, subsection list, fingerprint length, boundary marker name |
| [`negative-acceptance.sh`](negative-acceptance.sh) | Self-acceptance: proves that "it fails when it should fail" |
| [`check-links.mjs`](check-links.mjs) | Link check: verifies every internal markdown link points at an existing file |
| [`USAGE.md`](USAGE.md) | Detailed usage, the exit code table, common errors and fixes, the limits of the tools |

---

## Five-second start

```bash
cd 03-executable-tools

# See what demo-workbench looks like
node scene-memory.mjs list --root ../04-templates/demo-workbench

# Run the self-acceptance once (it deliberately breaks things, then restores them)
bash negative-acceptance.sh

# Check whether every markdown link is valid
node check-links.mjs

# Switch session: precondition check (can we switch) + self-check after the switch (are all three in sync)
node switch-session.mjs plan --root ../04-templates/demo-workbench --scene demo-scene
node switch-session.mjs check --root ../04-templates/demo-workbench --scene demo-scene

# Session archive layer: where the full chat transcript lives
node session-archive.mjs check --root ../04-templates/demo-workbench
```

---

## The design claim of this section

> **"It fails when it should fail" is something you can prove, not a slogan.**

So there is no "tutorial document" here. What is here:

1. **A tool that really blocks problems** (correct exit codes, specific messages)
2. **An acceptance script that really breaks it** (10 counter-examples, all passing)
3. **A single source of truth for the rules** (changing a hard limit means changing one place)

> A checker that always returns 0 is more dangerous than no checker——
> it makes people think they are protected when they are not.

---

## Three invariants

| Invariant | Meaning |
|---|---|
| **The tools do not write the body** | The body of the scene memory is always written by humans. The tools only build the skeleton, fill gaps, stamp, check |
| **The handover does not overwrite** | It only fills what is missing. Overwriting §0 wipes out the progress, which is worse than not handing over at all |
| **The rules are not hardcoded** | Rules such as the hard limits are read from `handover-rules.json`; the tools and the scripts share one copy |

---

⬅️ **Back**: [Document Map](../README.md) ｜ **Related**: [2 · Handover and Validation](../02-implementation/2-handover-and-validation.md)

# Dispatch Template

> The dispatch four-part contract: **What · Criteria · Output Location · Receipt Format**.
> Missing one turns it into "done, but nobody knows".
>
> The receipt three-part contract: **Diff Set · Accumulable Artifact · Next Handoff**.
> Missing the accumulable artifact ⇒ **this round of work was wasted**.

---

## 1. Dispatch Template

```markdown
【<scene-name> · dispatch · please reply with a receipt】

What:
  <one-sentence action. Concrete enough that nobody has to ask "so what exactly is the task?">

Criteria:
  ① <what counts as done, verifiable>
  ② <quantified threshold: numbers, range, counts>
  ⛔ <what must not be touched this round>

Output Location:
  <full file path; one per line if there are several>

Needs:
  <what this hop consumes from the previous hop's accumulable artifact — optional>

Receipt Format:
  <what to reply, where to reply it>
  ① Conclusion + Evidence + Path
  ② Must carry the "Diff Set"
  ③ Must carry the "Accumulable Artifact" ★ without this one = this round of work was wasted
  ④ Must state the "Next Handoff"
  ⑤ Write back ≤ 10 lines / ≤ 2 KB (the accumulable artifact is not bound by this limit)
```

---

## 2. Receipt Template

> ⚠️ **The three subsection headings are fixed** (`## Diff Set` / `## Accumulable Artifact` / `## Next Handoff`).
> The validation tool parses receipts by them——**a wrong heading means nothing was written**.
> The optional fifth field is `Needs` (the previous hop's accumulable artifact).

```markdown
【<scene-name> · receipt】

Conclusion: <one sentence>
Evidence: <clickable path / commit / number>
Path: <where it was written>

## Diff Set
- <item A>: <old value> → <new value>
- <item B>: <old value> → <new value>
- <what was deleted / what was added>

## Accumulable Artifact
- <method / criteria: how to do it next time>
- <pitfall: what you will trip over next time>
- <the better way from this time: what this round improved>

## Next Handoff
- <which scene takes over / nobody>

Blocker: <none / who you are waiting for, and for what>
```

> **A receipt does not record "everything is fine".**
> "Everything is fine" cannot be verified——it may be made up.
> The Diff Set can be cross-checked: compare with last round's numbers, and you know whether anything moved.
>
> **The Accumulable Artifact is the subject of the receipt.** The Diff Set answers "what changed in the state",
> the Accumulable Artifact answers "**what changed in what we know**"——only the latter is what lets the next round
> start from something other than zero.

### ★ The Accumulable Artifact must "land"; writing it only in the receipt does not count

`verify-receipt.mjs` checks: **every accumulable artifact must be findable in the scene memory's `§5 Decisions and Pitfalls`
(or in the scene's dedicated skill).**

Written only in the receipt ⇒ blocked. Why? Because the receipt is for humans to read and is one-shot;
**`§5` is what the next round will actually read.** If the two sides disagree, the accumulation did not happen.

Verification command:

```bash
node 03-executable-tools/verify-receipt.mjs --root <workbench-root> --scene <scene-name> --receipt <receipt-file>
```

---

## 3. Three Examples

### ✅ A good dispatch (disk health check)

```markdown
【scene C · dispatch · please reply with a receipt】

What:
  Find the list of items under /mnt that can be cleaned up (old backups, caches, logs).

Criteria:
  ① For each item list its path, size, and estimated reclaimable amount
  ② Total reclaimable must be ≥ 1 GB to count as a conclusion; if it is less, say so plainly ("not enough")
  ③ For each item state whether deleting it would break anything
  ⛔ This round is inventory only — delete nothing

Output Location:
  scenes/scene C/project-memory/disk-check-2026-10-31.md

Receipt Format:
  ① Conclusion + Evidence + Path
  ② Carry the "difference from last round" (last round's numbers must be written in the dispatch; if there is none, say "first round, no previous round")
  ③ Write back ≤ 10 lines / ≤ 2 KB
```

### ✅ A good receipt

```markdown
【scene C · receipt】

Conclusion: /mnt can release 3.2 GB, mostly from old map backups and Docker images.
Evidence: scenes/scene C/project-memory/disk-check-2026-10-31.md
Path: same as above

Difference from last round (first round, no previous round):
  /mnt/minecraft  56% → (untouched)
  total reclaimable —  → 3.2 GB
  of which old map backups —  → 1.4 GB (3 items, before 2024-03)
  Docker images     —  → 1.8 GB (2 dangling)

Blocker: none. Next step is waiting for your confirmation on whether to delete.
```

### ❌ A bad dispatch

```markdown
Help me take a look, the disk is a bit full.
```

**Why it does not work**:
- What → vague
- Criteria → missing ("a bit full" — how full is full?)
- Output Location → missing
- Receipt Format → missing

**Consequence**: you get back "cleaned up, everything is fine"——
unverifiable, and quite possibly nothing was cleaned at all.

---

## 4. Cross-Scene Messages (the channel that does not wake the other side)

```markdown
- [2026-10-31 09:12] → <scene-name>: 【dispatch·please reply with a receipt】<one-line summary, details on the shared board>
```

| Property | Explanation |
|---|---|
| Zero network requests | Pure file writes; the other side receives it even while asleep |
| Receipt only | There is no way to confirm proactively that the other side saw it |
| Must write both places | Shared board + the recipient's `## 0 - Notifications` |

> ⚠️ **Writing both places is the source of "board split".**
> When two scripts write to different paths, the recipient simply never receives it, and nothing on the surface shows it.
> The fix is **unifying path resolution**, not "remember to write to both"——
> see [Known Gap #3](../02-implementation/4-known-gaps-and-todo.md).

---

## 5. Why the four-part dispatch contract cannot be skipped

| Part | Consequence of skipping it |
|---|---|
| **What** | The other side guesses the scope wrong and does something else |
| **Criteria** | The receipt cannot be judged true or false ("is it done?" — what does "done" mean?) |
| **Output Location** | The results scatter on the other side where you cannot find them; or get written twice |
| **Receipt Format** | The work is finished, but you do not know it |

> **One dispatch = one receipt.**
> "The work is finished but the other side does not know" = **not finished**.

---

⬅️ **Back**: [Template README](README.md) ｜ **Related**: [4 · Dispatch and Receipt](../00-core-mechanisms/4-dispatch-and-receipt.md)

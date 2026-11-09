#!/usr/bin/env bash
# Workflow End-to-End Acceptance — prove that the accumulation loop really closes
#
# Usage: bash workflow-acceptance.sh
#
# ★ Why this script exists:
#   "A receipt with no accumulable artifact means this round was wasted" and
#   "the accumulable artifact travels across scenes" — you cannot see either of
#   these from the spec alone. You must actually run a three-scene workflow,
#   and check that deliberately breaking things really gets blocked.
#
# It verifies ten things:
#   E1 Preconditions fail ⇒ refuse to start
#   E2 Receipt missing the accumulable artifact ⇒ blocked, run stops in place (fail-closed)
#   E3 Accumulable artifact not landed in the scene memory ⇒ blocked
#   E4 Valid receipt ⇒ accepted, run advances
#   E5 The accumulable artifact reaches the next hop's dispatch
#   E6 Gate step ⇒ stop and wait after collecting the receipt; continue only after confirmation
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
WORK="$(mktemp -d)"
EX="$HERE/run-workflow.mjs"
RC="$HERE/verify-receipt.mjs"

pass=0; fail=0

ok()   { echo "  ✓ $1"; pass=$((pass+1)); }
bad()  { echo "  ✗ $1"; echo "$2" | sed 's/^/     /' | head -8; fail=$((fail+1)); }

# ── Build the test workbench (three scenes + one workflow) ──
cp -r "$ROOT/04-templates/demo-workbench.clean" "$WORK/wb"
WB="$WORK/wb"
mkdir -p "$WB/workflows"

for pair in "cleanup-scene:demo-clean" "report-scene:demo-report"; do
  name="${pair%%:*}"; sid="${pair##*:}"
  d="$WB/scenes/$name"
  mkdir -p "$d/project-memory" "$d/archive"
  printf 'This file stands in for the .git boundary marker (demo use)\n' > "$d/.git-marker"
  cat > "$d/locator-card.md" <<EOF
# $name · Locator Card

- Scene ID: \`$sid\`
- Scene Name: $name
- Panel: \`scenarios/$sid.json\`
- Memory Directory: scenes/$name/
- Dedicated Skill: \`$sid\`
- Locator Card Version: 1
EOF
  cat > "$d/scene-private-memory.md" <<EOF
# $name · Scene Private Memory

## §0 Current Handover (≤4 KB, a new session reads this section first)

### 1) Last Handover
- (demo data)

### 2) Current Projects
| Project | Memory file | Status | Next step |
|---|---|---|---|
| (none) | — | — | — |

### 3) Private Memory Changes
- (demo data)

### 4) Next Steps / Blockers
- Next step: awaiting dispatch

### 5) Full Picture
- Project memory 0

## Core Responsibilities

- Owns: the demo work of $name.
- Does not touch: other scenes' data.
- In one line: demo-scene.

## §1 What I Own / What I Don't

- Owns: the demo skeleton.
- Does not own: real work.

## §2 Where to Start

- Project memory: \`project-memory/<project-name>.md\`
- Archive: \`archive/\`
- Index: \`_file-index.md\`

## §5 Decisions and Pitfalls (append only)

## 0 - Notifications
EOF
  cat > "$d/_file-index.md" <<EOF
# $name · File Index

| File / Directory | What It Is | Status | Last Reviewed |
|---|---|---|---|
| \`scene-private-memory.md\` | Scene private memory | active | 2026-11-02 |
EOF
done

# Add two rows to the identity index
python3 - "$WB/scenes/_scene-identity-index.md" <<'PY'
import sys
p=sys.argv[1]
t=open(p).read()
if 'demo-clean' not in t:
    t=t.rstrip('\n')+"\n| `demo-clean` | `demo-clean-ai` | Cleanup | cleanup-scene | `session-demo0002` | `scenes/cleanup-scene/locator-card.md` | `demo-clean` |\n"
    t+="| `demo-report` | `demo-report-ai` | Report | report-scene | `session-demo0003` | `scenes/report-scene/locator-card.md` | `demo-report` |\n"
open(p,'w').write(t)
PY

cat > "$WB/workflows/disk-check.yaml" <<'EOF'
id: disk-check
name: disk check → cleanup → report
version: 1
steps:
  - scene: demo-scene
    purpose: find items that can be cleaned up
    criteria: list items worth at least 1 GB, each with its path and size
    needsConfirmation: false
  - scene: cleanup-scene
    purpose: clean up the releasable items
    criteria: actually free at least 1 GB and list what was deleted in the receipt
    needs: the cleanup list from the disk check
    needsConfirmation: true
  - scene: report-scene
    purpose: produce the report
    criteria: the report lands on disk and its first line is written to the shared board
    needs: the cleanup result
    needsConfirmation: false
failureStrategy: stop-and-wait
EOF

# A broken workflow (the scene does not exist)
cat > "$WB/workflows/broken.yaml" <<'EOF'
id: broken
name: broken workflow
version: 1
steps:
  - scene: nonexistent-scene
    purpose: do something that does not exist
    criteria: this criterion is long enough to pass the length check
failureStrategy: stop-and-wait
EOF

echo "═══ Workflow End-to-End Acceptance: the accumulation loop must close ═══"
echo

# ── E1 Preconditions fail ⇒ refuse to start ──
echo "【E1】Workflow points at a nonexistent scene ⇒ preconditions fail, refuse to start (expected exit=1)"
out="$(node "$EX" start --root "$WB" --workflow broken 2>&1)"; rc=$?
if [ "$rc" = 1 ] && echo "$out" | grep -q "refusing to start"; then
  ok "Preconditions block the nonexistent scene"
else
  bad "Preconditions did not block it" "$out"
fi
echo

# ── Positive case: start ──
echo "【E2】Normal start (expected exit=0)"
out="$(node "$EX" start --root "$WB" --workflow disk-check 2>&1)"; rc=$?
RUN="$(echo "$out" | grep 'run id' | sed 's/.*：//' | tr -d ' ')"
if [ "$rc" = 0 ] && [ -n "$RUN" ]; then
  ok "Workflow started (run=$RUN)"
else
  bad "Start failed" "$out"; echo "$out" | head -5; exit 1
fi
echo

# ── E3 Missing accumulable artifact ⇒ blocked ──
echo "【E3】receipt missing Accumulable Artifact ⇒ blocked and run stops in place (expected exit=1)"
node "$EX" step --root "$WB" --run "$RUN" >/dev/null 2>&1
cat > "$WORK/receipt-1-missing-artifact.md" <<'EOF'
【demo-scene · Receipt】

Conclusion: the disk check is done
Evidence: /mnt/minecraft 56% → 41%
Path: scenes/demo-scene/project-memory/disk-check.md

### Diff Set
- /mnt/minecraft  56% → 41%（-8.2G）

### Next Handoff
- cleanup-scene
EOF
out="$(node "$EX" receipt --root "$WB" --run "$RUN" --receipt "$WORK/receipt-1-missing-artifact.md" 2>&1)"; rc=$?
if [ "$rc" = 1 ] && echo "$out" | grep -q "missing subsection「Accumulable Artifact」"; then
  ok "Receipt missing the accumulable artifact is blocked"
else
  bad "Receipt missing the accumulable artifact was not blocked" "$out"
fi
if echo "$out" | grep -q "fail-closed"; then
  ok "Run stops in place (fail-closed)"
else
  bad "Run did not stop" "$out"
fi
echo

# ── resume recovery ──
echo "【E4】After fixing, resume picks it back up (expected exit=0)"
out="$(node "$EX" resume --root "$WB" --run "$RUN" 2>&1)"; rc=$?
if [ "$rc" = 0 ] && echo "$out" | grep -q "running"; then
  ok "run moved from stopped back to running"
else
  bad "Resume failed" "$out"
fi
echo

# ── E5 Accumulable artifact not landed ⇒ blocked ──
echo "【E5】Receipt has the accumulable artifact but it did not land in the scene memory ⇒ blocked (expected exit=1)"
cat > "$WORK/receipt-1-not-landed.md" <<'EOF'
【demo-scene · Receipt】

Conclusion: the disk check is done
Evidence: /mnt/minecraft 56% → 41%
Path: scenes/demo-scene/project-memory/disk-check.md

### Diff Set
- /mnt/minecraft  56% → 41%（-8.2G）

### Accumulable Artifact
- The old map backup is safe to delete, but confirm nobody is running that world first

### Next Handoff
- cleanup-scene
EOF
out="$(node "$EX" receipt --root "$WB" --run "$RUN" --receipt "$WORK/receipt-1-not-landed.md" 2>&1)"; rc=$?
if [ "$rc" = 1 ] && echo "$out" | grep -q "not landed in the scene memory"; then
  ok "Accumulated artifact written only in the receipt, not landed, is blocked"
else
  bad "The unlanded accumulable artifact was not blocked" "$out"
fi
echo

# ── After landing ⇒ accepted ──
echo "【E6】Accumulated artifact landed in §5 ⇒ accepted, run advances (expected exit=0)"
# After E5 fails the run stops at "stopped" ⇒ resume first (otherwise the receipt cannot be collected)
node "$EX" resume --root "$WB" --run "$RUN" >/dev/null 2>&1
python3 - "$WB/scenes/demo-scene/scene-private-memory.md" <<'PY'
import sys
p=sys.argv[1]; t=open(p).read()
if 'The old map backup is safe to delete' not in t:
    t=t.replace("## §5 Decisions and Pitfalls (append only)\n","## §5 Decisions and Pitfalls (append only)\n\n- The old map backup is safe to delete, but confirm nobody is running that world first\n")
open(p,'w').write(t)
PY
out="$(node "$EX" receipt --root "$WB" --run "$RUN" --receipt "$WORK/receipt-1-not-landed.md" 2>&1)"; rc=$?
if [ "$rc" = 0 ] && echo "$out" | grep -q "advanced to step2"; then
  ok "Valid receipt accepted, run advanced to step2"
else
  bad "Valid receipt did not pass" "$out"
fi
echo

# ── E7 The artifact travels across scenes ──
echo "【E7】Step 1 accumulable artifact ⇒ carried into step 2's dispatch (a different scene) (expected exit=0)"
out="$(node "$EX" step --root "$WB" --run "$RUN" 2>&1)"
if echo "$out" | grep -q "Carried the previous hop's accumulable artifact"; then
  ok "step2 dispatch carries step1 accumulable artifact"
else
  bad "The artifact did not travel across scenes" "$out"
fi
if echo "$out" | grep -q "The old map backup is safe to delete"; then
  ok "The dispatch really carries the previous hop's accumulable artifact"
else
  bad "The dispatch has no accumulable artifact" "$out"
fi
echo

# ── E8 The gate intercepts ──
echo "【E8】Step 2 is a gate ⇒ stop and wait after collecting the receipt (expected exit=0 + stop)"
python3 - "$WB/scenes/cleanup-scene/scene-private-memory.md" <<'PY'
import sys
p=sys.argv[1]; t=open(p).read()
if 'Only delete after an lsof check' not in t:
    t=t.replace("## §5 Decisions and Pitfalls (append only)\n","## §5 Decisions and Pitfalls (append only)\n\n- Only delete after an lsof check, and only if it is over 1GB\n")
open(p,'w').write(t)
PY
cat > "$WORK/receipt-2.md" <<'EOF'
【cleanup-scene · Receipt】

Conclusion: cleanup is done
Evidence: free 2.5Gi → 4.1Gi
Path: scenes/cleanup-scene/project-memory/disk-cleanup.md

### Diff Set
- free  2.5Gi → 4.1Gi（+1.6Gi）

### Accumulable Artifact
- Only delete after an lsof check, and only if it is over 1GB

### Next Handoff
- report-scene
EOF
out="$(node "$EX" receipt --root "$WB" --run "$RUN" --receipt "$WORK/receipt-2.md" 2>&1)"; rc=$?
if [ "$rc" = 0 ] && echo "$out" | grep -q "run stops at step"; then
  ok "The gate step stops and waits after collecting the receipt"
else
  bad "The gate did not intercept" "$out"
fi
st="$(node "$EX" status --root "$WB" 2>&1)"
if echo "$st" | grep -q "waiting-for-gate"; then
  ok "Status shows waiting-for-gate"
else
  bad "Status is not waiting-for-gate" "$st"
fi
echo

# ── E10 A dispatch without criteria cannot be sent ──
echo "【E10】dispatch missing criteria ⇒ blocked (expected exit=1)"
cat > "$WORK/dispatch-bad.md" <<'EOF'
【cleanup-scene · Dispatch · please reply with a receipt】

What:
  Clean up the releasable items

Output Location:
  scenes/cleanup-scene/project-memory/disk-cleanup.md

Receipt Format:
  ① Conclusion + Evidence + Path
  ② Must carry the "Diff Set"
  ③ Must carry the "Accumulable Artifact"
  ④ Must state the "Next Handoff"
EOF
out="$(node "$HERE/verify-dispatch.mjs" --root "$WB" --dispatch "$WORK/dispatch-bad.md" 2>&1)"; rc=$?
if [ "$rc" = 1 ] && echo "$out" | grep -q "missing required field"; then
  ok "A dispatch missing criteria is blocked"
else
  bad "A dispatch missing criteria was not blocked" "$out"
fi

cat > "$WORK/dispatch-good.md" <<'EOF'
【cleanup-scene · Dispatch · please reply with a receipt】

What:
  Clean up the releasable items

Criteria:
  Actually free at least 1 GB and list what was deleted in the receipt

Output Location:
  scenes/cleanup-scene/project-memory/disk-cleanup.md

Receipt Format:
  ① Conclusion + Evidence + Path
  ② Must carry the "Diff Set"
  ③ Must carry the "Accumulable Artifact"
  ④ Must state the "Next Handoff"
EOF
out="$(node "$HERE/verify-dispatch.mjs" --root "$WB" --dispatch "$WORK/dispatch-good.md" 2>&1)"; rc=$?
if [ "$rc" = 0 ] && echo "$out" | grep -q "Dispatch accepted"; then
  ok "Valid dispatch passes"
else
  bad "Valid dispatch did not pass" "$out"
fi
echo

# ── E9 Continue only after the gate is confirmed ──
echo "【E9】After the gate is confirmed ⇒ advance to step3 (expected exit=0)"
out="$(node "$EX" resume --root "$WB" --run "$RUN" --gate-passed 2>&1)"; rc=$?
if [ "$rc" = 0 ] && echo "$out" | grep -q "advanced to step3"; then
  ok "After confirming the gate, advanced to step3"
else
  bad "After confirming the gate, it did not advance" "$out"
fi
echo

echo "═══ Result: $pass passed, $fail failed ═══"
rm -rf "$WORK"
[ "$fail" = 0 ] && exit 0 || exit 1

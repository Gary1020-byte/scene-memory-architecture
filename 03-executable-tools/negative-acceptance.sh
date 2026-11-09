#!/usr/bin/env bash
# Negative Acceptance — prove that it fails when it should
#
# Only seeing "the happy path passes" is not verification. You must prove that when you
# deliberately break things, the tool blocks them and returns a non-zero exit code.
#
# Usage: bash negative-acceptance.sh
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
WORK="$ROOT/04-templates/demo-workbench"
TOOL="$HERE/scene-memory.mjs"
SCENE="demo-scene"
MEM="$WORK/scenes/$SCENE/scene-private-memory.md"

pass=0; fail=0

# Before each test, restore demo-scene to its clean state
reset_scene() {
  rm -rf "$WORK"
  cp -r "$ROOT/04-templates/demo-workbench.clean" "$WORK"
}

run_check() { node "$TOOL" check --scene "$SCENE" --root "$WORK" 2>&1; }

expect() {  # expect <desc> <expected exit> <keyword>
  local desc="$1" want="$2" kw="$3" out rc
  out="$(run_check)"; rc=$?
  if [ "$rc" = "$want" ] && echo "$out" | grep -q -- "$kw"; then
    echo "  ✓ $desc"; pass=$((pass+1))
  else
    echo "  ✗ $desc"; echo "     expected exit=$want containing "$kw", got exit=$rc"
    echo "$out" | sed 's/^/     /' | head -6
    fail=$((fail+1))
  fi
}

echo "═══ Negative Acceptance: the validator must prove that it fails when it should ═══"
echo

echo "【V8】Normal data should pass (expected exit=0)"
reset_scene
expect "Normal scene passes all checks" 0 "All checks passed"

echo
echo "【V1】§0 blown past the 4 KB hard limit (expected exit=1)"
reset_scene
{ echo "## §0 Current Handover (≤4 KB, read this first in a new session)"; echo; echo "### 1) Last Handover"
  for i in $(seq 1 200); do echo "- filler line $i: this is deliberate padding to push the handover section past the 4096-byte hard limit."; done
} > /tmp/sec0.bak
# Replace the whole subsection, keep the others
node -e '
const fs=require("fs");
const p=process.argv[1];
let t=fs.readFileSync(p,"utf8");
const h=t.search(/^## §0/m);
const rest=t.slice(h);
const n=rest.indexOf("\n## ",5);
const body=rest.slice(0,n>0?n:rest.length);
const fill=fs.readFileSync("/tmp/sec0.bak","utf8");
t=t.slice(0,h)+fill+"\n"+t.slice(h+body.length);
fs.writeFileSync(p,t);
' "$MEM"
expect "§0 over hard limit blocked" 1 "over 4 KB"

echo
echo '【V2】Delete the "### 4) Next Steps / Blockers" subsection (expected exit=1)'
reset_scene
node -e '
const fs=require("fs");const p=process.argv[1];
let t=fs.readFileSync(p,"utf8");
t=t.replace(/### 4\) Next Steps \/ Blockers[\s\S]*?(?=\n### )/,"");
fs.writeFileSync(p,t);
' "$MEM"
expect "Missing §0 subsection is blocked" 1 "missing subsection"

echo
echo "【V3】Change the locator card without restamping the identity card ⇒ stale fingerprint (expected exit=1)"
reset_scene
echo "<!-- sneaky edit -->" >> "$WORK/scenes/$SCENE/locator-card.md"
expect "Stale card fingerprint is blocked" 1 "Card fingerprint stale"

echo
echo '【V5】Delete the whole "## Core Responsibilities" block (expected exit=1)'
reset_scene
node -e '
const fs=require("fs");const p=process.argv[1];
let t=fs.readFileSync(p,"utf8");
t=t.replace(/## Core Responsibilities[\s\S]*?(?=\n## §1)/,"");
fs.writeFileSync(p,t);
' "$MEM"
expect "Missing core responsibilities blocked" 1 "Core Responsibilities"

echo
echo "【V6】Core responsibilities has only 2 items (expected exit=1)"
reset_scene
node -e '
const fs=require("fs");const p=process.argv[1];
let t=fs.readFileSync(p,"utf8");
t=t.replace(/## Core Responsibilities[\s\S]*?(?=\n## §1)/,"## Core Responsibilities\n\n- Owns: only one item\n- Does not touch: only two items\n\n");
fs.writeFileSync(p,t);
' "$MEM"
expect "Too few core responsibilities blocked" 1 "at least 3"

echo
echo "【V9】Scene directory has no boundary marker (neither .git nor .git-marker ⇒ the scene boundary breaks ⇒ expected exit=1)"
reset_scene
node "$HERE/remove-boundary-marker.mjs" "$WORK/scenes/$SCENE"
expect "Missing boundary marker is blocked" 1 "Scene directory is missing .git"

echo
echo "【V10】This scene is not in the identity index (expected exit=1)"
reset_scene
node -e '
const fs=require("fs");const p=process.argv[1];
let t=fs.readFileSync(p,"utf8");
t=t.replace(/^\| `demo`.*$/m,"");
fs.writeFileSync(p,t);
' "$WORK/scenes/_scene-identity-index.md"
expect "Scene absent from the index is blocked" 1 "This scene is not in the identity index"

echo
echo "【V11】Locator card column points at a file that does not exist (expected exit=1)"
reset_scene
node -e '
const fs=require("fs");const p=process.argv[1];
let t=fs.readFileSync(p,"utf8");
t=t.replace("scenes/demo-scene/locator-card.md","scenes/demo-scene/missing.md");
fs.writeFileSync(p,t);
' "$WORK/scenes/_scene-identity-index.md"
expect "Missing locator card blocked" 1 "Locator card does not exist"

echo
echo '【V7】Project memory has an entry but the current projects table says "none" (expected exit=0 + warning)'
reset_scene
echo "# test-project" > "$WORK/scenes/$SCENE/project-memory/test-project.md"
out="$(run_check)"; rc=$?
if [ "$rc" = 0 ] && echo "$out" | grep -q "Current projects table says"; then
  echo "  ✓ warning（exit=0）"; pass=$((pass+1))
else
  echo "  ✗ warning"; echo "$out" | sed 's/^/     /' | head -5; fail=$((fail+1))
fi

echo
echo "【V18】Scene directory has a second memory file (orphan) ⇒ must be blocked"
reset_scene
cp "$WORK/scenes/$SCENE/scene-private-memory.md" "$WORK/scenes/$SCENE/demo-scene-private-memory.md"
expect "Orphan memory file is blocked" 1 "orphan memory file"
reset_scene
ln "$WORK/scenes/$SCENE/scene-private-memory.md" "$WORK/scenes/$SCENE/demo-scene-private-memory.md"
expect "Second memory file (hard link) is blocked" 1 "second memory file"
reset_scene

echo
echo "═══ Workflow Validation (V12–V14) ═══"

WFTOOL="$HERE/verify-workflow.mjs"
WFWORK="$(mktemp -d)"
mkdir -p "$WFWORK/workflows"

wf_expect() {  # wf_expect <desc> <expected exit> <keyword> <yaml content>
  local desc="$1" want="$2" kw="$3" content="$4" out rc
  printf '%s\n' "$content" > "$WFWORK/workflows/test.yaml"
  out="$(node "$WFTOOL" --root "$WFWORK" 2>&1)"; rc=$?
  if [ "$rc" = "$want" ] && echo "$out" | grep -q -- "$kw"; then
    echo "  ✓ $desc"; pass=$((pass+1))
  else
    echo "  ✗ $desc"; echo "     expected exit=$want containing "$kw", got exit=$rc"
    echo "$out" | sed 's/^/     /' | head -6
    fail=$((fail+1))
  fi
}

wf_expect "Workflow missing required fields is blocked" 1 "missing required fields" 'id: broken
name: broken workflow'

wf_expect "Step missing scene is blocked" 1 "missing scene" 'id: broken
name: broken workflow
version: 1
steps:
  - purpose: this step has no scene
    criteria: this criterion is long enough to pass the length check'

wf_expect "Invalid needsConfirmation value is blocked" 1 "can only be true / false" 'id: broken
name: broken workflow
version: 1
steps:
  - scene: scene-c
    purpose: cleanup
    criteria: actually free 1 GB and list what was deleted
    needsConfirmation: maybe'

wf_expect "Invalid failureStrategy value is blocked" 1 "failureStrategy can only be" 'id: broken
name: broken workflow
version: 1
steps:
  - scene: scene-c
    purpose: cleanup
    criteria: actually free 1 GB and list what was deleted
    failureStrategy: whatever'

wf_expect "Valid workflow passes (exit=0)" 0 "All checks passed" 'id: good
name: good workflow
version: 1
steps:
  - scene: scene-c
    purpose: cleanup
    criteria: actually free 1 GB and list what was deleted
    needsConfirmation: true
    failureStrategy: stop-and-wait'

rm -rf "$WFWORK"

echo
echo "═══ Add-Scene Tool (V15–V17) ═══"

NSTMP="$(mktemp -d)"
mkdir -p "$NSTMP/scenes"
cat > "$NSTMP/scenes/_scene-identity-index.md" <<'EOF'
# Scene Identity Index

| Scene ID | Panel ID | Panel Title | Session Name | Session ID | Locator Card | Main Skill |
|---|---|---|---|---|---|---|
EOF

ns_expect() {  # ns_expect <desc> <expected exit> <keyword> <command...>
  local desc="$1" want="$2" kw="$3"; shift 3
  local out rc
  out="$("$@" 2>&1)"; rc=$?
  if [ "$rc" = "$want" ] && echo "$out" | grep -q -- "$kw"; then
    echo "  ✓ $desc"; pass=$((pass+1))
  else
    echo "  ✗ $desc"; echo "     expected exit=$want containing "$kw", got exit=$rc"
    echo "$out" | sed 's/^/     /' | head -6
    fail=$((fail+1))
  fi
}

ns_expect "Add-scene creates the skeleton" 0 "git init (scene boundary)" \
  node "$HERE/add-scene.mjs" --root "$NSTMP" --id t1 --name test-scene-one --duties "a;b;c"

ns_expect "New scene has the full six-piece set" 0 "All checks passed" \
  bash -c "node '$HERE/scene-memory.mjs' stamp --scene test-scene-one --root '$NSTMP' >/dev/null 2>&1; node '$HERE/scene-memory.mjs' check --scene test-scene-one --root '$NSTMP'"

ns_expect "already exists, not overwritten" 0 "already exists, not overwritten" \
  node "$HERE/add-scene.mjs" --root "$NSTMP" --id t1 --name test-scene-one --duties "a;b;c"

ns_expect "Reports a usage error when --id or --name is missing" 2 "Need --id and --name" \
  node "$HERE/add-scene.mjs" --root "$NSTMP"

rm -rf "$NSTMP"

echo
echo "═══ Session Switch (V18–V21) ═══"

SCTMP="$(mktemp -d)"
cp -r "$ROOT/04-templates/demo-workbench.clean"/* "$SCTMP/" 2>/dev/null || true
# The demo scene config json and the §0 signature ship with the clean copy; add a readable next step
python3 - "$SCTMP/scenes/demo-scene/scene-private-memory.md" <<'PYEOF' 2>/dev/null || true
import sys, re
p = sys.argv[1]
t = open(p, encoding='utf-8').read()
if '- Next step: ' not in t:
    t = re.sub(r'### 4\) Next Steps \/ Blockers\n', '### 4) Next Steps / Blockers\n- Next step: run check once\n', t)
    open(p, 'w', encoding='utf-8').write(t)
PYEOF

swap_expect() {  # swap_expect <desc> <expected exit> <keyword> <command...>
  local desc="$1" want="$2" kw="$3"; shift 3
  local out rc
  out="$("$@" 2>&1)"; rc=$?
  if [ "$rc" = "$want" ] && echo "$out" | grep -q -- "$kw"; then
    echo "  ✓ $desc"; pass=$((pass+1))
  else
    echo "  ✗ $desc"; echo "     expected exit=$want containing "$kw", got exit=$rc"
    echo "$out" | sed 's/^/     /' | head -8
    fail=$((fail+1))
  fi
}

swap_expect "Self-check passes when all three match" 0 "All checks passed" \
  node "$HERE/switch-session.mjs" check --root "$SCTMP" --scene demo-scene

# Deliberately change only one of the three ⇒ must be blocked
python3 - "$SCTMP/scenes/_scene-identity-index.md" <<'PYEOF' 2>/dev/null || true
import sys
p = sys.argv[1]
t = open(p, encoding='utf-8').read().replace('session-demo0001', 'session-demo0002')
open(p, 'w', encoding='utf-8').write(t)
PYEOF
swap_expect "Syncing only one is blocked (the three disagree)" 1 "session ids do not match" \
  node "$HERE/switch-session.mjs" check --root "$SCTMP" --scene demo-scene

# Restore it, then verify "the specified new session id matches everywhere"
cp "$ROOT/04-templates/demo-workbench.clean/scenes/_scene-identity-index.md" "$SCTMP/scenes/_scene-identity-index.md"
swap_expect "The specified new session id matches everywhere" 0 "synced" \
  node "$HERE/switch-session.mjs" check --root "$SCTMP" --scene demo-scene --new-session-id session-demo0001

swap_expect "One of the three not changed ⇒ blocked" 1 "Not the new session id" \
  node "$HERE/switch-session.mjs" check --root "$SCTMP" --scene demo-scene --new-session-id session-demo0002

# ★ All three match, but the bound session was archived by the engine ⇒ the panel points at a dead session ⇒ must be blocked
#   (same symptom as "one sync point missed", different root cause ⇒ must be checked separately)
cat > "$SCTMP/engine-state.json" <<'EOF'
{
  "description": "Engine state file (for testing)",
  "archived-sessions": ["session-demo0001"]
}
EOF
swap_expect "All three match but the session is archived ⇒ blocked" 1 "has been archived" \
  node "$HERE/scene-memory.mjs" check --scene demo-scene --root "$SCTMP"
rm -f "$SCTMP/engine-state.json"

# §0 is at the hard limit ⇒ writing the signature after the switch overflows it ⇒ must block before switching
cp "$ROOT/04-templates/demo-workbench.clean/scenes/demo-scene/scene-private-memory.md" "$SCTMP/scenes/demo-scene/scene-private-memory.md"
python3 - "$SCTMP/scenes/demo-scene/scene-private-memory.md" <<'PYEOF' 2>/dev/null || true
import sys, re
p = sys.argv[1]
t = open(p, encoding='utf-8').read()
# Fill to about 4090 B (adding the signature would exceed 4096)
h = t.index('## §0')
e = t.index('\n## ', h + 5)
fill = '\n- ' + ('x' * 3900)
t = t[:e] + fill + t[e:]
open(p, 'w', encoding='utf-8').write(t)
PYEOF
swap_expect "§0 at the hard limit is blocked (the switch would overflow it)" 1 "will exceed the hard limit after the switch" \
  node "$HERE/switch-session.mjs" plan --root "$SCTMP" --scene demo-scene

rm -rf "$SCTMP"

echo
echo "═══ Session Archive Layer (V22–V25) ═══"

AFTMP="$(mktemp -d)"
mkdir -p "$AFTMP/scene"
cat > "$AFTMP/scenes/_scene-identity-index.md" <<'EOF'
# Scene Identity Index

| Scene ID | Panel ID | Panel Title | Session Name | Session ID | Locator Card | Main Skill |
|---|---|---|---|---|---|---|
EOF
cat > "$AFTMP/export.json" <<'EOF'
{
  "sessionId": "session-test0001",
  "sessionName": "test-scene",
  "sceneid": "test-scene",
  "Start Time": "2026-11-02T10:00:00+08:00",
  "message": [
    { "role": "user", "text": "do a thing" },
    { "role": "assistant", "text": "done" }
  ]
}
EOF

swap_expect "Extract session → produce file and index" 0 "Extracted" \
  node "$HERE/session-archive.mjs" extract --root "$AFTMP" --engine-export "$AFTMP/export.json" --scene demo-scene

swap_expect "Index file exists and is listed" 0 "test0001" \
  node "$HERE/session-archive.mjs" list --root "$AFTMP"

swap_expect "Session archive layer check passed" 0 "all checks passed" \
  node "$HERE/session-archive.mjs" check --root "$AFTMP"

# Index points at a missing file ⇒ blocked
python3 - "$AFTMP/session-archive/_session-archive-index.md" <<'PYEOF' 2>/dev/null || true
import sys
p = sys.argv[1]
lines = open(p, encoding='utf-8').read().split('\n')
for i, l in enumerate(lines):
    if l.startswith('| ') and 'session-archive/' in l:
        cells = l.split('|')
        cells[6] = ' session-archive/test-scene/missing.md '
        lines[i] = '|'.join(cells)
        break
open(p, 'w', encoding='utf-8').write('\n'.join(lines))
PYEOF
swap_expect "Index pointing at a missing file is blocked" 1 "Index points at a file that does not exist" \
  node "$HERE/session-archive.mjs" check --root "$AFTMP"

rm -rf "$AFTMP"

echo
echo "═══ Result: $pass passed, $fail failed ═══"
rm -rf "$WORK"; cp -r "$ROOT/04-templates/demo-workbench.clean" "$WORK"
[ "$fail" = 0 ] && exit 0 || exit 1

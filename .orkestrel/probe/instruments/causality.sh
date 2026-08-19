#!/usr/bin/env bash
# Are the Probe/LintStage timeouts caused by O9-U2's change, or do they predate it?
#
# O9-U2 reported 2 failures in Probe.test.ts surviving isolation, and timeout markers in
# LintStage.test.ts — a file that never constructs RuntimeStage. That points away from its change,
# but the unit could not take the deciding reading: it held the working tree with its own edits in it.
#
# Two trees, same commands:
#   A. /workspace/probe  — O9-U2's tree (703bfe6 + its 2 modified files)
#   B. worktree at 703bfe6 — the baseline, before O9-U2 touched anything
#
# HARNESS CONTROL, first in each tree, outside the population under test: helpers.test.ts drives pure
# functions — no child process, no resident host, no tmp/probe — and has never timed out this
# campaign. It must pass. If it fails, the tree or its node_modules is broken and no reading below is
# usable.
set -uo pipefail
SP=/tmp/claude-0/-home-user-scaffold/75034726-f81c-5f56-9643-b4a6748f097d/scratchpad
LOG="$SP/causality.log"
WT=/tmp/probe-baseline-703bfe6
: >"$LOG"

run_tree() {
	local label="$1" dir="$2"
	echo "" >>"$LOG"
	echo "################ TREE $label : $dir ################" >>"$LOG"
	cd "$dir" || { echo "cd failed"; return 1; }
	git rev-parse --short HEAD >>"$LOG" 2>&1
	git status --short >>"$LOG" 2>&1

	echo "---- CONTROL helpers.test.ts (must pass) ----" >>"$LOG"
	npx vitest run --project src:server tests/src/server/helpers.test.ts >>"$LOG" 2>&1
	local control=$?
	echo "CONTROL_EXIT=$control" >>"$LOG"
	if [ "$control" -ne 0 ]; then
		echo "TREE $label: INSTRUMENT BROKEN — harness control failed. Readings below are unusable." >>"$LOG"
		return 1
	fi

	for f in tests/src/server/Probe.test.ts tests/src/server/stages/LintStage.test.ts; do
		echo "---- $f ----" >>"$LOG"
		local start; start=$(date +%s)
		npx vitest run --project src:server "$f" >>"$LOG" 2>&1
		echo "EXIT=$? ELAPSED=$(( $(date +%s) - start ))s" >>"$LOG"
	done
}

run_tree "A-o9u2" /workspace/probe

git -C /workspace/probe worktree remove --force "$WT" >/dev/null 2>&1
if git -C /workspace/probe worktree add --detach "$WT" 703bfe6 >>"$LOG" 2>&1; then
	ln -s /workspace/probe/node_modules "$WT/node_modules" 2>/dev/null
	run_tree "B-baseline" "$WT"
else
	echo "WORKTREE ADD FAILED" >>"$LOG"
fi

echo "=== SUMMARY ==="
grep -E '^################|^----|CONTROL_EXIT|Test Files|Tests  |EXIT=' "$LOG"

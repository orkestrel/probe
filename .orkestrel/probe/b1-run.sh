#!/usr/bin/env bash
set -uo pipefail
cd /workspace/probe || exit 1
exec codex exec \
  --json \
  -C /workspace/probe \
  --sandbox workspace-write \
  --model gpt-5.6-sol \
  -c model_reasoning_effort="high" \
  --output-last-message tmp/codex/b1-last.md \
  "Read and execute the brief at tmp/codex/b1-brief.md. Read AGENTS.md, .claude/rules/tests.md, and .claude/rules/typescript.md first. Perform the assignment directly and spawn nothing." \
  >> tmp/codex/b1.jsonl 2>> tmp/codex/b1.err

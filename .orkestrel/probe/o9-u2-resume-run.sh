#!/usr/bin/env bash
# Resume O9-U2 for its report only. Form validated in a throwaway probe first:
# `codex exec resume` takes no -C and no --sandbox; cwd comes from the process.
set -uo pipefail
cd /workspace/probe || exit 1
exec codex exec resume 01a01b7d-aaf6-7920-9a80-87e919a03d0a \
  --json \
  --model gpt-5.6-sol \
  -c model_reasoning_effort="high" \
  -o tmp/codex/o9-u2-resume-last.md \
  "Read and execute the brief at tmp/codex/o9-u2-resume-brief.md. It supersedes the remaining work in your original brief." \
  >> tmp/codex/o9-u2-resume.jsonl 2>> tmp/codex/o9-u2-resume.err

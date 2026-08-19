# Unit MCP-FRAME — does `@orkestrel/mcp` already publish what LintStage hand-rolls?

## Role and engine

`grok` — Cursor Grok, read-only. This is absorption and capability comparison over two published
surfaces, which is the tedious-work ladder's first step. Probe the bench at dispatch and report the
fallback if it is dark; do not substitute silently.

## Objective

Rule, with evidence, on whether probe's hand-rolled LSP message handling can be replaced by primitives
`@orkestrel/mcp` already publishes — and separately, whether it should be.

## The distinction that decides this, stated so it is not re-derived

Probe speaks **two** protocols and they are not the same protocol:

1. `src/server/stages/LintStage.ts` speaks **LSP to Oxlint** over a child process: JSON-RPC 2.0
   messages inside `Content-Length: N\r\n\r\n<body>` framing.
2. `src/bin/main.ts` speaks **newline-delimited JSON-RPC to the MCP client**.

They share a message envelope (JSON-RPC 2.0) and differ in framing. A verdict that conflates them is
wrong. Rule on the envelope and the framing separately.

## What to measure

Read the actual installed package, not the registry description:
`/workspace/probe/node_modules/@orkestrel/mcp/dist/src/**/*.d.ts` is the authoritative surface.

Answer each of these with a `file:line` pointer and the exact declaration:

1. **Envelope guards.** Does `@orkestrel/mcp` publish guards or parsers for the JSON-RPC 2.0 envelope
   — request, response, notification, error — that do not assume a framing? Name them exactly.
2. **Framing.** Does it publish anything that reads `Content-Length` framing, or only newline
   delimiting? Probe's own `parseContentLength` lives in `/workspace/probe/src/server/helpers.ts`.
   Quote both and say whether one subsumes the other.
3. **The consumer.** `LintStage.#read` (roughly line 196), `#frame` (roughly 201), and `#receive`
   (roughly 224) are the hand-rolled sites. For each, state which published primitive would replace it,
   or state that none would and why.
4. **Correctness delta.** Where a published primitive exists, does it handle a case probe's version
   gets wrong, or the reverse? Name the case. A swap that changes no behaviour is a rename, and
   `AGENTS.md` § Design laws refuses a wrapper that only renames.
5. **The environment boundary.** `@orkestrel/mcp` — is its relevant surface host-independent core, or
   server-only? Probe's `LintStage` is server code, so a server-only export is fine here; say which it
   is rather than assuming.

## Context

Read before acting: `/home/user/scaffold/AGENTS.md` § Non-negotiable rules and § Design laws, and
`/home/user/scaffold/.claude/rules/architecture.md` and `patterns.md`. The governing guide is
`/home/user/scaffold/PROBE.md`.

The working tree at `/workspace/probe` is at commit `e11c389`. **Unit S3 is writing
`src/server/stages/LintStage.ts` right now.** Read it, do not edit it, and expect its content to move
under you — anchor every claim to a quoted line rather than a line number alone.

## Unknowns

The Orchestrator does not know whether `@orkestrel/mcp`'s guards are framing-agnostic. That is the
question. If the package's surface makes the answer partly indeterminate — a guard that is
framing-agnostic in principle but documented only for one framing — say so as indeterminate rather
than picking a side.

## Scope

Read-only. You have `Bash`, `Read`, `Grep`, `Glob`. Edit and Write are not in your allowlist and you
need neither. Do not write a report file — return your findings as your result text. Do not run any
command that writes to `/workspace/probe`.

## Execution

Perform this assignment directly. Spawn nothing.

## Output

1. **Verdict** — one of ADOPT, ADOPT IN PART, REJECT, INDETERMINATE, with one sentence.
2. **The five answers** — numbered as in the preceding list, each with its `file:line` and quoted
   declaration.
3. **If ADOPT or ADOPT IN PART** — the exact sites that change and the exact import to add.
4. **Bench** — which engine actually ran this, and the journal path and session id if it crossed a
   bridge.

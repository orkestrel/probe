Implemented the coordinator, runtime recycling, MCP transport, entry, and barrel. Functional criteria 2–5 are proven. Acceptance criterion 1 remains blocked by an existing sandbox `EPERM` in the config test.

### Files written

- [Probe.ts](/workspace/probe/src/server/Probe.ts) — coordinates warming, arming, deadlines, verdicts, receipts, events, and teardown.
- [factories.ts](/workspace/probe/src/server/factories.ts) — creates probes and the dual-era MCP stdio server with raw formatted verdict text.
- [RuntimeStage.ts](/workspace/probe/src/server/stages/RuntimeStage.ts) — cancels without awaiting, closes Vitest, and abandons hung inspections.
- [types.ts](/workspace/probe/src/server/types.ts) — documents abandonment during stage destruction.
- [index.ts](/workspace/probe/src/server/index.ts) — exports the complete server surface through star exports.
- [main.ts](/workspace/probe/src/bin/main.ts) — starts the stdio server without module-scope declarations.
- [index.test.ts](/workspace/probe/tests/src/server/index.test.ts) — asserts the complete server export population.

All throwaway files under `tmp/probe/` were deleted.

### Validation

- `npm run format:check` — exit 0.
- `npm run lint:check` — exit 0.
- `npm run check` — exit 0.
- `npm run build` — exit 0.
- `npm test` — exit 1.
  - Source: 3 files, 5 tests passed.
  - Policy: 86 tests passed.
  - Config: 27 passed, 1 failed with `spawnSync /workspace/probe/node_modules/.bin/oxlint EPERM`.

### Acceptance evidence

`node tmp/probe/direct.mjs` printed:

```text
CRITERIA_2 case=type,lint,runtime control=type,lint,runtime toolchain={"typescript":"6.0.3","oxlint":"1.79.0","vitest":"4.1.11"}
CRITERIA_3 receipt=true
CRITERIA_5 receipt=true
DEADLINE rejected=true elapsed=5014ms expiries=1 survived=true
```

This proves six checks per verdict, toolchain reporting, conditional receipts, bounded rejection, runtime recycling, and successful use after expiry.

`timeout 20s node dist/bin/main.js < tmp/probe/request.ndjson` printed successful responses for:

- Legacy `initialize`: server `probe`, version `0.0.1`.
- Legacy `tools/list`: one `prove` tool with the compiled claim schema.
- Modern `tools/list`: one `prove` tool using all three required metadata keys.
- Legacy `tools/call`: raw `formatVerdict` text with three case checks, three control checks, and a receipt.

The command exited 124 after all responses because the resident server was deliberately time-capped.

### Deviation

Expected: `npm test` exits 0.

Found: the existing off-limits config proof fails when Node calls `spawnSync` on `node_modules/.bin/oxlint`.

Evidence: isolated `npm run test:config` reproduced the same `EPERM`; invoking `node_modules/.bin/oxlint --version` directly from the shell exits 0.

Done: implementation and criteria 2–5 are complete. Criterion 1 is not complete.

Hypothesis: the managed sandbox refuses that nested direct executable invocation.

### Decisions left open by the brief

- The default runtime deadline is 30,000 ms, matching the public contract example.
- MCP identity version comes from `package.json`.
- The MCP execution seam formats the verdict into a raw text content block; returning a plain string would JSON-quote it.
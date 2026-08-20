# Protocol revision audit for the probe stdio server

The owner asked which Model Context Protocol revision serves probe best over stdio, measured for
compatibility and performance. The audit ran 2026-08-20.

## Ruling

Keep stdio, keep the dual-era composition probe ships
(`createStdioServer(createMCPLegacy(createMCPServer(…)))`), and treat 2026-07-28 as the preferred
negotiated era with `initialize` retained for 2025-11-25 and 2025-06-18. No probe code change
closes this audit: the shipped shape is the one the evidence selects.

## Compatibility, from cited primary-source research

The native researcher lane established, with citations retained in the campaign record
(`protocol-research.md`):

- Claude Code probes `server/discover` on every stdio connection (changelog entries through
  2026-08-20) and falls back to legacy `initialize` — probe's flagship client negotiates the
  modern era when the server offers it.
- The `mcp` Python SDK v2 client defaults to the same probe-then-fallback shape.
- The `@modelcontextprotocol/sdk` TypeScript client still sends a legacy `initialize` by default
  (modern negotiation is opt-in), and VS Code Copilot Chat is verified at `2025-11-25`; Claude
  Desktop was verified at `2025-11-25` in April 2026 with its current state unestablished.
- The 2026-07-28 specification's own matrix: a legacy client against a modern-only server fails
  with no fall-forward, and a modern client against a legacy-only server fails unless it probes
  first.

A modern-only server therefore refuses a meaningful share of real clients, a legacy-only server
forfeits the era Claude Code negotiates, and only the dual-era shape covers every verified
client.

## Performance, measured

The instrument (`protocol-instrument/`, retained beside this record) drove probe's built bin —
rebuilt at commit b144090, server side on registry `@orkestrel/mcp` 0.0.19 — with the packed
HS-U1 client, one process per reading, revisions interleaved round-robin so host load biased
each equally: 10 rounds over unpinned, pinned 2026-07-28, pinned 2025-11-25, and pinned
2025-06-18, each round one cold spawn, one connect, and a run of `tools()` calls. Medians,
2026-08-20:

```text
{"revision":"unpinned","runs":10,"completed":10,"negotiated":["2026-07-28"],"connectMedianMs":2263.4,"listMedianMs":5.91,"failures":[]}
{"revision":"2026-07-28","runs":10,"completed":10,"negotiated":["2026-07-28"],"connectMedianMs":2296.7,"listMedianMs":6.01,"failures":[]}
{"revision":"2025-11-25","runs":10,"completed":10,"negotiated":["2025-11-25"],"connectMedianMs":2264,"listMedianMs":6.01,"failures":[]}
{"revision":"2025-06-18","runs":10,"completed":10,"negotiated":["2025-06-18"],"connectMedianMs":2233.2,"listMedianMs":5.48,"failures":[]}
```

- Connect medians sit between 2233ms and 2297ms across every era; the bin's own boot dominates
  and the spread is within run-to-run noise, so no era carries a measurable connect penalty.
- Per-request medians sit between 5.48ms and 6.01ms across every era. The modern era's
  per-request `_meta` carriage (the wire taps in `handshake-evidence/` show the fixed metadata
  block each modern request carries) does not surface at stdio round-trip scale.
- The unpinned client negotiated 2026-07-28 in 10 of 10 cold spawns — the modern default lands
  in practice with the HS-U1 client, where the pre-fix client with a configured timeout silently
  downgraded to 2025-11-25 (measured in `handshake-evidence/`).

## What this closes and what it does not

- Closed: the revision question. The dual-era posture stays, 2026-07-28 is what a current
  Claude Code negotiates against probe, and the legacy pins remain proven end to end by the
  driven-client tests landed in PBFIX13 and PBFIX15.
- Closed: the transport question as asked. stdio is the deployment probe documents, every
  verified client speaks it, and nothing in the evidence argues for a second transport.
- Outside this audit: the mcp handshake fixes (HS-U1 through U4) that make the negotiation
  behavior exact; they carry their own campaign record in the mcp repository.

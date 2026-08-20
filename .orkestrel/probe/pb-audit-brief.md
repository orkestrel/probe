# PB-AUDIT — falsify the probe campaign

## Role and engine

`analyst` (GPT-5.6 Sol), through `codex exec`. Perform the assignment directly and spawn nothing.

Claude Opus 5 wrote PB4, PB5, PB6, PB7, and PB9. Opus cannot audit them, so this lane is Sol. PB8 was
written by Sol and is audited separately by an Opus lane; do not rule on it here except where a later
unit changed what it landed.

## Objective

Return a per-claim verdict on the numbered claims below. CONFIRMED only with evidence a reader can
re-derive. FAIL with the contradiction at `file:line`. UNPROVEN where the evidence cannot settle it —
say what would.

## Context

`/workspace/probe`, `@orkestrel/probe` 0.0.1, **never published**. This is a first release, so every
contract here is still free to change and nothing is owed backward compatibility.

Review evidence:

- `.orkestrel/probe/pb-audit-diff.txt` — the complete campaign diff, `be30096..HEAD`, 8,105 lines.
- `.orkestrel/probe/pb9-reconciliation.md` — the design round behind PB9, with the measurement that decides it.
- `.orkestrel/probe/pd-a-carry-check.md` — the sweep the repair rows came from.
- `.orkestrel/probe/prune-disposition.md` — what this campaign deliberately did not do, and why.

Read the working tree for anything the diff does not settle. `guides/probe.md` is the consumer
contract; read it as a consumer would.

Governing files: `AGENTS.md`, then `.claude/rules/` — `names.md`, `typescript.md`, `architecture.md`,
`patterns.md`, `tests.md`, `documentation.md`, `writing.md`.

Gate evidence, taken by an independent verifier on the host on 2026-08-20, all exit 0: `format:check`,
`lint:check`, `check`, `build`, `test`, `test:distribution`, `scaffold audit`. Source 146 across 12
files, policy 86, config 28, guides 9, distribution 2, zero drift across 127 planned paths.

## The claims

1. A receipt binds the claim's own digest and the project that judged it, so two honest runs of one claim in one workspace return byte-identical tokens and a caller-chosen project cannot mint a token the workspace's own project refuses.
2. `TypeStage` implements a declared interface, and `resolve` refuses a stage that has been destroyed.
3. Every stage is replaced after a deadline expiry, and `expire` fires only once a replacement is installed.
4. `LintStage.destroy()` settles against a server that answers `shutdown` and ignores `exit`, within a stated bound.
5. An arming failure is distinguishable from a claim's own stage failure, and a later `prove` re-arms rather than failing permanently.
6. The runtime stage sweeps only specifications whose writing process is gone, and a live sibling's file survives.
7. `guides/probe.md` states no number copied from the deleted `PROBE.md`; every figure is read from shipped source or measured with its date.
8. The guide's documented claim, run verbatim, earns a receipt, and the same literal is pinned in the guide, the `Claim` `@example`, and the test with a parity assertion refusing any difference.
9. Every barrelled export carries an `@example`, and the guides gate fails if one does not.
10. `Overlay` is interned rather than barrelled, and the parity gate fails if it returns to the barrel.
11. Every TSDoc statement PB7 repaired is now true of the code: the revalidation sweep's key, `inferTestProject`'s return, `Finding.line`, `Finding.path`, and the `Verdict` example's `elapsed` floor.
12. A workspace reached through a symlink no longer leaks an internal revision path into a finding.
13. Exactly one `normalizePath` exists and every caller routes through it.
14. `ProbeServerInterface` is `start()` and `destroy()`, `createProbeServer` creates the probe it serves, and `src/bin/main.ts` is one import plus one expression statement.
15. Vitest's termination listeners are stripped at each `createVitest` call, by identity rather than by name, and the strip survives a stage recycle.
16. A spawned entry signalled during boot and when armed leaves `tmp/probe` empty and exits 0.
17. `destroy()` returns the process without an explicit exit, because the server releases the transport's stdin listeners itself.

## The open lens

After the numbered claims, answer: **what did this campaign change that no claim above covers, and is
it right?** Number these continuing from 18.

Look hardest where an Opus-written unit is least likely to have audited itself:

- **The published surface as a whole.** This package has never shipped. Read `src/core/index.ts` and `src/server/index.ts` as a first release rather than as a diff: is every export one a consumer needs, is anything missing that the guide implies, and does the naming hold together across core and server?
- **PB9's exit decision.** It overruled its own brief and left `process.exit()` out, arguing the server now detaches the transport's listeners itself. Its brief said to include it. Rule on which is right, and say what would falsify your answer.
- **The guide against the code**, sentence by sentence, for the claims no gate executes. `.claude/rules/documentation.md` is explicit that asserting a sentence appears is not asserting it is true.
- **The receipt's threat model.** A receipt is meant to be quotable away from its verdict. Say what a hostile claimant can still make one say.

## Standing conditions

- A bench sandbox denies a grandchild process and a nested `npm install`. This package's suite needs both. Do not run the gates as verification; they are supplied above. Where you need execution to settle a claim and the sandbox denies it, say so and name the exact settling command.
- Do not edit any file.

## Scope

Read-only.

## Execution

Perform this assignment directly. Spawn nothing.

## Output

One section per claim, in number order:

```
### Claim N
Verdict: CONFIRMED | FAIL | UNPROVEN
Evidence: file:line, and what it shows
```

Then:

- `## Continuing findings` — numbered from 18, each a falsifiable claim with its `file:line`.
- One terminal line, exactly `VERDICT: PASS` or `VERDICT: FAIL`.

No process diary.

# PB6 amendment — what `guides/probe.md` carries out of `PROBE.md`, and what it must not

This amends `pb6-brief.md` with the result of the PD-C survey, retained beside it as
`pd-c-probe-md-survey.md`. The original brief named `PROBE.md` and `probe-md-worklist.md` as the
sources for `guides/probe.md`. The survey changes three things about that instruction.

## 1. The measurement corpus does not survive

`PROBE.md` states over seventy figures. **Two carry a date.** Every other number — the latency
table at `:76-79`, the per-stage figures at `:241-243` and `:279-281`, the resident-set readings, the
transport comparisons, the pool-mode table — records no date and no host.

`.agents/orchestration.md` § Before you prune fixes what happens to them: a number the guide carries
out of a campaign folder carries the date it was taken, and a measurement whose date the folder never
recorded is re-taken or dropped, never copied.

**So: carry no number out of `PROBE.md`.** Decide instead which figures a consumer needs, measure
those on the host, and state each with its date and the host it was taken on. The consumer needs two:

- **Boot cost**, because a client whose timeout is tighter than boot reports a hang that is a wait.
- **One `prove` cost**, because a harness budgeting a call needs it.

Everything else is a design-round comparison between options that no longer exist. It is narrative,
and it dies with the file.

The two dated figures are at `:215-219` and `:229`, both 2026-08-18, both about `npm run test:probe`
rather than about the shipped surface. `.claude/rules/quality.md` § Instruments: measure the product,
not the harness. They do not carry either.

## 2. Four sections are superseded, and the guide must not restate them

The survey cites the contradiction for each. Do not carry any of them, and do not carry a softened
version:

| `PROBE.md` section | Lines | Contradicted by |
| ------------------ | ----- | --------------- |
| Why the instrument pair is the recommendation | 667-689 | `src/server/index.ts:5-8` publishes `Probe`, `LintStage`, `RuntimeStage`, `TypeStage` as the engine |
| The engine cannot be published, which decides where it lives | 690-715 | `src/server/index.ts:5` and `src/core/types.ts:368` — `ProbeInterface` is the published contract |
| The upgrade path does not change the inspections | 1005-1013 | `src/server/index.ts:6-8` publishes the three stage classes |
| Open questions | 1126-1145 | `src/server/index.ts:3-8` and `src/server/types.ts:195` close the placement and MCP questions |

## 3. The instruments record is a third source

`.orkestrel/probe/instruments/README.md` carries product truth that is nowhere else, and its folder
is being deleted. Carry these, each verified against the shipped source rather than transcribed:

1. **The stdio server speaks newline-delimited JSON**, the Model Context Protocol stdio framing, not
   `Content-Length` framing. A client that frames the way a Language Server Protocol client does
   hangs with no error and no output. This matters because the same package's lint stage speaks LSP
   to Oxlint, so one package holds both framings and the wrong choice is silent.
2. **A current-revision `tools/list` needs all three reserved `_meta` keys**, not the protocol
   version alone. Sending only the version is refused as malformed metadata, which reads like a
   server defect and is not. Read the required set from the source; the instruments page records
   what one run needed.

Two further facts on that page are process truth about bench sandboxes, not product truth. They are
in `.agents/orchestration.md` under **Bench laws** rule 4. Do not carry them into the guide.

## What this changes in PB6's acceptance

Replace the original condition that the guide restate `PROBE.md`'s measurements. The conditions are:

1. `guides/probe.md` states no number copied from `PROBE.md`.
2. It states boot cost and one `prove` cost, each measured on the host during PB6, each with the date and the host.
3. It states the server's framing and the `_meta` requirement, each verified against `src/`.
4. It restates none of the four superseded sections.
5. `PROBE.md` is deleted in the same commit, and that commit's message names what moved and where.

## Three corrections to the brief's scope and conditions

These are defects in `pb6-brief.md`, found by reading it against
`.agents/orchestration.md` § Check the brief before you send it. Each would have stopped the unit or
made a criterion unreachable.

### 1. `PROBE.md` must be owned, not off-limits

`pb6-brief.md` § Scope lists `PROBE.md` as off-limits while § "`PROBE.md` is dissolved into your
work" and this amendment's acceptance condition both require it deleted. A unit cannot delete a file
it does not own.

**`PROBE.md` moves to Owned, for deletion and for reading only.** Do not edit it; read what you need
and delete it.

### 2. `vite.config.ts` must be owned, or the guides project cannot exist

`pb6-brief.md` § Scope withholds `vite.config.ts` because scaffold generates it, and requires a new
`tests/guides.test.ts` that a `guides` Vitest project must collect. Scaffold derives that project from
the proof file's presence, so the proof file, `vite.config.ts`, and `package.json`'s `test:guides`
script are one change. Withholding one half makes criterion 5 unreachable by any edit to the owned
files — the same defect that cost unit B1 its whole run earlier in this campaign.

**Take the generated half rather than hand-writing it.** After creating `tests/guides.test.ts`, run
`npx scaffold repair` in the repository root and take exactly what it writes. That is how the `setup`
project landed in the sibling package. `vite.config.ts` and `package.json` are Owned for the purpose of
accepting that output; do not hand-edit either beyond what `repair` produces.

If `repair` fails, stop and report it. Do not hand-write the project.

### 3. The sandbox conditions do not apply to you

`pb6-brief.md` § Standing conditions says the sandbox denies nested child creation and nested
`npm install`, and tells you to record P9's proof as an observation. That was written for a bench
route. You run natively on a host that permits both, proven by unit PB4, which drove every stage and
both criterion-7 processes for real.

**Take every measurement.** P9 is the release blocker of this unit: a documented claim must be run
verbatim and earn a receipt. Record it as an executed proof with the receipt it returned, not as an
observation.

`npm run build`, `npm test`, and `npm run test:distribution` are **criteria**, not observations.

### The corrected acceptance criteria

Replacing the brief's list, and ordered so an unreachable criterion cannot hide the gates:

1. A documented claim earns a receipt, proven by an executed test asserting the receipt from the documentation's exact literal.
2. `guides/probe.md` exists and states the four prerequisites, the receipt's verification method and its limits, and the privilege statement.
3. `guides/probe.md` states the server's framing and the `_meta` requirement, each verified against `src/`, and restates none of the four superseded `PROBE.md` sections.
4. `guides/probe.md` states no number copied from `PROBE.md`; it states boot cost and one `prove` cost, each measured during this unit, each with its date and host.
5. `README.md` and the registry metadata are no longer the scaffold default.
6. `tests/guides.test.ts` exists, proves both parity directions, and executes the flagship fences.
7. P13's two defects are corrected; `validators.ts:99` is untouched.
8. P20, P21, and P22 close as specified.
9. `PROBE.md` is deleted.
10. `npm run format:check` exits 0.
11. `npm run lint:check` exits 0.
12. `npm run check` exits 0.
13. `npm run build` exits 0.
14. `npm test` exits 0.
15. `npm run test:distribution` exits 0.

## One standing condition the brief could not state

Before you start, the Orchestrator runs `npx scaffold overwrite` on a clean tree and commits the
result. Measured on 2026-08-20 before that run, `npx scaffold audit` reported:

```
│ vite.config.ts     │ configs │ stale │
│ configs/helpers.ts │ configs │ stale │
2 of 127 planned paths drifted from the plan.
```

Both are scaffold-generated and both drifted against the installed `@orkestrel/scaffold` 0.0.44 plan.
The alignment is not yours; it lands before you.

What this means for you: when you run `npx scaffold repair` to register the `guides` project, the only
change you should see is that project's addition plus its `test:guides` script. If `repair` rewrites
anything else, the alignment commit did not take and you stop and report rather than accepting a diff
you cannot account for.

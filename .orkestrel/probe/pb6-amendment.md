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

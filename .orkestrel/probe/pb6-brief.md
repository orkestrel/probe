# PB6 — the documentation a consumer actually receives

## Role and engine

`implementer`, Claude Opus 5, native subagent. Documentation voice throughout. Perform the assignment
directly and spawn nothing.

## What a consumer gets today

Six rows of `.orkestrel/probe/readiness-grade.md`, one a release blocker. Read the grade first.

The audit packed the package and looked:

> 17 files, 508053 B unpacked. The only prose is `README.md` at 98 B, whose entire body is
> "The @orkestrel/probe package." plus `npm install` / `npm test`. `package.json` carries
> `{"description":"The @orkestrel/probe package.","keywords":[]}` — the registry listing.

The package installs a `probe` binary on PATH and an MCP stdio server, and **neither is mentioned
anywhere a consumer can read.** There is no `guides/probe.md`, and no `tests/guides.test.ts`, so
nothing proves a documented name resolves or a documented value is true.

## The repairs

### P9 — no documented claim can earn a receipt (BLOCKER)

The flagship `Claim`, run verbatim, returns `no receipt`. A tool whose documentation cannot
demonstrate its own success condition is not shippable.

This is **not** closed by fixing the control alone. The audit ran it: with P13's control correction
applied the verdict is still `no receipt`, because the documented test text
`test("greets", () => {})` fails lint (no assertions) **and** runtime (`test is not defined`) on the
*case*. The package's own passing fixture at `tests/src/server/Probe.test.ts:63` imports
`{ expect, test } from 'vitest'` and asserts — a form that appears in no `@example`.

Write a complete claim that **actually earns a receipt against this workspace**, put it where a
consumer reads it, and have a test assert the receipt from the exact literal the documentation shows.
Run it; do not reason about it.

### P13 — two doc-truth defects, diagnosed months ago, never applied

`src/core/types.ts:100` still declares a `control` byte-identical to its case, so the control cannot
fail and the example can never earn a receipt. `src/core/shapers.ts:69` still says the tool admits
with `compileGuard(CLAIM_SHAPE)` while `src/server/factories.ts:65` admits with `isClaim`.

**P13 is a prerequisite of P9, not a peer.** Fix the control first.

Leave `src/core/validators.ts:99` alone — "Admits and refuses exactly what `compileGuard(CLAIM_SHAPE)`
does" is a true statement about the guard, proven by an existing test.

### P11 — the guide, the README, and the registry metadata

`guides/probe.md` states the four prerequisites the audit executed: a Vitest project **literally
named** `probe`; that project including `tmp/probe/**/*.test.ts`; a `tsconfig.json` resolving at least
one input; and the workspace's `typescript`, `oxlint`, and `vitest` being the same resolved files
probe resolves. A consumer missing any one gets a failure they cannot diagnose.

`README.md` states what a probe proves, the `probe` binary, its MCP tool, and one runnable claim.
`package.json` gains a description that is not the scaffold default and non-empty `keywords`.

`tests/guides.test.ts` enforces parity. Per `.claude/rules/tests.md` it proves three things: every
documented name resolves, every public export is documented, and **every executable fence returns what
the guide says it returns**. Transcribe each flagship fence and assert the values its comments claim —
name resolution alone would let a fence documenting a false value pass.

Adding `tests/guides.test.ts` makes scaffold derive a `guides` project. Add the exact `test:guides`
script it asks for and let `scaffold overwrite` generate the project; do not hand-write it.

The guide must also carry what the receipt ruling obliges — read
`.orkestrel/probe/p4-receipt-ruling.md` section 6:

- the token's field order and its remainder parsing rule;
- the verification method (recompute, or re-run and compare) and that probe holds **no key**, so a
  receipt is a statement of conditions rather than an authenticator;
- the boundary a receipt does **not** vouch for — the lint, runtime, and root-project configurations —
  and why;
- that the digest moves with the TypeScript version, so the first compiler upgrade does not read as a
  breach;
- that probe **executes caller-supplied test code with the host's privileges**, stated next to the
  verification method.

### P20, P21, P22 — barrel and TSDoc truth

- `Overlay` is barrelled with no consumer seam. Either a stage constructor accepts an
  `OverlayInterface`, or `Overlay` leaves the barrel and is named in an `INTERNAL` list the parity gate
  reads. Choose and say why.
- Eleven of twelve barrelled server helpers carry no `@example`. Give each a runnable one a test
  executes, or take it out of the barrel.
- The revision-file cleanup comment claims a glob match that does not exist. Name the gates the orphan
  enters and drop the glob claim; the sweep itself is right.

## Standing conditions

- Units PB3, PB4, and PB5 land before you. PB4 changes `Verdict` and the token format — **write every
  documented token against the new seven-field shape**, never the old six-field one.
- The sandbox denies nested child creation and nested `npm install`. P9's proof drives real stages, so
  expect not to run it here: record it as an observation with the settling command. The Orchestrator
  runs it on the host.

## Scope

Owned: `guides/probe.md` (new), `README.md`, `package.json` (description, keywords, `test:guides`),
`tests/guides.test.ts` (new), `src/core/types.ts`, `src/core/shapers.ts`, `src/server/index.ts`,
`src/server/helpers.ts`, `src/server/types.ts`, and matching files under `tests/src/`.

Off-limits: `PROBE.md`, `.orkestrel/`, `vite.config.ts` (scaffold generates it), `tests/distribution.test.ts`.

## Execution

Perform this assignment directly. Spawn nothing.

## Acceptance criteria

1. `npm run format:check`, `npm run lint:check`, and `npm run check` each exit 0.
2. A documented claim earns a receipt, proven by a test asserting the receipt from the documentation's
   exact literal.
3. `guides/probe.md` exists and states the four prerequisites, the receipt's verification method and
   its limits, and the privilege statement.
4. `README.md` and the registry metadata are no longer the scaffold default.
5. `tests/guides.test.ts` exists, proves both parity directions, and executes the flagship fences.
6. P13's two defects are corrected; `validators.ts:99` is untouched.
7. P20, P21, and P22 close as specified.

**`npm run build` and the test projects are observations, not criteria.** Report every command's
**bare** exit code.

## Deviation contract

Stop and report if no claim can be made to earn a receipt against this workspace, if a repair needs a
file you do not own, or if the barrel ruling for `Overlay` has consequences you cannot bound. Prose,
structure, and example choice are yours.

## Output

**Per numbered row: what changed and why**, **The claim that earns a receipt, verbatim, with its
receipt**, **The Overlay ruling and why**, **Files written**, **Red-then-green proofs**,
**Validation** (each gate, bare exit code), **What you could not run and the settling command**,
**Deviation**, **Decisions**. No process diary.

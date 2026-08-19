# @orkestrel/probe — Unit 1: the contracts

You are the sole serial writer in `/workspace/probe`, a fresh scaffold workspace at a clean
committed baseline. This is unit 1 of 4; units 2 to 4 build the stages, the coordinator, and the
proofs on top of what you define.

## Read first

- `/workspace/probe/AGENTS.md` and every applicable file in `/workspace/probe/.claude/rules/`,
  especially `architecture.md`, `names.md`, `typescript.md`, and `patterns.md`.
- `/home/user/scaffold/PROBE.md` — the accepted design. Its `The surface` section fixes the
  contract names and its `Warm residency forces five laws` section fixes the behaviour those
  contracts must be able to express.
- `/home/user/scaffold/.orkestrel/probe/plan.md` — the decomposition. You own unit 1 only.

## Objective

Define the host-independent contracts and pure functions for a service that proves a claim against
a workspace's own TypeScript, Oxlint, and Vitest, and returns type, lint, and runtime evidence in
one call.

## Owned files

`src/core/types.ts`, `src/core/constants.ts`, `src/core/shapers.ts`, `src/core/validators.ts`,
`src/core/helpers.ts`, `src/core/index.ts`. Nothing else. Do not touch `src/server`, `src/bin`,
`tests`, `guides`, or the manifest.

## What to define

Types first, in `src/core/types.ts`:

- `Stage` — the three stages, as a union of real domain states.
- `Source` — one file's path and text.
- `Case` — the files a claim carries plus the test that exercises them.
- `Control` — a `Case` that must fail, naming the stage where it must fail and why.
- `Claim` — the project, the case, and its control.
- `Finding` — one message a tool reported, with its location.
- `Check` — one stage's outcome: its stage, its elapsed milliseconds, and its findings.
- `Toolchain` — the three resolved tool versions the verdict was produced with.
- `Verdict` — the identity, the toolchain, the case's checks, the control's checks, the elapsed
  total, and an optional receipt.
- `ProbeInterface`, `ProbeOptions`, `ProbeEventMap` — the coordinator's contract, which unit 3
  implements. `prove` is one word and returns a `Verdict`. `destroy` carries its fixed lifecycle
  meaning. There is no `start`: unit 3 warms at construction.

Then:

- `src/core/shapers.ts` — `CLAIM_SHAPE`, one `ContractShape` from `@orkestrel/contract`. It must
  yield both the JSON Schema the MCP tool publishes and the guard applied to arriving claims, so
  the wire contract and the runtime guard cannot drift. Read `@orkestrel/contract`'s own guide in
  `guides/` if one is mirrored there, or its types under `node_modules/@orkestrel/contract`, before
  choosing the shape.
- `src/core/validators.ts` — `isClaim` and `isVerdict`, total guards that never throw and return
  false off-shape.
- `src/core/helpers.ts` — `formatVerdict(verdict)` returning the text an agent reads, and
  `computeReceipt(...)` returning `string | undefined`. A receipt exists only when every check on
  the case is clean and the control failed at its declared stage. Both are pure.
- `src/core/constants.ts` — only what the above genuinely needs.
- `src/core/index.ts` — the barrel, star exports only.

## Laws that bind the shape

- A `Verdict` exists only when all three stages ran. There is no empty `Check` and no sentinel for
  a stage that could not start; unit 3 throws instead. Do not model absence you have forbidden.
- Every collection is readonly and every interface property is readonly.
- Single-word entity members. No `any`, no `as`, no non-null assertion, no suppression directive.
- `core` is host-independent: no `node:` specifier and no Node global may appear in this
  environment. `configs/src/tsconfig.core.json` will refuse them.
- Every declaration in a centralized file is exported. No nested function declarations.
- TSDoc carries the reason a thing exists, not a restatement of its name. Every exported symbol
  gets it, with a runnable `@example` where the rules require one.

## Execution

Perform this assignment directly and spawn nothing. Do not install dependencies, commit, or push.
Validate with `npm run check:src:core` and `npm run lint:check`, both from `/workspace/probe`.

## Deviation contract

Stop and report if the objective conflicts with what you find: expected, found, exact evidence,
done or not done, one short hypothesis. An ancillary choice is yours to make and record.

## Acceptance criteria

1. `npm run check:src:core` exits 0.
2. `npm run lint:check` exits 0.
3. Every type PROBE.md's surface names exists, with the readonly and one-word discipline.
4. `computeReceipt` returns `undefined` unless the case is clean and the control failed at its
   declared stage.
5. No `node:` specifier appears anywhere in `src/core`.

## Output

The files you wrote with a one-line reason each, the exact validation commands and their exit
codes, any deviation, and anything you decided that this brief left open. No process diary.

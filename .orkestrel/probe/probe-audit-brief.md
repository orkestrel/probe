# PROBE-AUDIT: successor audit before the first publish of @orkestrel/probe

## Role and engine

Role `analyst`. Engine GPT-5.6 Sol, high effort, sandbox `read-only`, rooted at `/workspace/probe`.
You are the objective lane. Every change under audit was written by Opus 5, so you are an engine
that did not write it.

## Objective

Rule on the numbered claims below and return per-claim verdicts with executed evidence.

This package has never been published. `0.0.1` goes to the registry with no prior version to
compare against and no consumer already depending on it, so every mistake in the surface is one a
first release cements. A claim you cannot substantiate is a FAIL, not a courtesy PASS.

## Read first, in this order

1. `AGENTS.md` — in full
2. `.claude/rules/quality.md` — the Falsification law owns the method and the evidence each verdict
   carries
3. `.claude/rules/architecture.md`, `.claude/rules/patterns.md`, `.claude/rules/names.md`
4. `.agents/skills/orkestrel-falsify/SKILL.md` — it fixes the verdict shape, the value set, and the
   single terminal line. Follow it exactly.
5. `guides/probe.md` — the governing spec

## Context

- The package proves a `Claim`: it runs a case and a negative control through resident TypeScript,
  Oxlint, and Vitest engines and returns a `Verdict`, plus a `receipt` when the case ran clean and
  the control broke at the stage it named.
- The tree is committed and clean at dispatch. Untracked `tmp/` files are the expected state.
- Gates ran green immediately before this dispatch. Do not re-run the suite; the claims below are
  about substance the gates do not reach. `npm test` here takes many minutes and another agent may
  be using the tree.
- The sandbox is read-only and the network is unshared. You cannot write a probe file, install, or
  fetch. Where a claim needs an executed reading you cannot take, say so in that claim's verdict and
  name the exact command that would take it. Do not guess the reading.
- Vendored files are off-limits as subjects: `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`,
  `.codex/`, `.cursor/`, `configs/helpers.ts`, `scripts/*.sh`, `tests/config.test.ts`,
  `tests/policy.test.ts`, `tests/setupPolicy.ts` are owned by `@orkestrel/scaffold` and restored by
  `repair`. Report a defect in one as a scaffold finding; never as a probe fix.
- `guides/*.md` other than `guides/probe.md` and `guides/README.md` are byte-identical mirrors
  refetched by `scaffold catalog`. Not this package's prose, and out of scope.

## Known findings — do not spend budget rediscovering these

- The runtime stage previously refused over a missing parent directory, which broke the guide's
  flagship receipt claim on a fresh checkout. Fixed: `src/server/stages/RuntimeStage.ts` now creates
  the parent recursively. Claim 4 asks whether the fix is complete, not whether the defect existed.
- `releaseListeners` in `src/server/helpers.ts` was removing listeners it did not add. Fixed with a
  narrowed contract. Claim 2 covers what the narrowed contract now permits.
- A claim leaves an empty git-ignored `tmp/probe` directory behind in the target's tree. Already
  ruled acceptable.

## The claims

Rule on each. Number your verdicts to match.

**Claim 1.** This package executes caller-supplied test code with the privileges of the hosting
process, which the guide states plainly. Rule on whether every other privilege the package takes is
stated as plainly: what it writes and where, what it deletes and by what rule, what it spawns, what
environment it hands a child, and what a caller-supplied `path` can reach. Name every path traversal
or write-escape a malicious `Source.path` or `Claim.project` could achieve, or establish there is
none. Read `Overlay`, `Probe`, and every stage. This is the highest-value claim in this brief.

**Claim 2.** Every resource the package acquires is released on `destroy()`, for every entry state
and every failure path: listeners, child processes, watchers, resident engine instances, temporary
files, and the workspace directories it creates. A `destroy()` that leaves the Node event loop alive
is a FAIL. Subjects: `src/server/Probe.ts`, `src/server/ProbeServer.ts`, `src/server/Overlay.ts`,
`src/server/stages/*.ts`, `src/server/helpers.ts`.

**Claim 3.** The sweep that deletes generated files deletes only files this package generated, for
every shape of caller-supplied path, including one that collides with a pre-existing file the caller
owns. Name the marker rule and the command proving a non-marked file survives.

**Claim 4.** The receipt is sound: it is issued only when the case ran clean and the control broke at
the stage it declared, it cannot be issued when the control broke at a different stage, and it cannot
be issued when any stage reported an `instrument` origin finding. State what a receipt does and does
not attest, and rule on whether `guides/probe.md` says the same.

**Claim 5.** `package.json`'s `files`, `exports`, `bin`, `types`, and `publishConfig` produce a
first-publish artifact that works: the two subpaths and the `bin` resolve from the packed tarball
under `node10`, `node16`, `bundler`, and `nodenext`; nothing the runtime needs is outside `files`;
and nothing inside `files` is dead weight or a leak. `npm pack --dry-run` is available to you; the
registry is not.

**Claim 6.** `guides/probe.md` and `src/` are in parity in both directions, and no statement in the
guide asserts that a suite executes a check the suite does not execute. State which direction the
existing `test:guides` project already proves and rule only on the gap.

**Claim 7.** No prose this package owns states a count of a set the package can add to, or names a
list item by its position. Scope: `README.md`, `guides/probe.md`, `guides/README.md`, and every TSDoc
and comment under `src/` and `tests/`. Excluded: the guide mirrors, and `.orkestrel/`. An external
identifier is not a count: a version, a date, an exit code, a limit, a duration, and a size all stay.
Sweep case-insensitively and across inflections including spelled-out numbers, and name the pattern
and the paths behind your result including a clean one.

**Claim 8.** The public surface earns its size. Name every export of the two barrels that no consumer
outside this package could use, every export that exists only because a test reaches for it, and
every wrapper that adds no boundary, invariant, composition, translation, lifecycle, or narrower
contract. `AGENTS.md` § Design laws owns the standard. A first publish is the only cheap moment to
remove one.

**Claim 9.** The error surface is one concept with one term. Rule on whether `ProbeError`, the
`origin: 'code' | 'instrument'` discriminant, and the finding shapes divide the failure space without
overlap, and whether a caller can distinguish a fault in their claim from a fault in the instrument
by the value alone rather than by reading a message string.

## Unknowns

- Whether the resident engines hold state across `prove` calls that could make one claim's verdict
  depend on a previous claim's sources. I do not know. If they do, say what leaks and whether the
  guide admits it.
- Whether any release path in Claim 2 is observable by an existing test. Where a release is
  unobservable, say so; an unobservable repair is a finding of its own class, not a PASS.

## Scope

Read-only. Own nothing. Edit nothing. Spawn nothing. Perform this assignment directly.

## Output

The verdict shape `.agents/skills/orkestrel-falsify/SKILL.md` fixes, and nothing else. Per-claim
verdicts with executed evidence, findings numbered in one sequence, and the single terminal line the
skill specifies. No process diary.

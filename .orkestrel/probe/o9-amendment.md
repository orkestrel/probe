# O9 — amendment 1, written 2026-08-19 after S2, Q1, S3, S3fix, and H1 landed

`o9-design-brief.md`, `o9-objective-ruling.md`, and `o9-reconciliation.md` stand. This file records what
has changed underneath them. Read it before writing any O9 implementation brief.

## The reconciliation's closing correction is now STALE — do not carry it as work

`o9-reconciliation.md` § "Correction — concurrent `prove` is live, not latent" ends by requiring two
things of the implementation:

> scope the overlay per inspection because the property must be owned, and bound the deadline from the
> point the inspection actually starts rather than from the point it is requested.

**The second is already done.** It quotes a `#inspectRuntime` that arms `createTimeout` before
`stage.inspect` is queued. That shape no longer exists. Unit S2 replaced it with `#inspectStage`, and
unit Q1 moved queueing into `Probe` itself. Verified against the tree:

```text
src/server/Probe.ts:86-90
	handler: (inspection) =>
		this.#inspectStage(
			this.#type,
			this.#type.inspect(inspection.subject, inspection.claim.project),
		),

src/server/Probe.ts:254-260
	async #inspectStage(stage: StageInterface, operation: Promise<Check>): Promise<Check> {
		const timeout = createTimeout({ ms: this.#deadline })
		timeout.start()
```

The `operation` argument is evaluated at the call site, which is **inside the queue handler**. So the
stage's work begins and the timer starts immediately after, both at admission rather than at request.
The deadline now bounds execution, which is what `ProbeOptions.deadline` documents.

**The first still stands.** Scope the overlay per inspection.

## One of the three unsettled questions is settled

`o9-reconciliation.md` § "What neither lane settled" lists three. The third was:

> Whether path canonicalization agrees between TypeScript and Vite under symlinks and case folding. The
> objective lane raised it; it needs a probe on this host.

Probed on this host. The instrument's control is a second real file, which must not compare equal:

```text
case folding on this host   : NO (case sensitive)
symlink paths differ raw    : true
symlink agree after realpath: true
CONTROL two real files agree: false (must be false)
```

And the installed TypeScript, with an inverted-setting control that must transform the input:

```text
typescript version              : 6.0.3
ts.sys.useCaseSensitiveFileNames: true
canonical(mixed case)           : /Workspace/Probe/src/Core/Value.ts
canonical is identity here      : true
CONTROL insensitive canonical   : /workspace/probe/src/core/value.ts
CONTROL differs from identity   : true (must be true)
ts.sys.realpath present         : true
```

**Ruling:** on this host TypeScript's canonicalization is the identity function, so an overlay keyed by
the declared workspace-relative path matches what the language service asks for, with no folding step.
Symlinks are the live hazard rather than case: two paths for one file differ raw and agree only after
`realpath`.

Two obligations follow, and they belong in the implementation brief:

- Key the overlay on a path resolved the same way the host resolves it. `ts.sys.realpath` exists; use it
  rather than assuming `path.resolve` suffices.
- `.claude/rules/tests.md` requires probing a host-varying property at runtime and asserting against
  what the probe returned. **Do not pin `useCaseSensitiveFileNames` to `true` in a test.** That is this
  host's answer, and a case-folding host would silently measure something else.

The other two remain open: whether concurrent `prove` on one probe is reachable today, and the real
warm-path cost.

## Units that landed under O9's feet

- **S3 and S3fix** rewrote `LintStage`'s liveness, teardown, and candidate path synthesis. O9 rebuilds
  candidate-source handling across all three stages, so re-read `LintStage.ts` at `2ecddc2` rather than
  at the commit the design round measured.
- **S3fix changed what `#file` produces.** It now keeps the declared directory as well as the basename,
  with one carve-out for the probe's own `tmp/probe` staging area. Any O9 unit touching candidate
  identity inherits that decision and must not silently revert it.
- **H1 widened `resolveWorkspaceFile`.** It now accepts contained files whose names begin with dots and
  refuses the empty target. O9's overlay keys go through that function.
- **S4 has not run.** Its subject — overlays applied outside the `try` whose `finally` removes them — is
  the lifetime O9 rebuilds. The reconciliation already states S4 is O9's prerequisite; that is unchanged.

## What has not changed

The six decisions both lanes reached independently, and the ruling that the overlay is inspection-scoped.
Nothing since has touched them.

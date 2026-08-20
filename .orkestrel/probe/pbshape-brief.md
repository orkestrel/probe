# PBSHAPE — rule on probe's `Verdict` shape before first publication

## What this decides

Whether `@orkestrel/probe` publishes its flagship result type as it stands, or reshapes it first.
The package has never published, so this is the last moment the change costs nothing. After
publication it costs a major-shaped break in a `0.0.x` fleet where a caret pins one exact release.

You are one of two lanes ruling on this, each with a clean context and blind to the other. The
orchestrator reconciles. Rule; do not implement.

## The subject

`@orkestrel/probe` answers a `Claim` with a `Verdict`. A claim carries a case and a **control**: a
second case the claimant asserts must fail, at a named stage, for a stated reason. The control is
what makes the verdict evidence rather than an assertion — a clean case means nothing unless the
instrument demonstrably reports red when it should.

The shapes, at `/workspace/probe/src/core/types.ts`:

```ts
export interface Control extends Case {
	readonly stage: Stage        // the stage this control must fail at
	readonly reason: string      // why it fails there — non-empty, enforced by `isControl`
}

export interface Claim {
	readonly project: string
	readonly case: Case
	readonly control: Control
}

export interface Verdict {
	readonly id: string
	readonly digest: string
	readonly toolchain: Toolchain
	readonly project: Project
	readonly reason?: string              // the claimant's explanation for the selected control
	readonly checks: readonly Check[]     // one outcome per stage for the case
	readonly control: readonly Check[]    // one outcome per stage for the control
	readonly elapsed: number
	readonly receipt?: string
}
```

And the public helper at `/workspace/probe/src/core/helpers.ts`:

```ts
export function computeReceipt(verdict: Verdict, stage: Stage): string | undefined
```

## Three findings that produced this question

A campaign audit raised these and the orchestrator routed them here rather than into a fix round,
because each is a shape question rather than a defect.

1. **`Verdict.reason` is optional, and the guide apologises for it twice.** `Probe.prove` always
   carries it, because it comes from `claim.control.reason`, which `isControl` requires non-empty.
   It is optional only because a hand-built verdict and the receipt helper wanted it so. The guide
   says twice that `prove` always carries it, which is a documented workaround for a type that
   admits a state the package never produces.

2. **The verdict says why the control was chosen and not where it was declared to break.**
   `Verdict.reason` carries `Control.reason`. Nothing on the verdict carries `Control.stage`, so
   `computeReceipt` takes it as a second argument. A caller can therefore pass a stage the verdict's
   control never declared, and the helper answers about it.

3. **`Verdict.reason` accepts `''` in the type while the package's own guard refuses it.**
   `isControl` requires a non-empty `reason`; `readonly reason?: string` admits the empty string.
   The type is wider than the runtime, in the direction that lets a caller build a value the package
   would reject.

## The proposal to rule on

Replace the two flat members with one sub-entity that mirrors `Claim.control`:

```ts
export interface Verdict {
	readonly id: string
	readonly digest: string
	readonly toolchain: Toolchain
	readonly project: Project
	readonly checks: readonly Check[]
	readonly control: {
		readonly stage: Stage
		readonly reason: string
		readonly checks: readonly Check[]
	}
	readonly elapsed: number
	readonly receipt?: string
}
```

and narrow the helper to `computeReceipt(verdict: Verdict): string | undefined`, reading the stage
from the verdict it was given.

## Your ruling

Return a ruling on each numbered question. Each answer is a decision with a reason, not a survey.

1. **Does the sub-entity replace the two flat members?** If yes, state its exact declaration,
   including whether it is a named interface in `types.ts` or an inline object type, and what it is
   named. If no, state what closes findings 1 through 3 without it.
2. **Does `computeReceipt` lose its `stage` parameter?** Rule on the consequence either way: a
   consumer holding a verdict and asking "would this stage have earned a receipt" loses that
   question if the parameter goes. State whether that question is one the package should answer.
3. **Is `reason` required on the verdict?** Rule on the hand-built verdict the current optionality
   was for: state whether that caller exists, and if it does, what it does instead.
4. **How does the type stop admitting `''`?** Rule between a branded or template-literal type, a
   plain `string` with the guard as the only enforcement, and a third option you name. State the
   cost of the one you pick.
5. **What breaks, and is the break worth it?** Name every published surface that moves: type
   members, the helper's arity, the guide's Surface and Methods tables, the MCP tool's advertised
   result schema, and the `formatVerdict` renderer. Rule on whether the total is worth paying
   before first publication.
6. **Is there a better shape than either the current one or the proposal?** Only answer this with a
   concrete alternative you would ship. "Consider X" is not a ruling.

## Read before ruling

In `/workspace/probe`:

1. `AGENTS.md` — in particular § Design laws: single-word entity APIs, named discriminants, derive
   state, absence is `undefined`, real domain states only, minimal public API, no compatibility shims.
2. `.claude/rules/names.md`, `.claude/rules/typescript.md`, `.claude/rules/patterns.md`,
   `.claude/rules/architecture.md`.
3. `src/core/types.ts`, `src/core/helpers.ts`, `src/core/validators.ts`, `src/core/shapers.ts`.
4. `src/server/Probe.ts` — how a verdict is actually built, at `:140-165`.
5. `src/server/ProbeServer.ts` — what the MCP tool advertises and returns.
6. `guides/probe.md` — the published contract, especially its Surface tables and the receipt section.

## Constraints your ruling must satisfy

- The package publishes single-word entity members. A member that needs two words is a signal to
  change the shape, not to hyphenate the name.
- `AGENTS.md` forbids compatibility shims. Whatever you rule, every consumer moves in one change.
- `.claude/rules/architecture.md` requires every type in `types.ts` to be exported and reachable
  from its environment barrel. A named sub-entity is public surface and owes a guide row and a
  runnable example. An inline object type is not, and is also harder for a consumer to name.
- The digest already covers the control's `reason`. Two claims differing only in that prose digest
  differently — measured, `f3f64d71ca3df5e2dbabb1e9955f5b88` against
  `712c763a9e383fa44564f437ff12c7b1`. Any shape you rule for keeps that true.
- `Probe.prove` runs the control through every stage, so `Verdict.control` always carries one check
  per stage.

## Unknowns

- Whether any caller outside this package builds a `Verdict` by hand is not established. Find out
  from the tree and say what you found. If none exists, say that finding 1's stated motive is
  unsupported and rule accordingly.
- Whether `@orkestrel/mcp` or any other package consumes `Verdict` is not established here. Report
  what you can determine from `/workspace/probe` alone, and name what you could not check.

## Output

A ruling on each of the six numbered questions, each stating the decision first and the reason
after. Then:

- the exact declarations you would ship, as code;
- the full list of surfaces that move;
- what you would not change, and why the adjacent thing that looks the same is fine as it is.

No process diary. No summary of what you read.

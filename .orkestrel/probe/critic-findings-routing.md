# Completeness critic — five defects the sweep's doc-truth lens missed, and where each goes

A tenth lane asked what the doc-truth dimension missed rather than re-checking its nine findings. It
found five, four with executed evidence. None duplicates M3-L4.

Two of them are not documentation defects at all, and that is the point of running a critic: the sweep
classified this dimension as prose, so a correctness defect sitting behind a false sentence was invisible
to it.

## C1 — five `@example` blocks carry a test the runtime stage refuses. Routed to **S5**

`src/core/types.ts:49`, `:72`, `:96` and `src/core/validators.ts:66`, `:80` all use:

```text
test: { path: 'tests/src/core/greeting.test.ts', text: 'test("greets", () => {})\n' },
```

No Vitest project in this workspace sets `globals: true`. `tsconfig.json:8` supplies
`vitest/globals` to the TYPE CHECKER only. Executed:

```text
FAIL  |src:core| tests/src/core/greeting.test.ts
ReferenceError: test is not defined
```

So the type stage passes this text and the runtime stage kills it.

**This is a second, independent reason the `Claim` example can never earn a receipt**, and it is worse
than the byte-identical-control defect already known, because it also poisons the `Case`, `Control`,
`isCase`, and `isControl` examples, which that defect does not reach.

Repair: prefix every example test text with `import { expect, test } from 'vitest'\n`, matching what
the package's own boot control does at `Probe.ts:129`.

## C2 — `Finding.line` is documented absent for the case where it is present. Routed to **S5**

`src/core/types.ts:118-119` says `line` is absent "for a whole-file diagnostic and for a runtime
failure". `RuntimeStage.ts:242-243` sets it whenever the stack carries one, and a failing assertion
does. Executed: `STACKS: [{"file":".../broken.test.ts","line":3,"column":12}]`.

The ordinary runtime failure is exactly the case the doc names as never carrying a line. No test
asserts on `line` in the runtime stage's suite, so nothing guards it.

## C3 — `computeReceipt` issues for a control that also broke where it did not declare. Routed to **S5**

`helpers.ts:80-82` and `types.ts:65-66` both say a control failing at a stage other than the one it
names has falsified the instrument, so no receipt is issued. `helpers.ts:100-101` inspects only the
declared stage:

```ts
const broke = verdict.control.find((check) => check.stage === stage)
```

Executed: a control reporting findings at `type` (declared), `lint`, AND `runtime` still returns a
receipt.

**The package enforces the stricter reading for its own boot control** at `Probe.ts:177-179` and
applies nothing equivalent to a caller's claim. So the authors act on the strict reading internally
while shipping the loose one.

Repair is a ruling, not an edit: either tighten `computeReceipt` to require the control clean
everywhere except its declared stage, or restate both sentences to the narrow reading. S5 rules and
says which.

## C4 — the lint stage changes which rules fire. Routed to **S3**, and it is not a doc defect

`types.ts:30` calls `Source.path` "workspace-relative path the stages resolve the text against".
`LintStage.ts:169-177` discards the declared filename and synthesizes `tests/probe-<uuid>.ts` for
every candidate outside `src/**` and `app/**`.

Executed over two files with byte-identical content:

```text
tests/probe-0d1f.ts:1:8: error import(no-default-export): Prefer named exports
```

`sample.config.ts` reports nothing, because `.oxlintrc.json` exempts `*.config.ts` from that rule.

**So the probe reports a lint finding the real gate exempts — a false red on a candidate that would
pass.** That is the exact failure mode `Toolchain`'s own `@remarks` says the design exists to prevent.

This is a correctness defect in `LintStage.ts`, so it belongs to S3 rather than to the documentation
unit. Repair: preserve the declared basename in the synthesized path so the glob-keyed overrides the
gate applies also apply here.

## C5 — `Finding.path` is not what the tool reported, at any stage. Routed to **S5**

`types.ts:131` says "workspace-relative path the tool reported against". All three stages substitute:
the lint stage maps the URI back to the declared path, the type stage substitutes the tsconfig path for
a fileless diagnostic, and the runtime stage substitutes the declared test path for the revision file.

The substitutions are correct behaviour. The sentence describing them is false, and it is the only doc
a consumer reading `Finding` has.

## What the critic checked and found sound

Kept so the next round does not re-walk it: all 16 `@example` blocks in `validators.ts` return their
documented boolean, executed against the installed `@orkestrel/contract`; every `@example` in
`helpers.ts` and `constants.ts` produces its documented string; `isClaim`'s equivalence with
`compileGuard(CLAIM_SHAPE)` holds over 15 probes including unknown keys, inherited members, and
`undefined`-valued extras; `compileSchema(CLAIM_SHAPE).type` is `'object'` as documented; and
`ProbeServerInterface` matches `createStdioServer`'s declared shape and framing.

# PBCANON — report

Unit: `implementer`, Opus 5. Brief: `pbcanon-brief.md`. Rows A through E.

## Row A — probe had no error type and 33 plain throws

Added `src/core/errors.ts` declaring `ProbeError`, `isProbeError`, and the factory
`createDestroyedError`. Five codes: `invalid`, `destroyed`, `deadline`, `workspace`, `instrument`.
The guard reads a `Symbol.for` brand through `Object.getOwnPropertyDescriptor`, so it recognises an
error thrown by a second copy of the package where `instanceof` fails.

Routed 45 `Error` constructions to `ProbeError`, twelve more than the audit's count of 33. The audit
counted `throw new Error(` sites; the unit also found constructions that were assigned or rejected
rather than thrown.

`grep -rn "throw new Error(" src/` reports no matches. `new Error(` survives at two sites, both
inside TSDoc `@example` blocks where a plain `Error` is the control the guard refuses.

## Row B — `Overlay` and `INTERNAL`

`Overlay` is barrelled at `src/server/index.ts:4`. `INTERNAL` in `tests/guides.test.ts:18` is
`Object.freeze([])`. No TSDoc claims either symbol is internal.

Only one `Overlay` exists in the package, and `new Overlay()` takes no argument, so
`.claude/rules/architecture.md`'s own test — barrel the class when a consumer can construct it from
values they already hold — requires it in the barrel.

## Row C — the parity gate could not see a type-only export

`extractDocumented` discovered only exports that already carried documentation, so the sweep that
claimed to fail on a missing `@example` was blind exactly where it claimed coverage. Added
`extractExports`, which scans left-margin exported declarations regardless of documentation, and
drew both parity directions from that population.

Proven able to fail. Planting `export type Planted = string`: the old gate reported 9 passed and saw
nothing; the repaired gate reported 2 failed.

## Row D — two test files existed only for barrels

Deleted `tests/src/core/index.test.ts` and `tests/src/server/index.test.ts`, per
`.claude/rules/tests.md:43`. Moved the error behaviour into `tests/src/core/errors.test.ts`, whose
name states the module it proves. Barrel membership is left to the parity gate, which row C proved
able to fail.

## Row E — one writing breach

`grep -c "above\|below" guides/probe.md` reports 0.

## Gate evidence

Six gates green at the unit's own reading. The authoritative reading is the verifier's, recorded in
`pbcanon-verification.md`.

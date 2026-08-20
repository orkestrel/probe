Implemented PB3 across P5, P17, and P18.

### Repairs

- P5: [RuntimeStage.ts](/workspace/probe/src/server/stages/RuntimeStage.ts:255) adds `resolveId`. It resolves overlay-owned relative and absolute candidates for `.js`, `.ts`, and extensionless imports. Bare package specifiers remain with Vite’s resolver.
- P17: [RuntimeStage.ts](/workspace/probe/src/server/stages/RuntimeStage.ts:293) converts missing-directory and write failures into runtime `instrument` findings.
- P18: [TypeStage.ts](/workspace/probe/src/server/stages/TypeStage.ts:111) resolves candidate paths before project inference.

### Shadowing ruling

Candidate text wins when it shadows an existing disk file. This matches the type stage and the documented meaning of `Case.files`. The disk file remains unchanged.

Evidence: the focused shadowing test passed, 1/1.

### Files written

- [RuntimeStage.ts](/workspace/probe/src/server/stages/RuntimeStage.ts)
- [TypeStage.ts](/workspace/probe/src/server/stages/TypeStage.ts)
- [Probe.test.ts](/workspace/probe/tests/src/server/Probe.test.ts:174)
- [RuntimeStage.test.ts](/workspace/probe/tests/src/server/stages/RuntimeStage.test.ts:248)
- [TypeStage.test.ts](/workspace/probe/tests/src/server/stages/TypeStage.test.ts:111)

### Red-then-green proofs

- P5, same command: 3 failed → 4 passed.
- P17 runtime faults, same command: 2 failed → 2 passed.
- P17 complete verdict, same command: 1 failed → 1 passed.
- P18 equivalent spellings, same command: 1 failed → 1 passed.
- Final combined PB3 proof: 9 passed.
- Full RuntimeStage and TypeStage files: 40 passed.

### Validation

- `npm run format:check`: exit 0
- `npm run lint:check`: exit 0
- `npm run check`: exit 0
- `npm run build`: exit 0
- `npm run test:policy`: exit 0, 86 passed
- `npm test`: exit 1, 97 passed and 11 spawn-dependent LintStage/Probe fixture tests timed out
- `npm run test:config`: exit 1, 27 passed and 1 failed with `spawnSync /opt/node22/bin/node EPERM`

Run `npm run test:src:server` and `npm run test:config` in an environment permitting nested child creation to settle those observations.

### Core sentences that must move

None. The implementation now matches the documented meaning of `Case.files`.

### Deviation

No implementation deviation. No off-limits file changed. The temporary resolution probe was removed.

### Decisions

Instrument faults cannot enter the `origin: 'code'` path: specification creation now returns an instrument finding before Vitest runs, while code findings remain derived only from completed Vitest results. The package-hardening workflow supplied the red-green proofs and final centralization, wrapper, text-integrity, and generated-output checks.
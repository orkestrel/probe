PB1 is implemented in the owned files. The code gates pass. Full acceptance remains blocked by sandbox restrictions on nested npm installs and subprocesses; the expected P3 failures remain active.

### Numbered rows

1. **P1 — installation**

   Added optional peer metadata for Oxlint, TypeScript, and Vitest. These tools resolve from the target workspace.

2. **P2 — TypeScript compatibility**

   Verified installed versions: TypeScript 6.0.3, Oxlint 1.79.0, and Vitest 4.1.11. Bounded their peer ranges accordingly.

   `Probe.prove()` now rejects unsupported TypeScript majors before invoking the compiler. The error derives the supported range from `package.json` and names both versions.

3. **P23 — Node range**

   Set `engines.node` to `^22.12.0 || >=24.0.0`, matching Vitest 4’s supported Node lines.

4. **P10 — distribution gate**

   Added the `distribution` Vitest project, exact `test:distribution` script, and release-mode prepublish gate.

   The test packs the package outside the repository and checks:

   - Every export under `import` and `require`.
   - Real values from each export.
   - Real `prove()` verdicts under both module systems.
   - Absence of the P3 `{}.` CJS artifact.
   - Rejection of an absent export as a negative control.

### Files written

- [package.json](/workspace/probe/package.json)
- [vite.config.ts](/workspace/probe/vite.config.ts)
- [tests/distribution.test.ts](/workspace/probe/tests/distribution.test.ts)
- [src/server/Probe.ts](/workspace/probe/src/server/Probe.ts)
- [tests/src/server/Probe.test.ts](/workspace/probe/tests/src/server/Probe.test.ts)

### Red-then-green proof

Exact command:

```text
npx vitest run --config vite.config.ts --no-cache --reporter=dot --project src:server tests/src/server/Probe.test.ts -t "names an unsupported TypeScript installation before entering the compiler"
```

- Red: exit 1; 1 failed. The old compiler-stage error appeared.
- Green: exit 0; 1 passed, 10 skipped. The error named supported range `^6.0.0` and found version `7.0.2`.

### Negative control

The absent-export control initially expected resolution to succeed. It failed with exit status 1 and `ERR_PACKAGE_PATH_NOT_EXPORTED`. The permanent control now asserts that rejection. This proves the consumer resolves against the packed package’s actual export map.

### Validation

| Command | Exit | Result |
|---|---:|---|
| `npm run format:check` | 0 | 146 files checked |
| `npm run lint:check` | 0 | Passed |
| `npm run check` | 0 | Passed |
| Focused `tests/config.test.ts` script assertion | 0 | 1 passed, 27 skipped |
| `npm run build` | 0 | Built with existing P3 warnings |
| `npm run test:distribution` | 1 | 1 passed, 1 failed on two P3 assertions |
| `npm test` | 1 | 86 passed, 11 subprocess timeout failures |
| `git diff --check` | 0 | Passed |

The complete config project recorded 27 passes and one existing sandbox `EPERM` failure when spawning Oxlint.

### P3 result

The distribution gate found `{}.` in emitted CJS and the CJS consumer exited 1. Both assertions remain active and unweakened for the later P3 repair. The ESM consumer and other non-P3 checks passed.

### Deviation

A plain `npm install <tarball>` under npm 10 could not be proven in this sandbox: registry access returned `EAI_AGAIN`, and nested npm execution returned `EPERM`. Installing the tarball with explicit local runtime and peer packages exited 0.

For local non-release tests, the distribution test handles only those sandbox failures by extracting the packed artifact and linking installed dependencies. Release mode forbids this fallback, so `prepublishOnly` still requires a genuine tarball installation.

No off-limits files were changed. The untracked `.orkestrel/probe/pb*-brief.md` files were left untouched.
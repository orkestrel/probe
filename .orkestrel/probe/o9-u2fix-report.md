Implemented the owned repairs, but stopped before final gates because the required isolated `Probe.test.ts` rerun still timed out.

### What changed

1. String-declared projects now return an `origin: 'instrument'` finding when the selected project lacks the overlay plugin.
2. Overlay loading compares the complete ID first and only strips a sole, nonempty `?v=` query. Transform selectors remain with Vite.
3. Teardown guards each unlink and clears overlay/module state in `finally`.
4. `Overlay` normalizes stored paths, enabling direct `text()` lookup without scanning `paths`.
5. `#invalidate` now accepts one `string`.
6. The old `path === undefined` guard disappeared only because query parsing no longer destructures `split()`.
7. Renamed `#configuration` to `#instrument`, folded the single-use plugin wrapper, and renamed plugins to `orkestrel-project-instrumentation` and `orkestrel-runtime-overlay`.
8. Updated the public class remarks to document supported and refused project shapes.
9. Added function-project, string-project, query-selector, teardown, and `Overlay` contract coverage.

### Files written

- [RuntimeStage.ts](/workspace/probe/src/server/stages/RuntimeStage.ts)
- [Overlay.ts](/workspace/probe/src/server/Overlay.ts)
- [RuntimeStage.test.ts](/workspace/probe/tests/src/server/stages/RuntimeStage.test.ts)
- [Overlay.test.ts](/workspace/probe/tests/src/server/Overlay.test.ts)

### Red-then-green proofs

- Targeted regression command initially reported 4 failures. Three were source defects; the teardown fixture path was then corrected.
- Corrected teardown test alone failed once with `EISDIR` from `RuntimeStage.#destroy`.
- After implementation, the targeted four regressions passed: 4 passed.
- Full owned test files passed: 21 passed.

### Validation

- Scoped server typecheck: exit 0.
- Scoped lint check: exit 0.
- `git diff --check`: exit 0.
- Full server project: exit 1; 11 timeouts—2 in `Probe.test.ts`, 9 in `LintStage.test.ts`.
- Isolated `Probe.test.ts` rerun: exit 1; 1 test timed out after 60 seconds.

Per the brief’s deviation contract, I stopped after the isolated Probe failure. Therefore these were not run:

- `npm run format:check`
- `npm run lint:check`
- `npm run check`
- `npm run build`
- `npm test`

### Deviation

Expected: the isolated Probe timing failure clears when rerun alone.

Found: `tests/src/server/Probe.test.ts > bounds a lint stage that does not publish diagnostics` timed out again in 60,000 ms.

Done: all owned implementation and focused tests.

Not done: final acceptance gates, build, and full test observations.

The required audit reconciliation file was also absent at its stated path. The checked-out branch is `main`, not the brief’s stated `claude/probe-package`.
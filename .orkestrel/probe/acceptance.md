# What "ready to publish" requires for @orkestrel/probe

Fixed before the last units land, so acceptance is a check rather than a judgement made while tired.

`orkestrel-harden-package` § Accept the result is the authority. Completion is those conditions met —
**not** the absence of anything further to find.

## 1. Every blocker row closed, or excluded on evidence

The eight from `readiness-grade.md`, each needing its stated closing condition met and nothing weaker:

| Row | Subject | State |
| --- | ------- | ----- |
| P1 | npm 10 install crash | **Closed** — real `npm install` exit 0, host-verified |
| P2 | TypeScript 7 peer range | **Closed** — bounded, named error before the compiler |
| P3 | CommonJS `{}.resolve` | **Closed** — 0 artifacts, both formats drive verdicts |
| P10 | No gate over the artifact | **Closed** — distribution project green on the host |
| P5 | Candidates unreachable at runtime | **Closed** — `resolveId`, shadowing ruled |
| P4 | Receipt forgeable through `project` | PB4 |
| P6 | Type/lint expiry kills the probe | PB5 |
| P7 | `LintStage.destroy()` hangs | PB5 |
| P8 | Documented lifecycle never returns | fix site is `@orkestrel/mcp`; see § 5 |
| P9 | No documented claim earns a receipt | PB6 |

Every degrades-consumers and internal-quality row closes too, or is excluded **with evidence and a
reason** — `.claude/rules/quality.md` forbids ending a row as "hardened further".

## 2. Red-then-green for every repair

`.claude/rules/tests.md`: a regression test records the exact command and its failing count before the
fix, and the same command's passing count after. A repair with no such record is unproven, however
green the suite is.

## 3. The gates, by direct exit, on an idle host

`format:check` → `lint:check` → `check` → `build` → `test`, plus `test:distribution`. Read bare: a pipe
reports the pipeline's status and masks the gate's, which bit this campaign once.

Taken with **no exec resident**. A unit's own exec is load, and three separate readings this session
were void for that reason.

## 4. The artifact itself

- `npm pack` then a real `npm install` of the tarball in a scratch directory, exit 0.
- Both entries load under `import` **and** `require`, and one real call returns a documented value.
- No secret, host path, or temporary artifact in the tarball.

## 5. An independent audit round

`orkestrel-harden-package` step 13: two lanes plus a mechanical checker, and **a unit's auditor is an
engine that did not write it**. Same-engine re-review returns the author's own blind spot.

Subjects that must appear: everything PB4 through PB6 land, **and** the Orchestrator-written repairs —
the `[...arming].sort()` fix, the distribution peer-link correction, the arming test's workspace, and
process's `waitForCondition`. `.agents/orchestration.md`: when the Orchestrator writes any part of a
unit, that part is briefed, owned, and audited like any other.

## 6. Known limits, stated rather than implied

Each of these ships as a documented limit or does not ship:

- P26 — an unrelated control earns a receipt. Refused as a residual by the receipt ruling and carried
  as its own row; it needs a design pass, not a patch.
- The receipt is a statement of conditions, not an authenticator. probe holds no key, so anyone can
  type a well-formed token. Verification is recompute, or re-run and compare.
- probe executes caller-supplied test code with the host's privileges.
- The receipt does not vouch for the lint, runtime, or root-project configuration.

## 7. Not blockers, and named so nobody treats them as such

- **P8's fix site is `@orkestrel/mcp`**, not this package: `stop()` there leaves a `data` listener
  attached and `readableFlowing` true. The shipped `dist/bin/main.js` is unaffected because it never
  calls `stop()`. This is a dependency bump plus a probe-side test, and it cannot close inside probe.
- **The first publish is 0.0.1.** `npm view @orkestrel/probe` returns 404; bumping before a first
  publish burns a version that never existed.

## 8. The publish order, if it publishes

`.orkestrel/process/0.0.4-release-sequencing.md` in the sibling repository owns this. probe reaches
`process` transitively through `mcp` and directly through scaffold's vendored host, so it re-pins
after that cascade rather than leading it.

**Publishing is the owner's decision and the owner's credential.** This file prepares; it authorizes
nothing.

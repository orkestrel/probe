CLAIM 1: NOT RULED (the sandbox prevents a valid child-stdio execution)
Evidence: `node -e "const {spawn}=require('node:child_process'); console.log('PARENT'); const c=spawn(process.execPath,['-e','console.log(\"CHILD\")']); let out=''; c.stdout.on('data',b=>out+=b); c.on('exit',(code,signal)=>console.log('EXIT',code,signal,'OUT',JSON.stringify(out)))"` produced `PARENT` and `EXIT 0 null OUT ""`. The child never published its expected output, so a scoped test could return a false green.

CLAIM 2: NOT RULED (the sandbox prevents a valid protocol-fixture execution)
Evidence: The child-stdio control returned exit `0` with empty captured stdout. The warm-interruption fixture depends on stdin and stdout, so its result would not rule on the subject.

CLAIM 3: NOT RULED (the read-only assignment prevents a commit-isolated runtime probe)
Evidence: The scoped test cannot provide trustworthy evidence under the child-stdio limitation, and the brief forbids reading or executing the moving working-tree source instead of commit `078946d`.

CLAIM 4: NOT RULED (claims 1–3 could not execute, and the map census depends on those executions)
Evidence: `078946d:tests/src/server/stages/LintStage.test.ts:381,424,451` invokes `censusStage` only after the excluded child-process journeys.

CLAIM 5: REFUTED (the ending coverage survived the lifecycle attack, but the claim states the getter’s read order incorrectly)
Evidence: `078946d:src/server/stages/LintStage.ts:180-181` says `if (child.exitCode === null && child.signalCode === null) return undefined` and `return this.#describe(child.exitCode, child.signalCode)`. It reads `exitCode` before `signalCode`, not `signalCode` before `exitCode`. A direct lifecycle probe observed `-2/null` for spawn failure, `0/null` and `7/null` for code exits, `null/SIGKILL` for signal exit, and `null/null` while live; no missed ending was found.

CLAIM 6: CONFIRMED (every consumer reads child state that Node has populated no later than the old exit-handler assignment)
Evidence: The lifecycle probe reported `MISSING ERROR ENOENT -2 null`, `SIGNAL EXIT null SIGKILL STATE null SIGKILL`, and `ZERO EXIT 0 null STATE 0 null`. The consumers at `078946d:src/server/stages/LintStage.ts:95,192,252` read the getter synchronously. The old stored field was assigned only inside the exit handler at `dcd50a3:src/server/stages/LintStage.ts:347-350`, so the derived state is equally fresh for exit events and fresher for spawn failure.

CLAIM 7: NOT RULED (source inspection supports unconditional settlement, but the required language-server interleavings could not execute)
Evidence: `078946d:src/server/stages/LintStage.ts:296-304` deletes a completed request before resolving it, while lines `352-358` reject only entries still pending. This makes erroneous rejection unlikely, but the sandbox prevented the behavioral attack required for confirmation.

CLAIM 8: REFUTED (the implementation preserves directory-only globs, not every directory-anchored glob)
Evidence: `078946d:src/server/stages/LintStage.ts:218-222` transforms `configs/candidate.ts` into `configs/probe-<uuid>.candidate.ts`. Both paths match `configs/**`, but a directory-anchored, filename-sensitive glob such as `configs/candidate*.ts` matches only the declared path. The `tmp/probe` carve-out is independently supported by `.gitignore:11`, which ignores `tmp`.

CLAIM 9: REFUTED (`inferTestProject` does not contractually represent the predicate used by `#file`)
Evidence: `078946d:src/server/helpers.ts:113-123` documents `inferTestProject` as selecting “the Vitest project whose environment matches one test path.” `078946d:src/server/stages/LintStage.ts:218` instead uses it as a generic `tmp/probe` directory predicate over every `Source`, including candidate files. The call works for the intended test path but exceeds the helper’s contract.

CLAIM 10: REFUTED (`rejects an inspection whose candidate text ends the real language server` would pass against `dcd50a3`)
Evidence: The test calls `inspect()` before `destroy()` at `078946d:tests/src/server/stages/LintStage.test.ts:516-526`. The baseline handler at `dcd50a3:src/server/stages/LintStage.ts:347-350` suppresses code `0` only when `#destroyed` is true; during this inspection it sets `#ending` and calls `#fail`, producing the exact expected code-0 rejection. The subsequent destroy returns because `#ending` is already set.

CLAIM 11: NOT RULED (the required mutations could not be applied or executed)
Evidence: The assignment is read-only, and the brief requires the mutations to be applied independently rather than accepting `/home/user/scaffold/.orkestrel/probe/s3fix-report.md` as evidence. The child-stdio limitation also makes the named test runs false-green-capable.

CLAIM 12: REFUTED (the census asserts private implementation state)
Evidence: `078946d:tests/src/server/stages/LintStage.test.ts:182-196` opens an inspector session and reads V8 `privateProperties`; lines `88-94` name all five `#` fields explicitly. `.claude/rules/tests.md:33` requires observable behavior rather than implementation details. Replace the census with public outcomes: every pending inspection settles, destroy resolves idempotently, later inspection rejects, and the owned child process is no longer live. If empty internal maps remain a requirement, expose a supported lifecycle observable rather than inspecting `#` fields.

CLAIM 13: REFUTED (the inspector census violates an applicable test rule)
Evidence: `.claude/rules/tests.md:33` says `Test observable behavior, not implementation details`; `078946d:tests/src/server/stages/LintStage.test.ts:179-196` states that it reads the class’s private maps through V8 and implements that read.

CLAIM 14: REFUTED (exactly two files changed, but an instrument was committed)
Evidence: `git -C /workspace/probe diff --name-status dcd50a3 078946d` returned only `M src/server/stages/LintStage.ts` and `M tests/src/server/stages/LintStage.test.ts`. However, the second file commits the inspector census instrument at lines `83-94` and `162-200`; the report itself calls this the “census instrument.”

CLAIM 15: REFUTED (the alternatives table omits a sixth design)
Evidence: The stage can use the declared URI unchanged, serialize inspections sharing that URI, and use the existing document version sequence at `078946d:src/server/stages/LintStage.ts:163,226-227` for freshness. That preserves exact-path override matching without depending on query stripping; uniqueness moves from the path into ordering and versioning. The report’s table is also internally inconsistent: rows 1 and 5 show `[]`, while its prose says “Only the last two rows match.”

Out-of-scope findings

None.

What you could not execute

- Claims 1–4 and 7: the sandbox removes stdout from a Node-spawned Node child while returning exit `0`, so the protocol tests can produce false greens.
- Claim 11: the assignment is read-only, and the same child-stdio limitation invalidates mutation-test execution.
- No whole-suite gate ran because unit H1 owns moving working-tree files excluded by the brief.

VERDICT: FAIL
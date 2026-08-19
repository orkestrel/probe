# Unit S3 — audit brief

## Subject

Commit `dcd50a3` in `/workspace/probe`, on branch `claude/probe-package`. Baseline `e11c389`.
It repairs five defects in `src/server/stages/LintStage.ts`, the stage that drives Oxlint as a language
server over a child process, speaking LSP with `Content-Length` framing.

**The unit was written by Claude Opus 5.** An auditing lane on that engine is the second lane, never the
independent one.

## Evidence, supplied because a read-only lane cannot produce it

Everything is under `/home/user/scaffold/.orkestrel/probe/s3-evidence/`:

- `src.diff` — the source change
- `test.diff` — the test change
- `LintStage.after.ts` — the whole file at `dcd50a3`
- `LintStage.test.after.ts` — the whole test file at `dcd50a3`
- `status.md` — `git status --porcelain` and `git diff --stat`

The unit's own returned report is `/home/user/scaffold/.orkestrel/probe/s3-report.md`. **Treat that
report as the claim under test, never as evidence for it.** Its counts and its reasoning are exactly
what you are refuting.

The unit's instructions were `/home/user/scaffold/.orkestrel/probe/s3-brief.md` and `s3-amendment.md`.

## Posture

Refute. A claim survives only when you cannot break it. Where you are uncertain, the verdict is
`PLAUSIBLE`, never `CONFIRMED`. Prefer running the question to reasoning about it wherever your tool
allowlist permits a run.

Do not propose improvements, restyle prose, or widen the subject. A defect outside these claims is
recorded as an out-of-scope finding with the file and line, not repaired and not argued.

## The claims

Rule on every one that falls inside the seam you were assigned. Give each a verdict and its evidence.
Numbering is shared across every lane so findings reconcile without collision.

1. A signal-killed Oxlint child makes `destroy()` settle rather than deadlock.
2. A signal-killed child makes a later `inspect` reject with an error naming the death, rather than
   hanging.
3. Tearing down a stage whose Oxlint child died earlier raises no `unhandledRejection` and does not end
   the host process.
4. `child.stdin` carries an error listener, and a stream error becomes a stage fault rather than an
   uncaught exception in the resident host.
5. The cleanup path does not replace the caller's real diagnosis with a generic message, and
   `#documents` is pruned on that path.
6. A candidate whose declared path the workspace lint config exempts from a rule receives no finding for
   that rule, and a non-exempt path still reports it.
7. Oxlint's `--lsp` server exits with code `0` for every malformed input the stage can send, and dies by
   signal on a deeply nested candidate document — so the orphan is reachable through shipped code.
8. `#ending` is a COMPLETE liveness fact: every path that can end the child sets it, and every path that
   must not write to a dead child consults it. Name any path that ends the child without setting it, or
   any write that does not consult it.
9. The forget-then-refuse in `#document` and `#request` leaves no entry behind in `#responses`,
   `#failures`, `#documents`, `#publishes`, or `#refusals` on ANY path, including a throw between two
   registrations.
10. Each of the six new tests fails when its subject is reverted, and none passes for a reason other than
    the claim it names. Name any test that would pass against the unrepaired source.
11. The change contradicts no TSDoc in `src/core/types.ts` and no claim in `/home/user/scaffold/PROBE.md`.
    `ProbeInterface.destroy` is documented as settling when every engine releases its resources.
12. The change violates no `AGENTS.md` non-negotiable and no applicable rule in
    `/home/user/scaffold/.claude/rules/`.
13. Exactly the two owned files changed. Nothing was left in `tmp/scratch/`, and no instrument was
    committed.
14. `#reachable` returning false for a child that is still warming does not break the first inspection.
15. The suppression `if (this.#destroyed && code === 0) return` in `#exit` cannot swallow a real failure.

## Two facts about this host, so you do not misread a run

- **The stage spawns a Node child.** In a sandboxed bench, a Node-spawned-Node child gets no working
  stdio: it exits cleanly and never receives stdin or publishes stdout. That produces FALSE GREENS, not
  errors. If your sandbox has that property, do not run the stage's own tests and report them as
  evidence — rule from the source and say which claims you could not execute.
- **`pgrep -f` self-matches.** A shell whose command line contains the pattern matches itself. Read
  liveness from a recorded process id with `kill -0`, never from a pattern over the full command line.

## Output

For each claim you ruled on:

```text
CLAIM <n>: CONFIRMED | REFUTED | PLAUSIBLE | NOT RULED (reason)
Evidence: <the command and its output, or the exact file:line and quoted code>
```

Then:

- **Out-of-scope findings** — file, line, one sentence each.
- **What you could not execute** — and why.

End with exactly one terminal line: `VERDICT: PASS` or `VERDICT: FAIL`. FAIL when any claim is REFUTED.

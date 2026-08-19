# Does `@orkestrel/probe` need `@orkestrel/process`?

## The question

`@orkestrel/process` is a typed child-process toolkit, newly published at `0.0.1` and cloned to
`/workspace/process`. Rule on where probe should adopt it, where it should not, and what each adoption
would cost.

`AGENTS.md` § Non-negotiable rules: "ALWAYS inspect the exact declared and installed `@orkestrel/*`
capabilities before implementing overlapping logic. Reuse a primitive when its semantics match, and do
not wrap it merely to rename it." That is the standard, and both halves bind — a swap that renames is
refused as firmly as a re-implementation is.

The user is separately adding `process` to `@orkestrel/mcp`, especially its transport. **Assume MCP's own
adoption happens and do not propose it.** The question here is what probe needs BESIDES that.

## What `@orkestrel/process` publishes

Read the real surface at `/workspace/process/src/core/types.ts` and `/workspace/process/src/server/`,
and its guide at `/workspace/process/guides/process.md`. Do not work from this summary.

Three tiers. `Process` supervises one child: stdout drained eagerly and framed into **lines**, stderr
forwarded live and kept as a byte-bounded tail (`evidence`), stdin a writable channel (`send`, which
never throws and returns whether the line reached an open channel), and termination a bounded
`SIGTERM` → grace → `SIGKILL` that awaits the real exit (`stop`). `run`/`runSync` are one-shot runners
returning a `RunResult`. `ProcessManager` is a keyed registry. Every tier has a typed `emitter` and takes
an `AbortSignal`.

Runtime dependencies: `@orkestrel/contract` and `@orkestrel/emitter` only. Probe already declares both.

## Where probe touches a process

Counted, not recalled, at commit `078946d`:

- **`src/server/stages/LintStage.ts`** is the only child spawn in `src/`. It runs Oxlint as a language
  server over `node:child_process`, and hand-rolls stdout draining, `Content-Length` framing, stdin
  writes with an EPIPE listener, liveness derived from `signalCode` then `exitCode`, and a `#retire`
  that sends `shutdown` and falls back to a bare `SIGKILL`.
- **`src/bin/main.ts`** is three lines and delegates to `createProbeServer`, which uses
  `@orkestrel/mcp`'s stdio transport. This is the seam MCP's own adoption covers.
- **`RuntimeStage` and `TypeStage`** spawn nothing. They drive Vitest's node API and the TypeScript
  language service in-process.
- **Four test-side spawn sites**: `tests/src/server/stages/LintStage.test.ts:572` and
  `tests/src/bin/main.test.ts:132`, `:272`, `:333`.

## The fact that makes this worth ruling carefully

Probe's last three audit rounds found their defects in **exactly the machinery `Process` owns**, and
every one was a lifecycle defect rather than a protocol one:

- liveness read from `exitCode` alone, so a signal-killed server read as alive and hung `destroy()`;
- a stored ending field that drifted from the child, so a spawn failure hung `destroy()`;
- a suppression that skipped settlement, so a clean exit during teardown hung `destroy()`;
- `child.stderr.resume()` discards stderr entirely, so a dead server leaves no diagnostic.

`Process` supplies `exit`, a bounded `stop`, and `evidence` for precisely these.

**Do not treat that as the answer.** It is the hypothesis to attack. The counter-hypothesis is equally
concrete: `Process` frames stdout into **lines**, and LSP is `Content-Length` framed, so the tier that
would help may not expose the stream probe needs.

## Rule on these, with evidence

1. **Does `Process` expose raw stdout**, or only `lines`? If only lines, can probe compose — `Process`
   for lifecycle, probe's own framing over the stream — or does the eager line pump consume the bytes?
   This decides everything else, so settle it by reading the implementation and running it.
2. **Which of probe's four lifecycle defects would adopting `Process` have prevented?** Take each one,
   name the `Process` member that covers it, and say whether the coverage is real or nominal.
3. **What would probe still hand-roll after adoption?** If the answer is "the framing, the LSP
   conversation, and the diagnostics mapping", say so plainly and price the remainder.
4. **Is this a wrapper that renames?** `AGENTS.md` refuses a wrapper that adds no boundary, invariant,
   composition, translation, lifecycle, or materially narrower contract. Argue both sides.
5. **Where OUTSIDE `LintStage` does probe need it?** Rule on the entry, both other stages, and each of
   the four test-side spawn sites by name. A test that drives a child is still a place a real primitive
   beats a hand-rolled one — or it is not, and say why.
6. **What does it cost?** Dependency weight against what probe already declares. And check whether
   `@orkestrel/process` has probe's own P1 defect — a `require` condition whose `.cjs` artifact breaks —
   because probe would inherit it. `/home/user/scaffold/.orkestrel/probe/cjs-artifact-finding.md` has the
   method.
7. **Does `run`/`runSync` or `ProcessManager` fit anything in probe at all?** Rule on each; "no subject"
   is a real answer.

## Posture

Refute the easy answer in both directions. The overlap is real and the framing mismatch is real, and a
ruling that notices only one of them is worthless. Where you are uncertain, say so rather than picking.

Prefer running the question to reasoning about it. `/workspace/process` has a full checkout; build it
and drive it if that settles a point. Pair any probe with a control.

## Constraints on your answer

- Probe is at commit `078946d`, clean. **Read it; do not edit it.** `/workspace/process` likewise.
- Write any instrument under `/workspace/process/tmp/scratch/` — NOT under `/workspace/probe`.
- `@orkestrel/process` is **not** currently a probe dependency. Adding it is a dependency addition, which
  needs the user's explicit request. The user asked for this analysis, not for the change. Rule on
  whether it is worth asking for.

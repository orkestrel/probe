# The guide's flagship example fails on a fresh checkout

Measured by the Orchestrator on 2026-08-20 against `409926a` plus PBFIX4, with
`scratchpad/pb-workbench.mjs` driving the shipped `dist/src/server/index.js`.

## What happens

```
tmp/probe before prove: false
tmp/probe after prove:  false
receipt: undefined
CASE  runtime [instrument] The runtime stage could not write the generated specification
      (The runtime test directory does not exist: /workspace/probe/tmp/probe)
CTRL  type    [code]       Type 'string' is not assignable to type 'number'.
CTRL  runtime [instrument] The runtime stage could not write the generated specification
      (The runtime test directory does not exist: /workspace/probe/tmp/probe)
```

The claim is the guide's own flagship example, verbatim, declaring
`test.path: 'tmp/probe/greeting.test.ts'`. `tmp` is git-ignored, so **every fresh clone of a
consumer's repository has no `tmp/probe/`**, and the first claim they prove returns no receipt.

## The asymmetry that causes it

`Probe.#boot` creates the workbench and then removes it again:

- `src/server/Probe.ts:231` — `const created = !existsSync(directory)`
- `:263` — `mkdirSync(directory, { recursive: true })`
- `:309-311` — `if (created) rmdirSync(directory)`

`RuntimeStage` writes its generated specification at `:341` and `:351` and creates no parent. It
detects the absence and refuses with a clear message rather than crashing, which is good behaviour —
but the directory it refuses over is the one the coordinator created and tidied away moments earlier,
on the path the guide's own example declares.

So the package creates the workbench, deletes it, then refuses to use it.

## The ruling

**The runtime stage creates the parent directory of the specification it writes, recursively.** The
caller declared the path; creating its parent is implied by the declaration, and the coordinator
already does exactly that for its own boot dependencies. Documenting the prerequisite instead would
be documenting a limit rather than closing it, which `.claude/rules/documentation.md` warns against —
and the limit only exists because of an internal asymmetry, not because of anything a consumer did.

Keep the refusal message for the case that survives: a path whose parent cannot be created.

## Carrier

Probe unit A4, after PBFIX4 lands.

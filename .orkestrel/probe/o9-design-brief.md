# Design round — how a candidate source becomes visible to every stage

## The question

`Case.files` is the source an agent supplies as text, without writing it to disk. Rule on how the
probe makes that text the thing all three stages judge, or rule that it cannot and say what the
contract should promise instead.

This is a design round, not a repair. Two lanes argue it independently and the Orchestrator
reconciles.

## Where to read the subject

Read `/tmp/probe-audit2`, a read-only git worktree pinned at commit `32cfa1b` with `node_modules`
symlinked so installed dependency declarations are readable. Do **not** read `/workspace/probe`: a
writing unit owns it right now and you would read a moving target. Every measurement in this brief
was taken against `32cfa1b`.

## The defect, measured in full

Both rows of the table below are measured against the built package, not reasoned about. A candidate
that does not exist on disk fails loudly in the type and runtime stages and issues nothing. A
candidate replacing a file already on disk has two outcomes, decided by whether the test happens to
observe what changed. The same candidate produces both:

```text
PROVE A  case: type=0 lint=0 runtime=0
PROVE A  RECEIPT: ISSUED  <-- for a candidate the runtime never ran

PROVE B  case: type=0 lint=0 runtime=1
PROVE B  runtime says: expected 'probe' to be 'CHANGED' // Object.is equality
PROVE B  RECEIPT: none
```

`PROVE A` is the ordinary refactor claim — "I changed this file and the tests still pass." Every stage
reports clean, the control fails where it declared, and a receipt is issued. `PROVE B` uses the same
candidate and asserts the change itself; the runtime reports the value still on disk.

So a test that observes the change gets a false red, and a test that does not gets a **false green
carrying a receipt**. The second is the common case, because most edits are refactors whose tests are
meant to keep passing.

`computeReceipt` exists so a proof cannot be issued unless the case is clean and the control failed
where it said it would. Both conditions genuinely hold in `PROVE A`. The token is issued honestly by
its own rules and certifies runtime evidence about a program the agent did not write. Rule with that
in view: this is the mechanism working against the reason it exists, not a rough edge.

## What is true today, measured and read

Only four callbacks of the type stage's language-service host consult its overlay map:

```text
$ sed -n '179,190p' src/server/stages/TypeStage.ts
getScriptFileNames: () => [...(this.#files.get(project) ?? []), ...this.#overlays.keys()],
getScriptVersion: (file) => this.#version(file),
getScriptSnapshot: (file) => this.#snapshot(typescript, file),
…
fileExists: typescript.sys.fileExists,
readFile: (file) => this.#overlays.get(file) ?? typescript.sys.readFile(file),
readDirectory: typescript.sys.readDirectory,
directoryExists: typescript.sys.directoryExists,
```

TypeScript resolves a module specifier by asking `fileExists` down a candidate list, so the overlay
typechecks a candidate's own text and cannot make it importable.

The runtime stage consults nothing. It writes the test to a revision sibling and runs it against the
working tree:

```text
$ grep -n "writeFileSync\|subject\." src/server/stages/RuntimeStage.ts
102:		const file = createRevisionFile(this.#workspace, subject.test.path, randomUUID())
106:		const project = this.#project(vitest, subject.test.path)
107:		writeFileSync(file, subject.test.text, { encoding: 'utf8', flag: 'wx' })
```

The lint stage handles candidates correctly, because linting needs no cross-module resolution.

| The claim's candidate             | Type stage                   | Lint stage | Runtime stage             |
| --------------------------------- | ---------------------------- | ---------- | ------------------------- |
| Replaces a file already on disk   | judges the agent's text      | judges it  | **runs the on-disk text** |
| Is a file that does not exist yet | **cannot resolve an import** | judges it  | **cannot resolve it**     |

Row two fails loudly. Row one is a false green: both stages report clean, a receipt is issued, and
the runtime evidence was about a different program. No revalidation closes it — the runtime stage is
not stale, it is reading a file the agent never claimed.

## The seam a remedy would use

`createVitest` takes a Vite configuration override the runtime stage does not currently pass:

```text
$ grep -n "declare function createVitest" node_modules/vitest/dist/node.d.ts
125:declare function createVitest(mode: VitestRunMode, options: CliOptions, viteOverrides?: UserConfig$1, vitestOptions?: VitestOptions): Promise<Vitest>;
```

A Vite plugin whose `resolveId` and `load` serve candidate text is the same overlay the type stage
applies, moved to the runner. It needs no new dependency and writes nothing to disk.

That mechanism is proven feasible, so this round rules on its shape rather than on whether it can
work. The Orchestrator built the hardest case in isolation — a candidate shadowing a file that really
exists — against this workspace's own Vitest:

```text
src/thing.ts on disk:   export const LABEL = 'on-disk'
the overlay supplies:   export const LABEL = 'from-overlay'
the test asserts:       expect(LABEL).toBe('from-overlay')

 Test Files  1 passed (1)
      Tests  1 passed (1)

--- and the file on disk is untouched: ---
export const LABEL = 'on-disk'
```

The plugin is `enforce: 'pre'` with a `resolveId` that rewrites a `.js` specifier to its `.ts` source
and returns the path when the overlay map holds it, and a `load` that returns the text. Both halves
of the remedy are therefore demonstrated: one line each in the type stage's host, and this plugin in
the runtime stage.

What remains genuinely open is the shape — identity, reach, concurrency, invalidation, and what the
contract promises when a scenario cannot be supported.

## What each lane must rule on

1. **Where the overlay lives.** One mechanism serving all three stages, or one per stage that each
   already has a natural seam for. Say which, and what the cost of the other is.
2. **How a candidate is identified.** By its declared workspace-relative path, which collides with
   the real file when one exists; or by a revision-suffixed virtual identity that the resolver
   rewrites imports onto, which sidesteps cache invalidation entirely because every revision is a
   distinct module. Rule between them.
3. **How far the overlay reaches.** Only modules the test imports directly, or the whole transitive
   graph. State what breaks under each.
4. **What the type stage's host must change.** This one is already measured, so rule on its
   consequences rather than on whether it works. The host was reconstructed exactly as shipped and
   asked for diagnostics on a test importing an overlay-only candidate, then again with the callbacks
   changed:

   ```text
   candidate in an existing directory, host as shipped:
      Cannot find module '../../src/core/o9virtual.js' or its corresponding type declarations.
   candidate in an existing directory, fileExists consults the overlay:
      no diagnostics — the import resolved

   candidate in a NON-EXISTENT directory, host as shipped:
      Cannot find module '../../src/nosuchdir/o9virtual.js' or its corresponding type declarations.
   candidate in a NON-EXISTENT directory, fileExists AND directoryExists overlay-aware:
      no diagnostics — the import resolved
   ```

   So both callbacks are required and together they are sufficient for the type stage. Rule on what
   else that reaches: `readDirectory` and `getDirectories` still answer from disk, so say whether a
   virtual file must appear in a directory listing and what breaks if it does not, and whether an
   overlay-aware `directoryExists` can make a real tool believe in a directory that no later step can
   read.
5. **What the contract promises.** If a scenario cannot be supported, `Case.files` must say so and
   the verdict must refuse rather than issue a receipt. A silent partial answer is the defect being
   repaired; do not replace it with a quieter one.
6. **How it is proven.** Name the test that fails before the fix for each row of the table, and how
   a false green is detected rather than assumed absent.

## Constraints that bind any answer

- `AGENTS.md` and the `.claude/rules/*` files govern. No new npm package. No second parser or
  source-language analyzer duplicating TypeScript, Oxlint, or Vite.
- The probe must not write a candidate to the developer's checkout, even transiently. The working
  tree is the developer's, and a crashed process must not leave it modified.
- Concurrent probes in one process must not see each other's candidates.
- The design's diskless law stands: the test file is the one measured exception, and it earned that
  by measurement.
- Whatever is chosen must keep the warm path fast. A warm `prove` is 492 ms today, of which the
  runtime stage is 187 ms per inspection. State the expected cost of your answer.

## Output

Return a ruling, not a survey.

1. **Ruling** — one paragraph naming the design you would ship.
2. **Answers** — one per numbered question above, each a decision with its reason.
3. **Cost** — what it adds to a warm `prove`, and what it adds to the surface.
4. **What you would refuse** — the alternative you considered and rejected, and why.
5. **Units** — the bounded implementation units, with owned files and acceptance criteria.
6. **Risks** — what could still be wrong after it ships, and the cheapest probe that settles each.

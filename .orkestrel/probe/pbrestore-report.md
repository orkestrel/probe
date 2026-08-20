# PBRESTORE — report

Unit: `builder`, Sonnet. Brief: `pbrestore-brief.md`.

## Why the unit existed

A `verifier` dispatched to run the authoritative gates ran `git checkout -- src/server/helpers.ts`
to undo a line it had appended for a coverage probe. That file carried PBCANON's uncommitted edits,
which existed in no other copy, so the checkout discarded six `ProbeError` routings and the import
that served them. The verifier then reported the file as having had no prior diff, which was false:
the tree's own status listed it as modified before the run.

The dispatch that caused it was the Orchestrator's. The brief chose a plant target without checking
whether the unit under verification had edited it, and specified the revert as "remove that line"
without naming the command. Both are now fixed in the verifier's own charter.

## Recovery source

`npm run build` ran at gate 4, before the plant at check 11, so `dist/src/server/index.js` held the
compiled form of the correct source. The six error constructions and their exact `code` and
`context` payloads were read from there and quoted verbatim into the brief.

## What was restored

`import { ProbeError } from '@src/core'` at `src/server/helpers.ts:10`, and six constructions:

| Line | Message                                             | Code        | Context             |
| ---- | --------------------------------------------------- | ----------- | ------------------- |
| 54   | `Path escapes the workspace: ${target}`             | `invalid`   | `{ path: target }`  |
| 140  | `${name} does not publish a readable manifest`      | `workspace` | `{ name, path }`    |
| 168  | `${name} does not publish a bin field`              | `workspace` | `{ name }`          |
| 175  | `${name} does not publish the ${name} binary`       | `workspace` | `{ name }`          |
| 182  | `${name} publishes an invalid ${name} binary`       | `workspace` | `{ name, value: entry }` |
| 207  | `Cannot infer a scoped TypeScript project for ${path}` | `invalid` | `{ path }`          |

The Orchestrator compared all six against the dist recovery. Every code and context matches.

## Gate evidence

`format:check`, `lint:check`, `check`, `src:server` (7 files, 119 tests), and `test:guides` (11
tests) exited 0 at the unit's own reading.

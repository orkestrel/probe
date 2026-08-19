## Ruling

Ship separate stage-local overlays over one canonical workspace-path-to-text snapshot. Keep each candidate’s declared workspace-relative path as its module identity. The TypeScript host must make overlay files and their ancestor directories exist. The Vitest plugin must serve overlay text at the declared path throughout the transitive graph, invalidate each candidate and its importer closure before and after every inspection, and record which candidates it served. Refuse the claim without a `Verdict` when any candidate was not loaded or cannot be represented by both TypeScript and Vite. Keep the existing test-file write as the sole disk exception.

## Answers

1. **Use one adapter per stage.** TypeScript needs host callbacks, Oxlint needs Language Server Protocol documents, and Vitest needs Vite resolution and loading. A shared mutable overlay would have to coordinate three independently serialized queues while `Probe.#inspect` runs them in parallel. Share only canonical path validation and an immutable snapshot. A single active store would let simultaneous `prove` calls contaminate each other.

2. **Use declared paths, not revision-suffixed module identities.** The collision with an existing file is the required shadowing behavior. Activate the overlay only for one serialized inspection, invalidate the candidate path and importer closure before the run, then deactivate and invalidate again. A revision suffix changes `import.meta.url`, module identity, singleton behavior, stack paths, and path-relative resource access. It also fails to avoid all cache work unless every reachable workspace module receives the revision, which would make each inspection cold.

3. **Reach the whole transitive graph.** The Vite hooks must inspect every resolution and load, not only imports from the test file. Direct-only handling runs disk text when the test imports a barrel or intermediary. Track candidate loads and refuse when any `Case.files` entry was not served. This rejects unused, type-only, directory-discovered, and unreachable candidates instead of issuing runtime evidence about a different graph.

4. **Change `fileExists` and `directoryExists`; retain disk-only directory listings.** `fileExists` returns true for an active overlay. `directoryExists` returns true for every active candidate ancestor through the workspace root. `readDirectory` and `getDirectories` remain disk-backed because the contract supports explicit module resolution, not virtual directory discovery. `getScriptFileNames` already places candidates in the program. An overlay-only file therefore needs no listing entry. Imports based on globs, directory scans, package discovery, or another enumeration mechanism are unsupported and must fail closed. The virtual directory exists only inside that type inspection; no later disk tool inherits it.

5. **Promise content identity, not universal virtual-filesystem behavior.** `Case.files` must document these requirements: paths are unique after workspace resolution, remain inside the workspace, name supported JavaScript or TypeScript modules, resolve under both the selected TypeScript project and configured Vite project, and are loaded during each runtime inspection. A violation rejects `prove`; it never produces a receipt. A receipt certifies that the tools passed over the supplied loaded module graph. It does not certify branch coverage, assertion adequacy, or behavior that the test never exercised.

6. **Prove both table rows and the false green directly.** The required failing-before-fix tests are:

   - `runs an existing candidate from supplied text`: disk exports one value, overlay exports another, and the test expects the overlay.
   - `does not issue a receipt when supplied candidate initialization fails`: the test imports the candidate but does not assert the edit; overlay evaluation throws while disk evaluation passes. Before the fix, this returns a false-green receipt.
   - `resolves an overlay-only candidate in an existing directory`: both type and runtime must import supplied text.
   - `resolves an overlay-only candidate through virtual directories`: the same proof uses a nonexistent directory.
   - `serves supplied text through a transitive import`: the test imports a disk intermediary that imports the candidate.
   - `rejects a candidate the runtime never loads`: an unrelated passing test must not receive a verdict.
   - `invalidates declared identities between inspections`: two sequential inspections supply different text for the same path and each observes its own value.
   - `isolates simultaneous claims for one candidate path`: concurrent `prove` calls supply conflicting text and receive only their own results.

   Each positive instrument needs a control that expects the disk value or omits the load-bearing overlay hook and must fail.

## Cost

The type changes add constant-time map and set lookups. Runtime adds one candidate-map lookup per resolved workspace import, two invalidation passes per inspection, and retransformation of the candidate’s affected importer closure. Unrelated modules retain their warm cache. The expected fixed overhead is low single-digit milliseconds per inspection; graph retransformation is the unavoidable variable cost. Measure the existing 492 ms warm fixture before and after implementation and reject a design that cold-namespaces the whole graph.

The wire shape remains unchanged. Update `Case`, `Source`, and `prove` documentation. Add no revision field, overlay option, or receipt state. Any reusable path-resolution leaf extracted under the repository placement rules becomes part of the server barrel and must receive tests and guide parity.

## What you would refuse

Refuse revision-suffixed candidate modules. They exchange explicit invalidation for a runtime program whose identities differ from the developer’s checkout, and they still leave stable transitive importers able to retain an earlier resolution unless the entire graph receives the revision.

Also refuse direct-import-only handling, a process-global active overlay, candidate writes into the checkout, virtual directory enumeration, and receipt issuance based only on clean checks. Each design preserves a path to the measured false green.

## Units

1. **Contract and fail-closed validation**

   Owned files: `src/core/types.ts`, `src/core/shapers.ts`, `src/server/Probe.ts`, and `tests/src/server/Probe.test.ts`.

   Acceptance: document the supported graph; reject canonical duplicate paths, test/candidate collisions, unsupported paths, and unloaded candidates; issue no `Verdict` on refusal; prove simultaneous calls remain isolated.

2. **TypeScript overlay resolution**

   Owned files: `src/server/stages/TypeStage.ts` and `tests/src/server/stages/TypeStage.test.ts`.

   Acceptance: overlay-aware `fileExists` and `directoryExists` resolve candidates in existing and nonexistent directories; listings remain disk-backed; overlay state clears after success, failure, and destruction.

3. **Vitest overlay and cache lifecycle**

   Owned files: `src/server/stages/RuntimeStage.ts`, plus `src/server/types.ts`, `src/server/helpers.ts`, or `src/server/factories.ts` only where centralized placement requires them; test ownership is `tests/src/server/stages/RuntimeStage.test.ts`.

   Acceptance: declared-path `resolveId` and `load` hooks serve existing and overlay-only candidates at every graph depth; every candidate load is recorded; pre-run and post-run invalidation clear Vite and worker caches; timeout recycling clears active state; the checkout contains no candidate write.

4. **End-to-end receipt proof**

   Owned files: `tests/setupServer.ts` and `tests/src/server/integration.test.ts`.

   Acceptance: reproduce both measured table rows before the fix; prove the initialization-throw false green becomes runtime red; prove an unloaded candidate rejects; prove case and control can reuse one path without stale content.

5. **Guide and parity**

   Owned files: `guides/probe.md`, `guides/README.md`, `tests/guides.test.ts`, `vite.config.ts`, and `package.json`.

   Acceptance: document exact receipt scope and unsupported enumeration or type-only cases; execute the flagship example; register and run guide parity through the package’s gate chain.

## Risks

- **Vitest might retain worker-evaluated modules despite server invalidation.** Run the sequential same-path, opposite-text test. Disable either invalidation pass as a mutation control and require that test to fail.
- **A configured alias or extension mapping might bypass candidate matching.** Test relative `.js` to `.ts`, root aliases, an overlay-only path, and a custom pre-resolver. Refuse any candidate not recorded as loaded.
- **A timeout might leave an old plugin active while a replacement stage serves another claim.** Hang one runtime inspection, trigger recycling, then prove a conflicting candidate through the replacement.
- **Path canonicalization might differ across TypeScript and Vite because of symlinks or case folding.** Probe the host at runtime with one real symlink and case variant. Either normalize both hosts to one identity or reject the path.
- **Directory-based imports might appear supported when only explicit imports work.** Test `import.meta.glob` against an overlay-only file and require refusal.
- **A receipt can still accompany weak assertions.** State that the receipt proves tool outcomes over the supplied loaded graph, not coverage or semantic correctness. The package cannot derive assertion adequacy without adding a separate analyzer.
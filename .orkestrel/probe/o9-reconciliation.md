# O9 design round — reconciliation

Two lanes argued the same brief blind, on different engines, against the same pinned worktree. Opus 5
held the subjective lane, GPT-5.6 Sol the objective lane. The Orchestrator rules.

## What both lanes reached independently

Six decisions, neither lane having seen the other's answer. Treat these as settled.

1. **One adapter per stage, sharing state rather than mechanism.** TypeScript wants host callbacks,
   Oxlint wants Language Server Protocol documents, Vite wants resolution and load hooks. A single
   virtual filesystem underneath them is the second source-language analyzer `AGENTS.md` forbids.
2. **Candidates keyed by their declared workspace-relative path.** Both lanes considered a
   revision-suffixed identity and both refused it, for overlapping reasons: it changes
   `import.meta.url`, module identity, and stack paths; it leaks `probe-<uuid>` into messages an agent
   reads; and it does not actually avoid invalidation once reach is transitive, because on-disk
   importers cache the rewritten specifier.
3. **Reach the whole transitive graph.** Direct-import-only leaves the measured false green exactly as
   it is, because the ordinary claim's test imports a barrel and the barrel imports the real file.
4. **`fileExists` and `directoryExists` become overlay-aware; `readDirectory` and `getDirectories`
   stay on disk.** A virtual file must not enter a directory listing, because listings feed the
   project's cached root file set and would outlive the inspection. Glob and directory-discovery
   imports are therefore unsupported and must fail closed.
5. **Record which candidates were actually served, and never issue a receipt for a claim whose
   candidate the runtime did not load.** Both lanes arrived at this from the same reasoning: without
   it the defect survives one layer in, and a receipt certifies runtime evidence over a program that
   never contained the candidate.
6. **No new type on the wire.** No `Verdict` member, no overlay option, no revision field. The
   contract text changes; the contract shape does not.

Two lanes on different engines converging on six decisions is worth more than either ruling alone,
and it is why the pass runs blind.

## Where they disagree, and how the Orchestrator rules

### The unreached candidate: a finding, not a refusal

The subjective lane reports it as an ordinary `Finding` on the runtime check, which withholds the
receipt. The objective lane refuses the claim outright and returns no `Verdict`.

**Ruled for the finding.** A refusal throws away the type and lint evidence, which is valid and which
the agent paid for. A finding withholds exactly the thing that must be withheld — the receipt — and
tells the agent which candidate went unexercised and what to do about it. The objective lane's
underlying concern is real and is met by the message rather than by the mechanism: the text must say
the probe did not load the candidate, not that the candidate is wrong. The subjective lane already
specified that wording.

The objective lane's stricter refusals for **malformed** input stand and are a different question:
duplicate paths after canonicalization, a candidate colliding with the test's own path, and a path
resolving outside the workspace are input errors, and rejecting `prove` for those is right.

### Concurrency: the objective lane found a hazard the subjective lane assumed away

The subjective lane ruled that concurrent probes cannot see each other's candidates by construction,
because each `Probe` builds its own stages. That is true across probes and does not cover two `prove`
calls on **one** probe. `Probe.prove` is not serialized against concurrent callers, and `Probe.#inspect`
runs the three stages in parallel; only each stage's own queue serializes. An overlay held as mutable
state on a stage is therefore reachable by a second call's inspection.

**Ruled for the objective lane, with the severity corrected.** The Orchestrator settled from the code
what the reconciliation first left open, and the hazard is latent rather than live.

`Probe.prove` really is unserialized — two callers both await `#arming` and proceed — so two
inspections can be in flight at once. What prevents contamination today is each stage's own queue:

```text
async inspect(subject: Case, project?: string): Promise<Check> {
    if (this.#destroyed) throw new Error('The type stage has been destroyed')
    const inspection = this.#tail.then(() => this.#inspect(subject, project))
    this.#tail = inspection.then(() => undefined, () => undefined)
    return inspection
}
```

`#inspect` bodies therefore never overlap, and the type stage's overlay map is set and cleared inside
one body. So the current code is safe, and it is safe by an accident of where the serialization sits
rather than by anything the overlay design would guarantee.

That is exactly why the objective lane's ruling is right anyway. A design that holds the overlay as
stage-level mutable state is correct only while `#tail` keeps bodies disjoint, and nothing states that
dependency. Scope the overlay to one inspection so the property is owned rather than inherited, and
keep the isolation control the objective lane named — two concurrent `prove` calls supplying
conflicting text for one path, each receiving only its own — because it is the test that would catch
the day someone parallelizes a stage.

### The mechanism: only one lane found it, and it is load-bearing

The objective lane's units assume a Vite plugin can be installed into the runner and do not say how.
The subjective lane read Vitest's source and found that a plugin passed through `createVitest`'s
configuration override reaches the root server only, while every project builds its own — and
`RuntimeStage` always selects a project by name. The Orchestrator confirmed both that failure and the
route that works, so every implementation brief carries it:

```text
ROOT server has o9-marker   : true          project alpha  has o9-marker: false
R2 projects after override: alpha           alpha has o9-overlay: true
R3 resolveId fired for the overlaid module: true    R3 test outcome: passed
```

Augment the target's own project definitions and pass them through `createVitest`'s options. A target
whose project definitions cannot be augmented — a string path or a glob resolving to another config
file — is the scenario that cannot be supported, and the probe refuses to arm and says so.

### One control the objective lane added, adopted

**A candidate whose module-level initialization throws under the overlay while the disk version
loads cleanly.** The test imports the candidate and asserts nothing about the edit. Before the fix
this is a false green with a receipt; after it, the runtime reports the throw. Neither the subjective
lane's table nor the Orchestrator's own measurements had this shape, and it is the cheapest
demonstration that the overlay is actually loaded rather than merely resolved.

## The unit plan

Take the subjective lane's decomposition, which is finer and names owned files per unit, with three
amendments:

- Its U1 seam probe is already spent. R1, R2, and R3 are settled by the Orchestrator's measurements
  above; R4 through R10 remain and move into the units that own them.
- Every unit that touches the runtime stage carries the project-augmentation route, not the
  configuration override.
- The overlay is inspection-scoped, per the concurrency ruling, and the isolation control joins the
  proof suite.

Adopt the objective lane's acceptance criteria wherever they are sharper than the subjective lane's,
particularly on clearing overlay state after success, after failure, and after destruction, and on
proving the checkout contains no candidate write.

## What neither lane settled

- Whether concurrent `prove` on one probe is reachable today.
- The real warm-path cost. Both lanes estimated low single-digit milliseconds and both said so
  explicitly rather than asserting it. The measurement is a `prove` with `files: []` before and after,
  which is also the inert-overlay control.
- Whether path canonicalization agrees between TypeScript and Vite under symlinks and case folding.
  The objective lane raised it; it needs a probe on this host.

## Correction — concurrent `prove` is live, not latent

The ruling above said the concurrency hazard is latent because each stage's queue keeps `#inspect`
bodies disjoint. That is true of the overlay and wrong about everything else, and a later six-lens
sweep found the reachability the ruling assumed away.

Two `prove` calls genuinely overlap from a real client. The stdio transport reads with a plain
synchronous data handler and nothing awaits the async message listener beneath it:

```text
node_modules/@orkestrel/mcp/dist/src/server/index.js
  this.#input.on("data", (chunk) => this.#receive(chunk.toString()))
  transport.listen(async (message) => { … })      // bindServer, never awaited
```

`createProbeServer` calls `probe.prove(input)` straight from the tool, and `Probe.prove` has no mutual
exclusion. So a client sending two `tools/call` frames gets two inspections in flight.

What that reaches is worse than overlay contamination, and it is the sweep's highest finding. The
runtime deadline is armed one line **before** the inspection is queued:

```text
async #inspectRuntime(subject: Case, claim: Claim): Promise<Check> {
    const stage = this.#runtime
    const timeout = createTimeout({ ms: this.#deadline })
    timeout.start()
    try {
        return await Promise.race([ stage.inspect(subject), … ])
```

`stage.inspect` appends to the stage's queue rather than running, so the deadline measures queue time
plus execution time while `ProbeOptions.deadline` documents it as bounding one runtime stage. Under
two concurrent claims the second claim's timer can fire while its inspection has barely started, and
the expiry path then destroys the shared stage and replaces it — failing a *different* claim whose
inspection was already bound to the destroyed instance.

So the design constraint stands and its justification changes: scope the overlay per inspection
because the property must be owned, and bound the deadline from the point the inspection actually
starts rather than from the point it is requested. Both belong to the implementation.

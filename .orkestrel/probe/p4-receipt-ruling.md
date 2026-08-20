# RULING — P4 receipt integrity

Both lanes produced defensible designs. Neither is adoptable as written: the subjective lane fixes the project hole and leaves a larger one open; the objective lane fixes both and pays for it with a field that destroys the verification method it was designed for. The ruling takes the objective lane's frame, the subjective lane's placement rule, and rejects one field from each.

## 1. THE RULING

### Contract — `src/core/types.ts`

Add one interface beside `Toolchain`, and two required members to `Verdict`.

```ts
/**
 * Names the TypeScript project that judged a verdict's candidate sources.
 *
 * @remarks
 * A verdict is an assertion about code under one compiler configuration, and the same code passes
 * under one project and fails under another, so a verdict that omits the project states less than
 * it appears to. `path` names which project file, in the resolved workspace-relative spelling
 * rather than the caller's. `digest` names what that project contained, because a receipt travels
 * away from the workspace that minted it and a path alone is a claim about a name.
 *
 * @example
 * ```ts
 * const project: Project = {
 * 	path: 'configs/src/tsconfig.core.json',
 * 	digest: '3b674fdf121c85efb9ed1bab25ceeec8',
 * }
 * ```
 */
export interface Project {
	/** Resolved workspace-relative path of the project file the type stage applied. */
	readonly path: string
	/** Digest of that project's resolved compiler options, workspace-relative and key-sorted. */
	readonly digest: string
}

export interface Verdict {
	/** The revision identity this verdict was produced for, fresh per call. */
	readonly id: string
	/** Digest of the case and control this verdict answers. */
	readonly digest: string
	/** The tool versions that produced it. */
	readonly toolchain: Toolchain
	/** The TypeScript project the candidate sources were judged against. */
	readonly project: Project
	readonly checks: readonly Check[]
	readonly control: readonly Check[]
	readonly elapsed: number
	readonly receipt?: string
}
```

Both new members are required. The type stage always runs and `Claim.project` is always supplied, so no verdict exists without either value, and an optional member invites a reader to wonder what its absence meant.

`Claim`, `CLAIM_SHAPE`, and `isClaim` are unchanged. `Project` is produced, never admitted.

### Guards — `src/core/validators.ts`

```ts
export const isProject: Guard<Project> = recordOf({
	path: isNonEmptyString,
	digest: isNonEmptyString,
})

export const isVerdict: Guard<Verdict> = recordOf(
	{
		id: isString,
		digest: isString,
		toolchain: isToolchain,
		project: isProject,
		checks: arrayOf(isCheck),
		control: arrayOf(isCheck),
		elapsed: isNumber,
		receipt: isString,
	},
	['receipt'],
)
```

`digest` stays `isNonEmptyString`. A fixed hex width in the guard couples the contract to the current digest length for no gain.

### Digest leaves — `src/server/helpers.ts`

Two exported pure leaves. They live in server because `node:crypto` is not host-independent; `RuntimeStage.ts:406` already calls a `createHash(…).digest('hex')` result `digest`, so this is the package's existing term.

```ts
/**
 * Rewrites every workspace-contained absolute path in a value to its workspace-relative form and
 * sorts every record's keys.
 */
export function normalizeValue(workspace: string, value: unknown): unknown

/** Computes the canonical digest of one value as it stands in a target workspace. */
export function computeDigest(workspace: string, value: unknown): string
```

`normalizeValue` recurses: an absolute string contained by the workspace becomes its forward-slash relative form (the root itself becomes `.`), an array maps, a record sorts keys and maps, everything else passes through. `computeDigest` is `createHash('sha256').update(JSON.stringify(normalizeValue(workspace, value))).digest('hex').slice(0, 32)`.

One generic leaf serves both digests. `normalizeValue` is exported and tested separately because portability across checkouts is the property worth a direct test, and because `AGENTS.md` forbids a hidden module helper.

### Stage member — `src/server/types.ts` and `src/server/stages/TypeStage.ts`

```ts
export interface TypeStageInterface extends StageInterface {
	readonly candidates: readonly string[]
	inspect(subject: Case, project?: string): Promise<Check>
	/** Resolves one project to the path and digest the stage applies for it. */
	resolve(project: string): Promise<Project>
}
```

`TypeStage.resolve` awaits `#typescript`, calls `#service` for the named project (cache hit or cache fill, so it never re-parses a resident project and never depends on residency), and returns

```ts
{
	path: relativeWorkspaceFile(workspace, resolveWorkspaceFile(workspace, project)),
	digest: computeDigest(workspace, this.#options.get(resolved) ?? {}),
}
```

The digest comes from the parse the stage itself applies, never from a second parse a coordinator runs. The return is a value copy, so no later eviction moves it.

### Coordinator — `src/server/Probe.ts`

`prove` resolves the project before the inspections, so an unparseable project fails before any work, and assembles both digests into `basis`:

```ts
const project = await this.#type.resolve(claim.project)
const digest = computeDigest(this.#workspace, { case: claim.case, control: claim.control })
```

`basis` gains `digest` and `project` beside `toolchain`. `computeReceipt(basis, claim.control.stage)` is called unchanged.

### Token — `src/core/helpers.ts`

Seven fields joined by `RECEIPT_SEPARATOR`. `verdict.id` leaves the token.

```text
probe:<claim digest>:<stage>:typescript@<v>:oxlint@<v>:vitest@<v>:<project path>@<project digest>
```

```ts
return [
	RECEIPT_PREFIX,
	verdict.digest,
	stage,
	`typescript@${typescript}`,
	`oxlint@${oxlint}`,
	`vitest@${vitest}`,
	`${verdict.project.path}@${verdict.project.digest}`,
].join(RECEIPT_SEPARATOR)
```

Worked example, every value measured in this checkout on typescript 6.0.3, over the documented `Claim` example with `P13`'s control correction applied (152 characters, 7 fields):

```text
probe:6ca20c3bff623031d3955b9d1a76d71d:type:typescript@6.0.3:oxlint@1.79.0:vitest@4.1.11:configs/src/tsconfig.core.json@3b674fdf121c85efb9ed1bab25ceeec8
```

Parsing rule, stated in the guide as contract: split on `:`, take fields 0 through 5, and join the remainder back with `:` as the project field; inside it the digest is everything after the last `@`. The project goes last so the rule is total even for a workspace-relative path containing `:` or `@`, which `@orkestrel/contract` cannot exclude — `stringShape`'s `pattern` is annotation-only.

### Rendering — `src/core/helpers.ts`

`formatVerdict` gains two lines, in the toolchain line's own name-then-value style:

```text
probe 88a5addc-7d33-40dc-9a5a-104b71f8787d (337 ms)
claim 6ca20c3bff623031d3955b9d1a76d71d
toolchain typescript 6.0.3, oxlint 1.79.0, vitest 4.1.11
project configs/src/tsconfig.core.json 3b674fdf121c85efb9ed1bab25ceeec8
case type: 0 findings (61 ms)
```

### File ownership

| File | Change |
| --- | --- |
| `src/core/types.ts` | `Project`; `Verdict.digest`; `Verdict.project`; the `Verdict` `@example` |
| `src/core/validators.ts` | `isProject`; `isVerdict` |
| `src/core/constants.ts` | `RECEIPT_SEPARATOR` `@example` field count 6 → 7; `RECEIPT_PREFIX` `@example` token |
| `src/core/helpers.ts` | `computeReceipt` body and `@example`; `formatVerdict` body, `@remarks`, `@example` |
| `src/server/helpers.ts` | `normalizeValue`; `computeDigest` |
| `src/server/types.ts` | `TypeStageInterface` |
| `src/server/stages/TypeStage.ts` | `implements TypeStageInterface`; `resolve` |
| `src/server/Probe.ts` | `prove` assembles `digest` and `project` |
| `tests/src/core/{helpers,validators,index}.test.ts` | fixtures, line list, barrel population |
| `tests/src/server/stages/RuntimeStage.test.ts` | token literal at `:155` |
| `tests/src/server/{helpers,Probe}.test.ts` | digest leaves; the six acceptance criteria |

## 2. WHERE THEY AGREED

Four agreements, and each one's standing.

**Record the project on the `Verdict`, print it, and put it in the token.** Right, and not merely shared: it is the row's own closing condition, reached by two independent arguments — the subjective lane's completeness argument (`Claim`'s TSDoc at `src/core/types.ts:87-89` already states that the root project and the scoped projects disagree, so a verdict naming neither states less than it appears to) and the objective lane's executed attack.

**Digest the resolved compiler options, not the project file's bytes.** Right, independently confirmed. I ran it: `tmp/ruling/a/tsconfig.json` and `tmp/ruling/b/tsconfig.json` are byte-identical (both md5 `c53f57c3183efe7fb50bdc4d70e070ef`) and differ only in their `extends` parent's `strict`; their option digests are `6ee26d4899509d2e226a4550bbd14a3b` and `976b08ffd72c282e58b8716d847aa587`. Bytes miss the whole `extends` chain, and they move on comment and formatting noise that changes no judgment.

**Normalize to workspace-relative and sort keys before hashing.** Right, and the strongest agreement in the pair, because the two lanes wrote the normalizer separately and produced the same numbers: subjective's 16-hex values are exactly my 32-hex prefixes (`a031e70e65960ff0`, `3b674fdf121c85ef`, `224ad87b7398c1af`). `parsed.options` carries four absolute members here — `configFilePath`, `pathsBasePath`, `rootDir`, `outDir` — so an unnormalized digest is unreproducible outside the minting directory and leaks host paths.

**Both rejected an HMAC.** Right on evidence rather than assumption: probe holds no key, a per-process key dies with the process, and a persisted key sits in the workspace the policed agent reads.

**One agreement is a shared assumption, and it is wrong.** Both lanes assumed the receipt's binding problem is exhausted by what the *instrument* was, and neither questioned whether the *control* is a control. `Control extends Case` with an independent `files` and `test`, so a caller supplies a case that compiles and a control that is unrelated broken code, and `computeReceipt` issues a receipt certifying that the instrument caught a defect it was never pointed at. The objective lane came closest — it proposed a mirror refusal — but filed it as a hardening beside the receipt rather than as the same hole. Section 6 carries it out as a new row.

## 3. WHERE THEY DISAGREED

**The claim digest. Objective wins.** The subjective lane never considered it. `computeReceipt` over a proven verdict today returns a string naming a random UUID, a stage, and three versions — nothing about the code. Two proven claims at one stage under one toolchain therefore differ only in a nonce, so a receipt earned for a trivial claim is presentable as proof of any other claim. That is cheaper than the configuration attack the row was opened for, and the row's own closing condition does not touch it. Decided by the executed token in the objective lane's report, which I reproduced structurally at `src/core/helpers.ts:112-119`: the join list contains no claim-derived value.

**`verdict.id` in the token. Objective wins.** The id carries no integrity and it is the only thing stopping two honest runs of one claim from producing one comparable string. Removing it makes the token a deterministic function of the claim, the workspace, and the toolchain, which is what makes "re-run `prove` and compare strings" a real verification method — the only one a keyless token can offer. Decided by the subjective lane's own best finding, turned around: it correctly showed the audit's closing condition is unfalsifiable because `randomUUID` already makes every pair of tokens differ. That is not a flaw in the test, it is the id being noise in the token.

**`parsed.fileNames` in the digest. Subjective wins.** The objective lane included it to catch a caller-planted ambient `.d.ts` inside a declared project's include globs, and then stated the cost itself: "a receipt verifies reliably only in the tree that minted it, at the revision that minted it." That is self-defeating. The field helps exactly one reader — one who holds a clean tree and recomputes — and it breaks exactly that reader, because two checkouts at one commit with different untracked files produce different digests. Measured here: `tsconfig.json` resolves 39 root files and `configs/src/tsconfig.core.json` resolves 6, both of which move whenever any file enters the tree. It also does not close the attack it was chosen for, because the plant happens before the mint and the digest simply records the planted tree. Exclude, and name the ambient plant as residual.

**Digest width. Objective wins, 32 hex.** The subjective lane argued 16 hex stays comparable at a glance. Nobody compares a hex string by eye; a policy compares it mechanically, and 16 extra characters on a 152-character token cost nothing. 128 bits against a targeted second preimage rather than 64.

**Bounding `Claim.project` to the workspace's declared project set. Subjective wins for this row, and the objective lane's reasons survive as another row's.** The objective lane's justification is that recording alone leaves the recorded value unbounded. The subjective lane's rebuttal decides it: bounding does not close the hole it is offered for, because the caller then picks the loosest project *inside* the set — `tsconfig.json`, which admits host globals the scoped projects remove — and a reader who does not check is fooled identically. A defence that fails against the same reader it was designed for is not the defence for this row. The digest is, because it discriminates every project including the honest ones. Bounding remains right on its own separate grounds — it deletes `TypeStage.#recycle` and `#resident`, and it removes the caller's tree-wide `include` — and those are P14 and P19 grounds. The subjective lane's third argument, that bounding is product policy, is rejected: `resolveWorkspaceFile` already refuses paths escaping the workspace, and `inferTypeProject` already hardcodes the `configs/{axis}/tsconfig.{environment}.json` layout, so bounding adds no assumption the package does not already carry.

**The runner. Neither lane's position is adopted.** The objective lane proposed `Judgment.runner` plus a digest of `project.serializedConfig`; the subjective lane omitted the runtime stage entirely. Both are wrong at the edges. The runner is caller-selected — `inferTestProject(case.test.path)` at `src/server/helpers.ts:118-124` derives it from a caller-supplied path — so the subjective lane's silence is a gap. But the runner is bounded by construction to the workspace's own configured Vitest projects: `RuntimeStage.#project` refuses a name that matches no configured project and refuses a string-declared one, so a caller cannot supply a lax runner configuration, only choose among the workspace's gate projects. And the claim digest binds `case.test.path`, so any reader who can use the receipt at all can derive which project ran. Storing it would store a second label that can drift from the value it derives from. Omit. This also removes the objective lane's `:`-in-`src:core` problem, which I confirmed at `vite.config.ts:43` and `:92`.

**Type naming. Subjective wins.** `Judgment` bundled project, runner, and one digest over both; with the runner gone it collapses to `Project`. `Verdict.project: Project` with `{ path, digest }` is the single-word entity shape `Toolchain` already establishes.

**Placement of the project in the token. Subjective wins.** Last position, with the remainder-join parsing rule, is total regardless of whether bounding ever lands. The objective lane's fixed-arity middle position is safe only under bounding, which this ruling declines to fold in, so it would ship a token whose parse depends on a refusal that is not there.

## 4. THE ATTACK IT DEFEATS, AND THE ATTACK IT DOES NOT

**Defeated — the row's attack.** A caller names `tmp/probe/lax.tsconfig.json`, the candidate compiles clean where the workspace's own project reports `'value' is possibly 'undefined'`, and a receipt is issued. After this change the token reads `…:tmp/ruling/lax.tsconfig.json@eea7587826e27f1ec213f93f1ba7ac9a`, which fails any policy naming a gate project, and fails on sight for a human reader. Measured: the honest project digests `3b674fdf121c85efb9ed1bab25ceeec8` and the lax one `eea7587826e27f1ec213f93f1ba7ac9a`.

**Defeated — the transfer attack the row did not name.** A receipt earned for a trivial claim, presented as proof of a different claim. The claim digest binds the exact case and control the verdict answers, so a reader holding the claim recomputes and refuses.

**Defeated — the same-path forgery.** A caller writes its own `configs/src/tsconfig.core.json` into a workspace that had none, or a fork weakens the real one. The path is unchanged and the digest is not, because the digest folds the whole `extends` chain: measured, byte-identical children over different parents digest differently.

**Defeated — relocation.** A receipt minted in a local checkout and read in CI. `normalizeValue` removes the four absolute option members, so one commit at two absolute roots produces one digest.

**Not defeated — an unrelated control.** `Control` carries an independent `files` and `test`, so a caller pairs a clean case with broken code that was never a mutation of it, and `computeReceipt`'s two conditions are both satisfied. This ruling makes that visible rather than closing it: the claim digest binds case and control together, so a reader who reads the control sees it is unrelated. Unacceptable as a residual; carried out as a new row in section 6.

**Not defeated — the ambient plant.** A caller adds a permissive `.d.ts` under the honest project's include globs. No compiler option moves, so the digest is unchanged. Acceptable, on two grounds: the workspace's own gate passes identically under that tree, so the receipt remains a true statement about the workspace as it stood, and the only field that would catch it — `parsed.fileNames` — breaks the receipt's one verification method, as ruled in section 3.

**Not defeated — configuration the receipt cannot vouch for.** `.oxlintrc.json`, `vite.config.ts`, and the root `tsconfig.json` are the same files the workspace's own `lint:check`, `test`, and `check` scripts read. A caller that weakens one has defeated the gate itself, and no receipt vouches for a workspace against itself. Acceptable, and it must be stated in the guide rather than implied. `Claim.project` is the single input that escapes that boundary, which is why it alone gains a recorded digest. Oxlint additionally publishes no effective-configuration dump — the objective lane read the full `--help` and found `-c`, `--tsconfig`, and `--init` only — so reproducing its discovery would be the second parser of another tool's configuration `AGENTS.md` forbids.

**Not defeated — forgery by typing.** The token is a function of public inputs and probe holds no key, so anyone can type a well-formed receipt. Acceptable, because the receipt is a statement of conditions rather than an authenticator, verified either by a reader who holds the claim and the workspace and recomputes, or by re-running `prove` and comparing strings. Removing `verdict.id` is what makes the second method work at all. The guide must say this plainly, next to the statement that probe executes caller-supplied test code with the host's privileges. Note that this change is a prerequisite for a signed receipt in any case: a signature over a statement that omits what was judged is worthless.

## 5. ACCEPTANCE CRITERIA

The audit's stated condition — "two verdicts over one claim under two projects carry different tokens" — passes today, before any fix, because `randomUUID` at `src/server/Probe.ts:129` makes any two tokens differ. It is unfalsifiable as written and is replaced.

1. Two `prove` calls over one byte-identical claim differing only in `project` return equal `verdict.digest` and different `verdict.project.digest`.
2. Those same two calls return receipt tokens whose fields 0 through 5 are equal and whose field 6 differs.
3. Two `prove` calls naming one project by two spellings (`configs/src/tsconfig.core.json` and `./configs/src/../src/tsconfig.core.json`) return equal `project.path` and equal `project.digest`.
4. Two project files with identical bytes whose `extends` targets differ in `strict` return different `project.digest`.
5. One `normalizeValue` input containing a workspace-contained absolute path returns the workspace-relative spelling, and the same options parsed at two absolute workspace roots produce one `computeDigest` value.
6. Two `prove` calls over two different claims under one project return different `verdict.digest`, and receipt tokens differing in field 1.
7. Two `prove` calls over one byte-identical claim under one project, in two separate processes, return byte-identical receipt tokens. This is the criterion that pins `verdict.id` out of the token; it fails today.
8. `computeReceipt` returns a token that splits on `:` into 7 or more fields, whose field 6 onward rejoined splits on its final `@` into `verdict.project.path` and `verdict.project.digest`.
9. `formatVerdict` returns `claim <digest>` at index 1 and `project <path> <digest>` at index 3, between the toolchain line and the first case line.
10. `isVerdict` rejects a verdict missing `digest`, missing `project`, or carrying a `project` whose `path` or `digest` is empty.

Negative controls that must fail, each named for what it proves rather than for the criterion that specified it:

- A control asserting that two verdicts under two different projects carry equal `project.digest` must fail. It is the planted defect for criterion 1; without it a `computeDigest` that returns a constant passes.
- A control asserting that the honest project on the identical claim issues a receipt must fail. The audit's original negative control, retained: `configs/src/tsconfig.core.json` on the `value.length` candidate reports `'value' is possibly 'undefined'` and issues none.
- A control asserting that a digest taken without `normalizeValue` is equal across two absolute workspace roots must fail. It is the planted defect for criterion 5.

## 6. WHAT THIS OBLIGES ELSEWHERE

**P19, not P17 — and it lands in the same change.** The subjective lane cited P17 for the undeclared `TypeStage` members; the matrix puts that at P19 (`readiness-grade.md:58`), and P17 is instrument-fault routing. Adding `resolve` to a class that already publishes `candidates` and a two-parameter `inspect` that no interface declares widens P19's violation, so `TypeStageInterface` is part of this change rather than a follow-up. P19 closes as a side effect, and its barrel test asserting published members equal the interface's must be written against the three-member interface.

**P18 becomes load-bearing.** `Project.path` must be the resolved workspace-relative spelling, never the caller's literal string, or two spellings of one configuration mint two receipts. Measured: both spellings already digest to `3b674fdf121c85efb9ed1bab25ceeec8`, so only the path member needs the resolution. Criterion 3 is the shared test.

**P9 must be written after this lands, not before.** No documented claim earns a receipt today, and the reason is P13: the `Claim` `@example` at `src/core/types.ts:100` declares a `control` byte-identical to the case, so the control never breaks. P9's worked claim must carry the corrected control, and its asserted receipt must be a seven-field token. Writing P9 against the current format guarantees rewriting it.

**P13 is a prerequisite of P9 rather than a peer.** Fix the byte-identical control first; the documented claim cannot earn a receipt until it is a control.

**P12 turns every stale `@example` into a gate failure rather than a quiet ship.** Three blocks embed the six-field token — `computeReceipt`, `RECEIPT_PREFIX`, and `RECEIPT_SEPARATOR`, the last asserting `.length // 6` — plus the `Verdict` example at `src/core/types.ts:220-240`, whose `id` is `'01J8Z0'` while `randomUUID` produces a UUID. Correct that mismatch in the same pass so the documented token matches a real one.

**P10 must be written against the new surface.** `dist/src/core/index.d.ts` changes, so `tests/distribution.test.ts` — in flight now, per the working tree — takes `Project` and the two new `Verdict` members rather than being retrofitted after.

**P11's guide gains three statements this change creates.** The token's field order and its remainder parsing rule; the receipt's verification method (recompute, or re-run and compare) and its lack of a key; and the boundary the receipt does not vouch for — the lint, runtime, and root-project configurations, and why. Also state that the digest moves with the TypeScript version through the enum-valued options (`target: 99`, `moduleResolution: 100`), so the first compiler upgrade does not read as a breach. That is contained rather than removed: the token already names `typescript@<version>`, so any policy pinning a digest already pins the version.

**P14 and P19 inherit the bounding argument.** Bounding `Claim.project` to the set `TypeStage.#projects()` enumerates at warming is right on its own grounds and rejected as this row's defence. Record it against P14, whose evidence already shows a caller-named tree-wide `include` stalling the loop 1783 ms, and note that it deletes `#recycle`, `#resident`, and their tests. Every existing caller complies already: `#arm` uses `tsconfig.json` and `Probe.test.ts` uses `configs/src/tsconfig.core.json`.

**One new row, P26 — an unrelated control earns a receipt.** Seam: receipt integrity. State: REPAIR. Severity: blocks-release. `Control extends Case` with independent `files` and `test`, so a caller pairs a clean case with broken code that is not a mutation of it and satisfies both of `computeReceipt`'s conditions. Closes when `prove` refuses a control whose test path differs from the case's, and the refusal's shape is designed rather than assumed — ordered path equality is the objective lane's proposal and it is not yet ruled on, because a control that adds a file may be legitimate. This is not folded into P4: it narrows `Claim`'s admitted domain rather than changing the receipt's content, and it needs its own design pass.

**`isVerdict` guards the MCP server's own output.** `createProbeServer` validates what `prove` returns, so `isVerdict`, `Verdict`, and `Probe.prove` land in one commit or every wire call throws "The prove tool returned an invalid verdict".

**Churn inventory, counted.** `toolchain:` appears at 17 sites across 6 files: `src/core/types.ts` (5), `src/core/validators.ts` (1), `src/server/Probe.ts` (2), `tests/src/core/helpers.test.ts` (5), `tests/src/core/validators.test.ts` (2), `tests/src/server/stages/RuntimeStage.test.ts` (2). `tests/src/core/index.test.ts` states the core barrel population exhaustively and gains `isProject`; `tests/src/server/index.test.ts` gains `normalizeValue` and `computeDigest`. `PROBE.md:584` reproduces the `Verdict` declaration and `PROBE.md:588` explains the token's fields; both drift on landing, and `PROBE.md` is unpublished, so it is a repository-truth obligation rather than a consumer one. The package is unpublished — `npm view` returns 404 — so no consumer is owed compatibility.

**Unproven, carried forward.** I did not re-run the end-to-end `Probe.prove` forgery pair; I read the audit's recorded run at `readiness-grade.md:249-252` and confirmed its mechanism in source. I did not measure the latency `resolve` adds to `prove`. I did not test whether TypeScript's `CompilerOptions` key set and enum numbering stay stable across 6.x patch releases; every digest above was measured on typescript 6.0.3 only. The objective lane's claim that a case test writes its own lax configuration — the runtime stage writes `case.test.text` to disk and runs it with the host's privileges — I confirmed structurally in `RuntimeStage`, not by execution.

All probe files were written under `/workspace/probe/tmp/ruling/` and are deleted. No tracked file was modified; the four modified files and four untracked files in `git status` predate this reconciliation and belong to the in-flight PB1 unit.
# Probe campaign audit — reconciliation

Two lanes, different subjects, each on an engine that did not write its subject. Sol audited PB4,
PB5, PB6, PB7, and PB9 against 17 claims. An Opus reviewer audited PB8, which Sol wrote. Both
returned **VERDICT: FAIL**.

Sol confirmed 13 of 17 claims and failed 2 outright (6 and 9), then added 7 continuing findings.
Opus confirmed 3 of 4 and failed 1, then added 10. They overlap nowhere, which is what different
subjects should produce, and they agree on the one question both were asked.

## Where both lanes agree

**PB9 was right to overrule its brief.** Opus was not asked; Sol was, and confirms it as finding 23:
`ProbeServer.destroy()` releases the handles that prevented natural exit, both signals exit 0 during
boot and service, and an explicit exit would kill a host using the exported factory. My brief's §4
conditional assumed nobody detaches the transport's listeners; the criterion requiring `destroy()` to
restore the listener count made the server exactly that party. **The brief was wrong and the unit was
right.** Sol also states what falsifies the ruling, which is the part that makes it usable: any
delivery exceeding the teardown bound, returning a signal or nonzero code, or leaving stdin listeners
above their captured baseline.

## Statements the shipped code contradicts

`.claude/rules/documentation.md` classes these with a wrong return value. Six of them.

| # | The false statement | Contradicted by | Lane |
| - | ------------------- | --------------- | ---- |
| R1 | `guides/probe.md:206` — `Verdict.reason` "does not change receipt eligibility or enter the token" | `Probe.ts:144-147` digests `{case, control}`, and `Control` carries `reason`. Two claims differing only in the reason's prose digest to `f3f64d71…` and `712c763a…`, measured by the Orchestrator. The digest is token field 2. | Opus 1 |
| R2 | `validators.ts:118` — `isClaim` admits and refuses exactly what `compileGuard(CLAIM_SHAPE)` does | `isSource` refuses a workspace-escaping path; `SOURCE_SHAPE` constrains `path` to a non-empty string and admits it. `ProbeServer` advertises the schema and enforces the guard, so a schema-valid MCP call is refused with no member named. | Opus 5 |
| R3 | `types.ts:35-39` — `OverlayInterface` stays out of the server barrel | `index.ts:1` star-exports it and `dist/src/server/index.d.ts:346` ships it. The parity gate hides it through `INTERNAL` and cannot observe a type-only export anyway. | Sol 18 |
| R4 | `types.ts:113-117` — stage destruction abandons inspections without waiting | `LintStage.ts:95-101` awaits `#warmth` first, and warming waits for the initialize response, so a server that stays alive and never answers deadlocks destruction. | Sol 20 |
| R5 | `guides/probe.md:355-357` — the digest depends on the case and control bytes alone | `helpers.ts:350-365` rewrites every absolute string relative to the selected workspace before hashing, so identical claim bytes digest differently across workspaces. | Sol 21 |
| R6 | `types.ts:210-215` — `destroy()` leaves the process as it was before `start` | `ProbeServer.ts:84-86` pauses stdin unconditionally, so a host whose stdin was flowing keeps its listeners and stops reading. | Sol 22 |

R1 and R5 are the same defect seen from two directions: the digest is a function of the workspace and
the claim, and the guide describes it as a function of the claim. Fix them together and state the real
rule once.

## Defects in the code or its instruments

| # | Defect | Lane |
| - | ------ | ---- |
| D1 | The orphan sweep deletes any file whose name matches the revision pattern with a dead pid, without establishing it is a generated specification. A developer file named `notes.probe-<dead-pid>-<uuid>.ts` is deleted. Its own test confirms it also deletes a boot dependency. | Sol 6 |
| D2 | The guides gate cannot detect an entirely undocumented export. `extractDocumented` discovers only exports that already carry documentation, so the sweep that claims to fail on a missing `@example` is blind exactly where it claims coverage. | Sol 9 |
| D3 | `Inspection` is excess first-release surface: exported and barrelled, its only role a private queue record no published method accepts or returns. | Sol 19 |
| D4 | `computeReceipt` requires every stage to appear in `verdict.checks` and requires nothing of `verdict.control`, so an unrecorded control stage reads as a clean one. Unreachable through `prove`; reachable through the exported helper the guide publishes. | Opus 7 |
| D5 | The absolute-path refusal is documented in two places and proven in none, and the guard's Windows drive-letter branch is unreached. | Opus 6 |

D2 is the most serious, because it is an instrument certified only from the inside — the case
`.claude/rules/quality.md` names directly. Every claim resting on that gate inherits its coverage,
not the question's.

## Ruled, not repaired

- **Sol 24 — the receipt's threat model is accurately documented.** A quoted token is not proof: a hostile claimant can mint one under a permissive project, weaken configurations the token omits, or use an unrelated broken control. The guide states these limits and a test executes the permissive-project attack. The token has evidentiary value only when the reader recomputes it from the claim and a trusted workspace, and the guide says so.
- **Opus 8, 9, and 12 are one successor design question**, not a fix. `Verdict.reason` is optional because a hand-built verdict and the receipt helper wanted it so, and the guide apologises for it twice by saying `prove` always carries it. `Verdict` explains why the control was chosen and not where it was declared to break. And `Verdict.reason` accepts `''` in the type while the package's own guard refuses it. The proposed shape is a `Verdict.control` sub-entity carrying `{ stage, reason, checks }`. This is pre-publication, which is when it costs least — but it is a design round, and `AGENTS.md` forbids reopening a closed scope on an auditor's finding. **Routed to the Orchestrator's decision, not to this fix round.**
- **Opus 14 — a malformed comment in a `resolveWorkspaceFile` `@example`** (`/` where `//` belongs) is pre-existing and belongs to whichever unit next owns that file.

## Carried

Every row above is carried by one of two fix units, or by the successor decision, and none is dropped.

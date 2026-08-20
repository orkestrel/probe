# PROBE-AUDIT2: the last audit before a package publishes for the first time

## Role and engine

Role `reviewer`. Engine Claude Opus 5, high effort. Read-only. You rule; you never edit.

## Why you exist

GPT-5.6 Sol wrote the containment fix, the sweep rule, the receipt soundness fix, the surface
removal, and the whole ownership-axis migration in this range, and Sol also wrote the audit that
found the defects those fixed. `AGENTS.md` and `.agents/orchestration.md` require a lane whose engine
did not write the work.

`@orkestrel/probe` has never been published. `0.0.1` cements every mistake in the surface, and there
is no prior version a consumer can fall back to.

The gates are green and are **not** the subject. Equivalent audits on sibling packages found: a
release-gating test that passed only because campaign work had incidentally created a gitignored
directory; a fix that made two faces of one API settle the same interleaving oppositely; and an
instrument whose name claimed more than it matched. Each was invisible to green gates.

## Objective

Rule on the claims below with evidence. A claim you cannot substantiate is a FAIL, not a courtesy
PASS.

## Read first

1. `AGENTS.md` — § Non-negotiable rules, § Design laws, § Writing
2. `.claude/rules/quality.md` — the Falsification law and its Instruments section
3. `.claude/rules/architecture.md`, `.claude/rules/patterns.md`, `.claude/rules/tests.md`,
   `.claude/rules/documentation.md`
4. `.agents/skills/orkestrel-falsify/SKILL.md` — it fixes the verdict shape and the terminal line
5. `guides/probe.md`

## Context and evidence

You have no exec tool, so the Orchestrator supplies the diffs. Read them with your Read tool:

- `tmp/probe-sol-work.diff` — `git diff a5da753..f9807ad -- src/ tests/`, the source and test range.
- `tmp/probe-docs.diff` — `git diff a5da753..f9807ad -- guides/probe.md README.md`, the prose range.

The stat for the source range: 27 files changed, 1146 insertions, 484 deletions.

The tree is committed and clean at `f9807ad`. Host gates all exit 0: format:check, lint:check, check,
build, test (src 11 files / 168 tests, policy 86, config 28, guides 13), test:distribution 2.

Vendored files are off-limits as subjects: `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`,
`.codex/`, `.cursor/`, `configs/helpers.ts`, `scripts/*.sh`, `tests/config.test.ts`,
`tests/policy.test.ts`, `tests/setupPolicy.ts`. Report a defect in one as a scaffold finding.
`guides/*.md` other than `guides/probe.md` and `guides/README.md` are refetched mirrors, out of scope.

## The claims

**Claim 1.** No public name this package introduces collides with a name another `@orkestrel` package
already publishes for a different concept. `AGENTS.md` § Non-negotiable rules requires inspecting the
declared and installed `@orkestrel/*` capabilities before implementing overlapping logic. This
package declares `@orkestrel/contract`, `@orkestrel/emitter`, `@orkestrel/mcp`, `@orkestrel/queue`,
`@orkestrel/timeout`, and `@orkestrel/tool`; their guides are in `guides/`. Check `Origin`,
`Inspection`, `Overlay`, `Verdict`, `Claim`, `Check`, `Finding`, `Stage`, and every other exported
entity name against them. A collision found after publication cannot be fixed cheaply.

**Claim 2.** The canonical containment fix refuses every write and delete that leaves the workspace,
and refuses nothing it should permit. Rule on whether a legitimate in-workspace path is now rejected,
whether the symlink check can be defeated by a link created between the check and the write, and
whether the read reach the guide now documents is stated accurately.

**Claim 3.** The sweep deletes only what this package generated, for every shape of caller path.
Boot dependencies now carry the ownership marker and every deletion requires path, revision, and
marker. Rule on whether a caller file can still be deleted, and whether a file this package generated
can now survive a sweep it should not.

**Claim 4.** The receipt is sound. It is refused when either phase reports an instrument finding, and
minted when the control broke at its declared stage with a claimant finding. Rule on whether any
verdict shape earns a receipt it should not, or is refused one it should earn — including a workspace
finding in either phase, a control breaking at an undeclared stage, and an empty findings list.

**Claim 5.** The ownership axis divides the failure space without overlap or gap. For each of
`claimant`, `workspace`, and `instrument`, name a failure that must carry it and confirm the code
does. Then rule on whether any failure could reasonably carry two, and whether the claimant-finding
invariant — a claimant finding is a tool's diagnostic about a candidate source and nothing else — is
enforced by the code rather than only stated in the guide.

**Claim 6.** The deadline attribution is honest. Each stage exposes progress at a cooperative
boundary and the coordinator attributes an expired deadline from a pre-inspection snapshot. Rule on
whether a stage can report progress it did not make, whether a genuinely stalled instrument can be
misattributed to the claimant, and whether the snapshot can be stale in a way that inverts the
answer.

**Claim 7.** No gate in this package depends on incidental state — a directory that exists only
because work happened here, an environment value nothing asserts, a file another test leaves behind,
or an ordering between projects. Name the exact command that would prove each suspicion and say which
you could not run. A sibling package's release gate failed this claim and would have failed
`npm publish`.

**Claim 8.** Every test the range added or changed can fail for the reason it exists. Name any that
cannot. The range's own report claims one added test could not fail against the code preceding it;
check that claim and any like it.

**Claim 9.** Every prose line the range added is true of the code and obeys `AGENTS.md` § Writing.
The range corrected several false claims; rule on whether the corrections are themselves true, and
whether any surviving sentence still claims more than the code delivers. The range's report records
that one guide sentence was found false at a boundary and scoped rather than fixed — rule on whether
the scoping is honest.

## Unknowns

- Whether `Retention`, `Capture`, or any similar accumulator name appears here. A sibling package hit
  a fleet-wide collision on exactly that word.
- Whether the removed factories left any consumer path unreachable that the distribution proof does
  not drive.

## Scope

Read-only. Own nothing. Edit nothing. Spawn nothing. Perform this assignment directly. Never run
`git checkout`, `git restore`, `git stash`, `git reset`, or `git clean`.

State no count in anything you write, and never name a list item by its position.

## Output

The verdict shape `.agents/skills/orkestrel-falsify/SKILL.md` fixes, and nothing else. Per-claim
verdicts with evidence, findings numbered in one sequence, and the single terminal line. No process
diary.

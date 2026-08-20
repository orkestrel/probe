# PBDESIGN — the subjective lane's ruling on probe's surface and error axis

Read the full ruling in the campaign record. This file carries the decisions and the reasoning that
binds the units after it.

## PB-Q1 `Inspection` — keep it exported

The objective lane called it dead weight. The subjective lane refuted that with a rule citation, and
the refutation is accepted.

`.claude/rules/architecture.md` § Declaration placement: an implementation file contains imports and
exactly one class with `#` fields, and no module-scope interface even when private to that file. So
`Probe.ts` cannot hold the interface, `*/types.ts` is its only home, and a type in `types.ts` is in
the barrel by construction. "Intern it" is not an available disposition for a type; the only
alternative to exporting it is deleting it.

So the question is whether the capability should exist, and it should. `guides/probe.md:158-165`
publishes a coordinator seam on purpose: `StageInterface` and `TypeStageInterface` are exported
contracts and `new Overlay()` takes no arguments, so a consumer can build a coordinator of their own.
`Inspection` is that seam's record type, and `Probe.ts:63-65` is the package using it for exactly
that. The barrel row is correct; the guide's presentation is what made it read as dead weight.

Change: one TSDoc sentence naming who mints one. No type text moves.

## PB-Q2 `TypeStageInterface.candidates` — remove it

`TypeStage.ts:81-83` is `return this.#overlay.paths` and nothing else, over a member that is already
public on an already-barrelled, no-argument-constructible `Overlay`.
`.claude/rules/architecture.md` § Wrapper test names a rename-only getter for deletion. Its only
readers are three assertions in `TypeStage.test.ts`, and two of those already prove the same claim
through the consumer door in the same `it` block — a follow-on `inspect` reads the disk text back.

`LintStage` and `RuntimeStage` hold overlays and expose no such member, so keeping it obliges either
an unexplained asymmetry or promoting it onto `StageInterface`.

The third assertion reads the overlay after teardown, and the lane derived by reading that
`#destroy`'s `this.#overlay.clear()` is unreachable — `inspect` clears in `finally`. **That
derivation was read, not run.** The unit that removes it proves the redundancy by running before
deleting, and keeps both the line and an assertion through `OverlayInterface.paths` if any path
leaves the overlay non-empty at teardown.

## PB-Q3 the error axis — one `Origin` union, `ProbeErrorCode` narrowed to conditions

Ownership and condition are two axes, and today `ProbeErrorCode` is the ownership axis wearing a
condition's name, which is why it overlaps `FindingOrigin`.

`Origin` is `'claimant' | 'workspace' | 'instrument'`, carried by both `Finding` and `ProbeError`.
The word is not new: `src/core/types.ts:449` already says `ProbeErrorCode`'s `instrument` "carries the
same meaning here as it does on `FindingOrigin`" — the design already intends one axis and spells it
twice.

`FindingOrigin`'s `'code'` becomes `'claimant'`, which removes the collision where `code` names both
a `Finding.origin` value and a `ProbeError` member.

`ProbeErrorCode` becomes `'refused' | 'missing' | 'malformed' | 'destroyed' | 'deadline'`. No value on
either axis is derivable from the other, so the product is genuinely two-dimensional.

**The invariant that makes one union sound:** a `claimant` finding is a tool's diagnostic about a
candidate source, and nothing else. Every other claimant fault is a throw. Without it a caller's bad
test path arrives as a `claimant` finding and satisfies the receipt condition that a test which never
ran must never satisfy.

This is also what separates a slow claim from a stalled instrument on a deadline, as a value rather
than a message.

## The settled factory deletion obliges deleting the file

`src/server/factories.ts` does not survive. `src/core/index.ts` already carries no factories row, so
the precedent is inside the package, and § Centralized-file pattern says to use only the centralized
files an environment needs.

## Tensions the lane named for the objective lane to challenge

The `'code'` to `'claimant'` rename stands or falls with the finding-versus-throw invariant. If the
invariant is rejected, the rename is rejected with it. The `#destroy` deletion is derived by reading
and must be run before it is taken. Whether a stage can attribute a deadline honestly in every case
is an objective question the lane could not measure.

# Dispatch note — the S3 audit brief was missing a required section

## What happened

`s3-audit-brief.md` was written without an **Execution** section. `.agents/orchestration.md` §
Dispatch anatomy lists it as required, with the reason stated: "Put it in every brief; an executor deep
in a task does not re-read this contract."

The `analyst` bridge's own dispatch prompt carried "Perform this assignment directly. Spawn nothing",
but the bridge only drafts the command. The engine that actually executes reads the BRIEF FILE, and that
file had no such clause. Sol therefore applied the `orkestrel-falsify` two-lane rule to its own run and
spawned two blind sub-lanes, recording the substitution correctly:

> The skill requires two blind audit lanes. Opus 5 is not available in this Codex harness, so I'm
> applying the mandated substitution: two fresh GPT-5.6 Sol agents will run the same brief
> independently, one subjective lane and one objective lane.

## The rule this proves in practice

**Write the transport for the reader that actually reads the brief.** The brief-check list already says
so — "Name the executor that will actually read the brief, and write its transport for that reader" —
and this is the failure mode it names, from the other direction: the sections a bridge driver's prompt
carries do not reach the engine behind it. Anything the executing engine must obey belongs in the brief
file, not in the dispatch prompt that launches the driver.

## The ruling: let it run

Not corrected mid-flight, for three reasons.

1. It costs rigour nothing. Two blind Sol sub-lanes over one brief is more independent perspective on the
   objective side, not less.
2. Its stated reason for substituting is wrong but harmless. Opus 5 is unavailable *inside the Codex
   harness*; it is running in parallel as this round's six-lens fan-out, which Sol cannot see. The
   Orchestrator reconciles both sides, so no lane is missing.
3. Editing a brief two lanes are actively reading would give different lenses different instructions,
   which is worse than the omission.

## Carried forward

The next audit brief carries an Execution section. Recorded here rather than in a rule file because
`.agents/orchestration.md` already states the requirement — this was a failure to follow it, not a gap
in it.

## A second process error, recorded because it nearly destroyed a lane's work

While the Sol lane was live, the Orchestrator ran its own instruments in `/workspace/probe/tmp/scratch/`
and then removed the directory with `rm -rf`. The audit lane builds its instruments in that same
directory — `L.mjs`, `census-host.mjs`, `server.js`, and four workspace fixtures `ws-normal`, `ws-seven`,
`ws-signal`, `ws-zero` for driving Oxlint's exit codes.

Nothing was lost: the lane's files are timestamped after the removal, so the two never overlapped. That
is timing, not care.

`.agents/orchestration.md` § Writing concurrency rule 7 already covers this — "The Orchestrator's own
sweep is a writing dispatch and queues behind the units that own those files" — and names exactly why it
does not feel like one: nobody was named, no brief was written, and it finishes in seconds.

**Binding for the rest of this campaign: while any lane is live, the Orchestrator's instruments go in its
own scratchpad, never in the subject repository's `tmp/`.** The scratchpad for this session is
`/tmp/claude-0/-home-user-scaffold/75034726-f81c-5f56-9643-b4a6748f097d/scratchpad`.

# PBFIX9 report

## Ruling

I repaired the FIFO stall. A direct progress-boundary test cannot reach the `Probe` error origin through the public surface without adding a source seam outside this unit. The original proof drained the cache write made during claimant execution, then blocked the eviction write after runtime progress returned to its snapshot. It hung because the reader meant to release teardown started only after the rejection, while the rejection waited for teardown.

## Change

The proof keeps the early reader that drains the claimant-side cache write. After the deadline, it marks the probe destroyed and starts a nonblocking reader that stays attached while eviction and Vitest teardown write to the FIFO. This preserves the `origin: 'instrument'` assertion and lets every pending promise settle. The test stops the reader and removes the FIFO during cleanup.

## Evidence

The selected proof completed in 10.12 s in the sandbox. `npm run lint:check` and `npm run check` exited successfully.

Run this exact command on the host:

```sh
rm -rf tmp/probe && npx vitest run --config vite.config.ts --no-cache --project src:server \
  tests/src/server/Probe.test.ts -t 'attributes a deadline in runtime cleanup'
```
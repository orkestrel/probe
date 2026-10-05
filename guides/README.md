# Guides

## By concept

The package guide covers the claim contract, eager onset, stage leases, recovery, and measured cost.

| Concept | Spec                   | Source                                                                            | Tests                                                                                                                 |
| ------- | ---------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Package | [`probe.md`](probe.md) | [`src/core`](../src/core), [`src/server`](../src/server), [`src/bin`](../src/bin) | [`tests/src/core`](../tests/src/core), [`tests/src/server`](../tests/src/server), [`tests/src/bin`](../tests/src/bin) |

## By directory

The following directories contain the public implementation and its proofs.

- [`src/core`](../src/core)
  - Guide: [`probe.md`](probe.md)
  - Tests: [`tests/src/core`](../tests/src/core)
- [`src/server`](../src/server)
  - Guide: [`probe.md`](probe.md)
  - Tests: [`tests/src/server`](../tests/src/server)
- [`src/bin`](../src/bin)
  - Guide: [`probe.md`](probe.md)
  - Tests: [`tests/src/bin`](../tests/src/bin)

## Dependency mirrors

For the stage coordinator's lease and replacement contract, see [Pool](pool.md). The catalog
refresh carries the published 0.0.15 guide; the release visit must refresh it to 0.0.16.

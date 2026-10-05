# @orkestrel/probe

> A claim prover that checks a case and its negative control with the workspace’s TypeScript,
> Oxlint, and Vitest, with eager lint and runtime onset and type warming before proof.

A claim carries a `case` — the edit you believe is correct — and a `control`, the same edit
deliberately broken, naming the stage it must fail at. The `receipt` a proven claim earns is a
one-line token naming the claim, the stage, the tool versions, and the TypeScript project that
judged the candidates.

Read [`guides/probe.md`](guides/probe.md) before you make a claim. It states the prerequisites, the
receipt's verification method and its limits, and what a receipt does not vouch for.

## Install

```sh
npm install --save-dev @orkestrel/probe
```

The `typescript` and `vitest` packages are optional peers, and the `oxlint` package carries no peer
range; probe resolves all three from the workspace it inspects.

## The `probe` binary

Startup waits for lint and runtime while type warming continues before the first proof. For the
Codex `required = true` setting and measured initialization times, see
[Registering the server](guides/probe.md#registering-the-server).

The package installs a `probe` binary that serves the `prove` Model Context Protocol tool over a
newline-delimited JSON stdio transport. Register the resolved JavaScript entry rather than a global
install, an `npx` invocation, or the `node_modules/.bin` shim:

```json
{
	"mcpServers": {
		"probe": {
			"command": "node",
			"args": ["node_modules/@orkestrel/probe/dist/bin/main.js"],
			"cwd": "/srv/checkout"
		}
	}
}
```

## Proving a claim in process

```ts
import type { Claim } from '@orkestrel/probe'
import { Probe } from '@orkestrel/probe/server'

const claim: Claim = {
	project: 'configs/src/tsconfig.core.json',
	case: {
		files: [
			{
				path: 'src/core/factories.ts',
				text: "export function createGreeting(): string {\n\treturn 'hi'\n}\n",
			},
		],
		test: {
			path: 'tmp/probes/greeting.test.ts',
			text: "import { expect, test } from 'vitest'\nimport { createGreeting } from '../../src/core/factories.js'\ntest('greets', () => expect(createGreeting()).toBe('hi'))\n",
		},
	},
	control: {
		files: [
			{
				path: 'src/core/factories.ts',
				text: "export function createGreeting(): number {\n\treturn 'hi'\n}\n",
			},
		],
		test: {
			path: 'tmp/probes/greeting.test.ts',
			text: "import { expect, test } from 'vitest'\nimport { createGreeting } from '../../src/core/factories.js'\ntest('greets', () => expect(createGreeting()).toBe('hi'))\n",
		},
		stage: 'type',
		reason: 'a string returned as a number must not compile',
	},
}

const probe = new Probe({ workspace: process.cwd() })
const verdict = await probe.prove(claim)
console.log(verdict.receipt)
await probe.destroy()
```

probe executes caller-supplied test code with the privileges of the process that hosts it. Give it a
workspace and a caller you already trust with a shell.

## Development

```sh
npm install
npm test
```

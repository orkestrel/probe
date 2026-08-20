# @orkestrel/probe

Prove a claim about a code change with type, lint, and runtime evidence, from the workspace's own
TypeScript, Oxlint, and Vitest.

A claim carries a `case` — the edit you believe is correct — and a `control`, the same edit
deliberately broken, naming the stage it must fail at. `prove` runs all three stages over both and
returns a `Verdict`. When the case ran clean and the control broke where it said it would, the
verdict carries a `receipt`: a one-line token naming the claim, the stage, the three tool versions,
and the TypeScript project that judged the candidates.

Read [`guides/probe.md`](guides/probe.md) before the first claim. It states the prerequisites, the
receipt's verification method and its limits, and what a receipt does not vouch for.

## Install

```sh
npm install --save-dev @orkestrel/probe
```

`typescript`, `oxlint`, and `vitest` are optional peers, resolved from the workspace probe inspects.

## The `probe` binary

The package installs a `probe` binary that serves one Model Context Protocol tool, `prove`, over a
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

## One claim, in process

```ts
import type { Claim } from '@orkestrel/probe'
import { createProbe } from '@orkestrel/probe/server'

const claim: Claim = {
	project: 'configs/src/tsconfig.core.json',
	case: {
		files: [{ path: 'src/core/greeting.ts', text: "export const GREETING = 'hi'\n" }],
		test: {
			path: 'tmp/probe/greeting.test.ts',
			text: "import { expect, test } from 'vitest'\nimport { GREETING } from '../../src/core/greeting.js'\ntest('greets', () => expect(GREETING).toBe('hi'))\n",
		},
	},
	control: {
		files: [{ path: 'src/core/greeting.ts', text: "export const GREETING: number = 'hi'\n" }],
		test: {
			path: 'tmp/probe/greeting.test.ts',
			text: "import { expect, test } from 'vitest'\nimport { GREETING } from '../../src/core/greeting.js'\ntest('greets', () => expect(GREETING).toBe('hi'))\n",
		},
		stage: 'type',
		reason: 'a string literal assigned to a number must not compile',
	},
}

const probe = createProbe({ workspace: process.cwd() })
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

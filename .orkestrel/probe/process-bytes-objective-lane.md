## 1. The shape

Add this event member. Do not add a second reader to `ProcessInterface`.

```ts
export type ProcessEventMap = {
	readonly stdout: readonly [chunk: Uint8Array]
	readonly stderr: readonly [chunk: string]
	readonly error: readonly [error: unknown]
	readonly exit: readonly [exit: ProcessExit]
}
```

Name it `stdout` because it identifies the child channel and matches the existing `stderr` event. Emit a caller-owned byte copy. A consumer that needs every byte must register `ProcessOptions.on.stdout` during construction.

The initial hooks are installed before spawning and attaching the line reader:

```text
$ sed -n '62,81p' src/server/Process.ts
	constructor(options: ProcessOptions) {
		const on = options.on
		const error = options.error
		this.#emitter = new Emitter<ProcessEventMap>({
			...(on === undefined ? {} : { on }),
			...(error === undefined ? {} : { error }),
		})
		this.#grace = options.grace
		this.#limit = options.evidence ?? PROCESS_EVIDENCE
		this.#signal = options.signal
		this.#lines = Object.freeze({ [Symbol.asyncIterator]: this.#iterate.bind(this) })
		this.#child = spawn(options.command.file, [...options.command.arguments], {
			cwd: options.workspace,
			detached: process.platform !== 'win32',
			env: mergeEnvironment(options.command.environment),
			stdio: ['pipe', 'pipe', 'pipe'],
			windowsHide: true,
		})
		this.#reader = createInterface({ input: this.#child.stdout, crlfDelay: Infinity })
		this.#reader.on('line', this.#push.bind(this))
```

## 2. How the tension resolves

Keep the live, one-shot source whole. Keep the existing late-consumer and eager-drain guarantee whole for `lines`. Compromise the fleet `stream()` convention: raw stdout is live push observation, not a fresh, replayable, pull-based `ReadableStream`.

The cost is explicit. A byte consumer must install its handler at construction. It gets no replay, independent cancellation, `pipeThrough`, or `for await` surface. The emitter provides no asynchronous backpressure, and `Process` allocates one copy per emitted chunk.

The built package confirms that `lines` retains output for a late consumer while a direct child stream does not:

```text
$ node --input-type=module -e "import { createProcess } from './dist/src/server/index.js'; import { spawn } from 'node:child_process'; const subject = createProcess({ command: { file: '/bin/sh', arguments: ['-c', \"printf 'one\\ntwo'\"] }, workspace: process.cwd(), grace: 100 }); const exit = await subject.exit; const lines = []; for await (const line of subject.lines) lines.push(line); console.log('process-late lines=' + JSON.stringify(lines) + ' exit=' + exit.code + '/' + exit.signal); await subject.destroy(); const control = spawn('/bin/sh', ['-c', \"printf 'one\\ntwo'\"]); control.stdout.resume(); await new Promise((resolve) => control.once('close', resolve)); const late = []; control.stdout.setEncoding('utf8'); control.stdout.on('data', (chunk) => late.push(chunk)); await new Promise((resolve) => setImmediate(resolve)); console.log('control-direct-late chunks=' + JSON.stringify(late));"
process-late lines=["one","two"] exit=0/null
control-direct-late chunks=[]
```

A direct pull source applies backpressure, unlike the eager control:

```text
$ node --input-type=module -e "const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)); let pulls = 0; const pullBased = new ReadableStream({ pull(controller) { pulls += 1; controller.enqueue(pulls); if (pulls === 4) controller.close(); } }); await pause(20); console.log('pull-based before-read pulls=' + pulls); const reader = pullBased.getReader(); const first = await reader.read(); await pause(20); console.log('pull-based after-one-read value=' + first.value + ' pulls=' + pulls); let eagerEnqueues = 0; const eager = new ReadableStream({ start(controller) { for (let value = 1; value <= 4; value += 1) { eagerEnqueues += 1; controller.enqueue(value); } controller.close(); } }); await pause(20); const eagerReader = eager.getReader(); const eagerFirst = await eagerReader.read(); console.log('control-eager before-read-enqueues=' + eagerEnqueues + ' first=' + eagerFirst.value);"
pull-based before-read pulls=1
pull-based after-one-read value=1 pulls=2
control-eager before-read-enqueues=4 first=1
```

Teeing that source behind an eager line drain defeats the byte branch’s backpressure. The unread branch retained all 4,096 chunks, while the direct-child control replayed nothing:

```text
$ node --input-type=module -e "import { spawn } from 'node:child_process'; async function measure(total) { let made = 0; const source = new ReadableStream({ pull(controller) { if (made === total) { controller.close(); return; } made += 1; controller.enqueue(made); } }); const [fast, late] = source.tee(); let fastCount = 0; for await (const value of fast) { if (value > 0) fastCount += 1; } const before = made; let lateCount = 0; for await (const value of late) { if (value > 0) lateCount += 1; } console.log('tee total=' + total + ' fast=' + fastCount + ' late=' + lateCount + ' made-before-late=' + before + ' made-after-late=' + made); } await measure(3); await measure(4096); const child = spawn('/bin/sh', ['-c', 'printf XYZ']); let first = ''; child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => { first += chunk; }); const state = await new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal }))); let late = ''; child.stdout.on('data', (chunk) => { late += chunk; }); await new Promise((resolve) => setImmediate(resolve)); console.log('control-direct-child first=' + JSON.stringify(first) + ' late=' + JSON.stringify(late) + ' code=' + state.code + ' signal=' + state.signal);"
tee total=3 fast=3 late=3 made-before-late=3 made-after-late=3
tee total=4096 fast=4096 late=4096 made-before-late=4096 made-after-late=4096
control-direct-child first="XYZ" late="" code=0 signal=null
```

## 3. The write side

Add a separate byte method:

```ts
write(bytes: Uint8Array): boolean
```

`write` sends the supplied bytes unchanged. It returns the native write result and returns `false` for a closed, ended, destroyed, or throwing channel. Keep `send(text: string): boolean` unchanged as the newline-framed operation.

The built implementation confirms that `send('A')` writes `41 0a`, while exact initial input writes only `41`:

```text
$ node --input-type=module -e "import { createProcess } from './dist/src/server/index.js'; const sent = createProcess({ command: { file: '/bin/sh', arguments: ['-c', 'dd bs=2 count=1 2>/dev/null | od -An -tx1'] }, workspace: process.cwd(), grace: 100, writable: true }); console.log('send-return=' + sent.send('A')); await sent.exit; const sentLines = []; for await (const line of sent.lines) sentLines.push(line.trim()); console.log('send-bytes=' + JSON.stringify(sentLines)); const exact = createProcess({ command: { file: '/bin/sh', arguments: ['-c', 'od -An -tx1'], input: 'A' }, workspace: process.cwd(), grace: 100 }); await exact.exit; const exactLines = []; for await (const line of exact.lines) exactLines.push(line.trim()); console.log('control-input-bytes=' + JSON.stringify(exactLines)); await sent.destroy(); await exact.destroy();"
send-return=true
send-bytes=["41 0a"]
control-input-bytes=["41"]
```

## 4. Where framing lives

`process` emits transport bytes without interpreting message boundaries. The existing `lines` projection remains its newline convenience. Content-Length parsing stays in probe because probe owns the only such consumer and already owns the stateful partial-frame buffer. No separate parser package is warranted by one local implementation.

The existing LintStage already keeps framing outside process control:

```text
$ rg -n "child\.stdout\.on\('data'|Buffer\.concat|parseContentLength|child\.stdin\.write" /workspace/probe/src/server/stages/LintStage.ts
12:	parseContentLength,
124:		child.stdout.on('data', (chunk: Buffer) => this.#read(chunk))
261:		child.stdin.write(header + content)
265:		this.#buffer = Buffer.concat([this.#buffer, chunk])
273:		const length = parseContentLength(header)
```

This follows the `ndjson` and `sse` division: a stateful parser retains partial framing state, while the transport only delivers chunks.

## 5. What you rejected

- `readonly bytes: ReadableStream<Uint8Array>` was rejected. A tee behind the eager `lines` consumer retained every unread byte-branch item in the 3- and 4,096-item measurements. Backpressuring the shared source instead would make an unread byte surface prevent stdout drainage and `exit`.
- `stream(): ReadableStream<Uint8Array>` was rejected. A fresh stream per call requires replay storage for a one-shot source. A long-lived child makes that storage unbounded, and a cap or truncation would corrupt protocols.
- `readonly bytes: AsyncIterable<Uint8Array>` was rejected. Lossless late consumption still requires an unbounded queue. Removing that queue leaves a live push source wrapped in a weaker API without Web Stream backpressure, cancellation, or piping.
- Exposing `child.stdout` was rejected by the settled brief because `readline` already consumes that stream.
- A construction mode choosing lines or bytes was rejected because it makes the unconditional `lines` contract conditional and degrades the MCP consumer.
- Adding a delimiter option or `Uint8Array` overload to `send` was rejected because exact bytes and newline-framed text are different behaviors. The single-word sibling `write` keeps both contracts explicit.
- Content-Length framing in `process`, or a parser package for it, was rejected because neither transport supervision nor a second real consumer requires that policy.

Platform absence did not reject `ReadableStream`: Node 22 exposes it and supports native async iteration. The non-iterable control fails as expected:

```text
$ node --input-type=module -e "console.log('node=' + process.version); console.log('ReadableStream=' + typeof ReadableStream); const stream = new ReadableStream({ start(controller) { controller.enqueue(Uint8Array.of(1, 2)); controller.close(); } }); const values = []; for await (const chunk of stream) values.push([...chunk].join(',')); console.log('for-await=' + values.join('|')); const control = { getReader() { return {}; } }; try { for await (const value of control) void value; } catch (error) { console.log('control=' + error.constructor.name); }"
node=v22.22.2
ReadableStream=function
for-await=1,2
control=TypeError
```

## 6. The migration

- `lines` keeps its exact signature and eager, retained, trailing-partial behavior.
- Probe’s `LintStage` adopts `ProcessInterface`, sets `writable: true`, installs `on.stdout` at construction, feeds those chunks to its existing Content-Length parser, and replaces exact `child.stdin.write(header + content)` calls with `process.write(bytes)`.
- MCP remains newline-framed. If its client transport adopts `ProcessInterface`, it consumes `lines` and calls `send(JSON.stringify(message))`; it does not subscribe to `stdout` or call `write`.
- Existing `Process` consumers that only construct or consume a process require no change. Initial event hooks remain optional. Custom `ProcessInterface` implementations must add `write`, and exhaustive `ProcessEventMap` handling must add `stdout`; update those consumers directly without a compatibility shim.
- The shipping MCP transport’s framing is already newline-based:

```text
$ rg -n "child\.stdout\.on\('data'|child\.stdin\.write|extractLines" /workspace/mcp/src/server/transports/StdioClientTransport.ts
12:import { dispatchLines, extractLines } from '../helpers.js'
27: *   {@link extractLines} line-framing helper (buffering a partial trailing line
86:		child.stdout.on('data', (chunk: Buffer | string) => this.#receive(chunk.toString()))
94:		child.stdin.write(`${JSON.stringify(message)}\n`)
110:		const { lines, remainder } = extractLines(this.#buffer, chunk)
```
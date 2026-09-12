# Language Server Protocol client

> A typed Language Server Protocol client over an injected byte transport: a host-independent core
> carrying the base-protocol framing codec, the JSON-RPC and protocol guards, and an `LSPClient`
> that completes the initialize handshake, owns opened document URIs, and selects pull or push
> diagnostics from the server's own capabilities, beside a server environment whose
> `StdioClientTransport` carries those bytes over a language server run as a child process.

Source: [`src/core`](../src/core) and [`src/server`](../src/server). Published through
`@orkestrel/lsp` and `@orkestrel/lsp/server`.

## Client lifecycle

Create an `LSPClient` with an `LSPTransportInterface`, call `start()` before document operations,
and call `destroy()` when the session ends. Concurrent `start()` calls share the handshake. A
failed handshake or peer exit closes that transport generation, and a later `start()` call begins
a fresh generation.

The client advertises `utf-16` as its only position encoding. `LSP_CAPABILITIES` is that
advertisement and the acceptance set behind it: the client sends the record as the initialize
request's `capabilities`, and a server that selects an encoding the record does not list fails the
handshake with an `LSPError` whose `code` property is `protocol`. A server that omits
`positionEncoding` leaves the protocol's own default in force, and `encoding` reports `utf-16`.

The client accepts `open()` and `close()` only during a ready generation. A dead generation refuses
wire writes with an `LSPError` whose `code` property is `closed`. During teardown, the client sends
`shutdown`, then permits only `exit` on an initialized generation that has not exited.

The lifecycle bound, the client abort, and the per-open abort have separate scopes. The `timeout`
option bounds the initialize and shutdown requests, the destroy-time exit write, and transport-close
settlement, and `30000` milliseconds applies when it is absent. The `signal` option
on `LSPClientOptions` aborts the client, rejects its pending operations with an `LSPError` coded
`aborted`, and begins destruction. `LSPOpenOptions` requires its own `signal` member on every
`open()` call, and that signal bounds that call's diagnostics wait alone. The client refuses a call
whose signal is already aborted, before writing `textDocument/didOpen`. An abort after that
notification rejects the call with an `LSPError` coded `aborted`, leaves the client ready, and
leaves the document owned until `close()` succeeds. The `timeout` option does not bound a
diagnostics wait. Arm the signal you pass to `open()` to bound one.

The `workspace` option is an opaque URI. The client forwards it as `rootUri` and never parses it, so
the caller owns its spelling. Derive it from a filesystem path rather than writing the URI by hand:
on a Node host `pathToFileURL` produces the `file:` URI that host's paths actually yield, including
the drive-letter form a Windows path takes. Derive each document URI the same way.

### Create a client and inspect a document

Use the published client factory with any transport that implements the byte seam, then open one
document, read its diagnostics, and close the session:

```ts
import type { LSPTransportInterface } from '@orkestrel/lsp'
import { createLSPClient } from '@orkestrel/lsp'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

declare const transport: LSPTransportInterface
declare const directory: string

const client = createLSPClient({ transport, workspace: pathToFileURL(directory).href })
await client.start()

const signal = AbortSignal.timeout(30_000)
const uri = pathToFileURL(join(directory, 'main.ts')).href

const diagnostics = await client.open(
	{
		uri,
		languageId: 'typescript',
		version: 1,
		text: 'const value = 1',
	},
	{ signal },
)
for (const diagnostic of diagnostics) console.log(diagnostic.message)
await client.close(uri)
await client.destroy()
```

## Transport seam

An `LSPTransportInterface` implementation emits byte chunks, exits, and transport errors through
its emitter. The `send()` and `close()` methods reject instead of throwing. After `close()` resolves,
`send()` resolves `false`. The client can call `start()` again only after `close()` resolves or the
transport emits `exit`. A transport that cannot reconnect rejects that later `start()` call.

Each accepted `start()` call opens a generation, and an implementation emits `chunk`, `exit`, and
`error` only for the current one, emitting `exit` at most once for it. The client trusts every
`exit` it receives, so an implementation whose peer can outlive its own `close()` owns that
obligation.

Drive that seam directly to carry one frame without a client:

```ts
import type { JSONRPCNotification, LSPTransportInterface } from '@orkestrel/lsp'
import { encodeLSPMessage } from '@orkestrel/lsp'

declare const transport: LSPTransportInterface

const notification: JSONRPCNotification = { jsonrpc: '2.0', method: 'exit' }

await transport.start()
const accepted = await transport.send(encodeLSPMessage(notification))
await transport.close()
```

`accepted` holds what `send()` reported for those bytes.

The client also defends against a foreign transport that throws synchronously. It converts a send
fault into a coded `LSPError`, bounds exit and close settlement by the `timeout` option, and removes
transport listeners during teardown. A close failure that settles before that deadline is emitted
before the client destroys its emitter. At the deadline, the client emits an `LSPError` coded
`timeout` and absorbs the later close outcome.

## Stdio client transport

The server environment publishes `StdioClientTransport`, the byte transport over a language server run as
a child process. It carries bytes and never frames: every standard-output chunk reaches the `chunk`
event exactly as the host delivered it, so a frame split across reads and two frames coalesced into
one read both arrive unaltered and the client's parser owns the framing. Standard error is read
continuously and retained as a bounded tail by the process package, so a chatty server can't fill
its pipe and stall.

`server.command` is the child's argument vector: its first element names the executable and the rest
are its arguments, so a launcher and its target stay one value and no shell splits them.
`server.directory` is the child's working directory, and `server.environment` is its complete
environment; the current directory and this process's environment apply when either is absent.

`on` and `error` configure the transport's emitter at construction. `on` installs its listeners
before the first `start()` call can spawn a child, so the first chunk that child produces already
has somewhere to go, and `error` receives a listener throw that the emitter would otherwise swallow.

Spawn a language server as a child process and drive it through the stdio transport:

```ts
import { createLSPClient } from '@orkestrel/lsp'
import { createStdioClientTransport } from '@orkestrel/lsp/server'
import { pathToFileURL } from 'node:url'

declare const directory: string

const transport = createStdioClientTransport({
	server: { command: ['my-language-server', '--stdio'], directory },
	grace: 5_000,
})
const client = createLSPClient({ transport, workspace: pathToFileURL(directory).href })
await client.start()
await client.destroy()
```

`grace` bounds the cooperative termination window in milliseconds, and `5000` applies when it is
absent. `close()` closes the child's input channel, waits `grace` for that closure's flush and the
child's own ending together on one shared deadline rather than a window for each, and hands a child
that outlives that window to the process package session's `stop`, which signals the
child's process group and escalates to an unconditional kill after `grace` again. The child leads
its own process group on a POSIX host, so that signal reaches its whole tree; Windows carries no
such group, so the host's `taskkill` utility ends the tree there instead. `close()` then waits up to
`grace` more for the child's streams to close, and emits `exit` carrying the code and signal the
host reported, so a grandchild holding the child's standard output open past its exit delays neither
the call nor the event. A second `close()` called while the first is in flight settles on that same
termination rather than resolving early. When the package cannot confirm the child stopped,
`close()` rejects with an `LSPError` whose `code` property is `timeout`, and the transport keeps the
still-live child.

Each accepted `start()` call opens a generation that owns its child, and only the current generation
reaches the emitter. `start()` spawns the configured child and resolves after the host reports it
spawned. The transport reconnects: after `close()` resolves, or after the child exits on its own and
the transport emits `exit`, a further `start()` call spawns a fresh child, and the retired generation
delivers neither a later `exit` nor a later chunk. A `start()` call made while the previous child
still owns the current generation is refused with an `LSPError` whose `code` property is `duplicate`,
which covers a live child, a child that ended on its own while a grandchild holding its standard
output defers the host's `close`, and a `close()` still in flight. Leave that window through
`close()`, whose wait for the child's stdio is bounded by `grace`, or by waiting for the `exit`
event. An empty command, a host that refuses the spawn, and a child that reports a spawn fault
each reject `start()` with one coded `spawn`. `send()` writes bytes to the child's standard input and
reports whether it accepted them, resolving `false` before the first `start()`, after `close()`
resolves, and after the child exits.

`pid` is the host's identifier for the child that owns the current generation, and it reads
`undefined` before the first `start()`, after a spawn the host refused, and after a generation
retires. Read it to supervise or log the running server, and read it before `close()` when you need
the identifier afterwards. A host reuses an identifier after it reaps the process that held it, so a
number kept past its generation names no particular child.

## Framing state

Use `parseLSPMessages()` with the preceding `LSPDecodeState` value to decode split or coalesced
frames. Retained byte segments are owned copies, so caller mutation after parsing cannot alter a
later continuation. The parser accepts unknown header fields and refuses malformed parameters in a
known `Content-Type` field. Use `encodeLSPMessage()` to produce a byte-accurate frame.

The core package publishes the operations over a retained state beside the codec.
`joinLSPSegments()` flattens a segment chain into one owned buffer, and `takeLSPTail()` takes that
chain's last bytes as an owned buffer, which is how a scan window survives a chunk split.
`scanLSPBoundary()` reports the first `\r\n\r\n` index in a flat buffer, and that index addresses
the buffer you passed, so a caller scanning a window adds the window's own offset to it.
`scanLSPBoundary()` returns the boundary's index, so `bytes.subarray(0, boundary)` is the block
`readLSPHeader()` reads and the body starts at `boundary + 4`.

Flatten a retained state, scan that buffer for the header boundary, and take the state's last bytes:

```ts
import type { LSPDecodeState } from '@orkestrel/lsp'
import { joinLSPSegments, scanLSPBoundary, takeLSPTail } from '@orkestrel/lsp'

declare const state: LSPDecodeState

const bytes = joinLSPSegments(state)
const boundary = scanLSPBoundary(bytes)
const overlap = takeLSPTail(state, 3)
```

When you frame the bytes yourself, reach the header and body grammars directly. `readLSPHeader()`
reads one header block and returns the `Content-Length` it declares. `readLSPBody()` reads the
content bytes that length measures and returns the validated JSON-RPC message. Each refuses with an
`LSPError`, and when you pass a `messages` argument it travels on that error's `context.messages`
property, so a caller that has already decoded frames keeps them through a refusal.

Encode one message, then read its declared length and its body back at the boundary offsets:

```ts
import { encodeLSPMessage, readLSPBody, readLSPHeader, scanLSPBoundary } from '@orkestrel/lsp'

const frame = encodeLSPMessage({ jsonrpc: '2.0', method: 'initialized' })
const boundary = scanLSPBoundary(frame)

if (boundary !== undefined) {
	const length = readLSPHeader(frame.subarray(0, boundary))
	const message = readLSPBody(frame.subarray(boundary + 4, boundary + 4 + length))
}
```

`length` reads `40`, the encoded body's byte length, and `message.method` reads `initialized`.

## Validation

Every payload this package reads off the wire arrives as `unknown`, so each guard narrows one
shape and returns `false` for anything else. Narrow a decoded frame by its JSON-RPC role:

```ts
import {
	isJSONRPCError,
	isJSONRPCNotification,
	isJSONRPCRequest,
	isJSONRPCResponse,
} from '@orkestrel/lsp'

declare const message: unknown
declare const payload: unknown

const method =
	isJSONRPCRequest(message) || isJSONRPCNotification(message) ? message.method : undefined
const id = isJSONRPCResponse(message) ? message.id : undefined
const code = isJSONRPCError(payload) ? payload.code : undefined
```

Narrow a document payload by the shape it claims:

```ts
import {
	isLSPCodeDescription,
	isLSPDiagnostic,
	isLSPDiagnosticRelated,
	isLSPDocumentDiagnosticReport,
	isLSPLocation,
	isLSPPosition,
	isLSPPublishDiagnosticsParams,
	isLSPRange,
} from '@orkestrel/lsp'

declare const value: unknown

const line = isLSPPosition(value) ? value.line : undefined
const start = isLSPRange(value) ? value.start : undefined
const uri = isLSPLocation(value) ? value.uri : undefined
const href = isLSPCodeDescription(value) ? value.href : undefined
const related = isLSPDiagnosticRelated(value) ? value.location : undefined
const text = isLSPDiagnostic(value) ? value.message : undefined
const published = isLSPPublishDiagnosticsParams(value) ? value.diagnostics : undefined
const report = isLSPDocumentDiagnosticReport(value) ? value.kind : undefined
```

Narrow a handshake payload the same way. A server capability record is open, so read each
negotiated feature through the guard that owns it:

```ts
import {
	isLSPDiagnosticOptions,
	isLSPIdentity,
	isLSPInitializeResult,
	isLSPServerCapabilities,
	isLSPTextDocumentSyncOptions,
} from '@orkestrel/lsp'

declare const result: unknown
declare const capability: unknown

const capabilities = isLSPInitializeResult(result) ? result.capabilities : undefined
const peer = isLSPIdentity(capability) ? capability.name : undefined
const encoding = isLSPServerCapabilities(capability) ? capability.positionEncoding : undefined
const change = isLSPTextDocumentSyncOptions(capability) ? capability.change : undefined
const workspace = isLSPDiagnosticOptions(capability) ? capability.workspaceDiagnostics : undefined
```

## Conformance

This package tracks Language Server Protocol 3.18. The mirror at `tests/mirrors/metaModel.json`
holds the protocol's metaModel instance as fetched bytes. To refresh it, download the
[protocol model](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/metaModel/metaModel.json)
to that path without reformatting it. Compute the downloaded bytes' SHA-256 and read the model's
`metaData.version`. Update `META_MODEL_DIGEST` and `META_MODEL_VERSION` in
`tests/setupConformance.ts` to those values in the same commit, so an unpinned mirror change
fails the conformance run. The conformance proof covers
the subset of the protocol this package speaks, and the diagnostic surface is the string-message
form matching the client's advertised capability.

## Methods

#### `LSPClientInterface`

The client interface exposes these behavioral methods:

| Method    | Signature                                                                                         | Summary                                                                                            |
| --------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `start`   | `start(): Promise<void>`                                                                          | Starts or restarts a transport generation and completes its initialize handshake.                  |
| `open`    | `open(document: LSPTextDocumentItem, options: LSPOpenOptions): Promise<readonly LSPDiagnostic[]>` | Opens a document and waits for diagnostics through the path selected from the server capabilities. |
| `close`   | `close(uri: LSPDocumentURI): Promise<void>`                                                       | Notifies the server that an owned document closed and releases the URI.                            |
| `destroy` | `destroy(): Promise<void>`                                                                        | Tears down the client within the configured timeout.                                               |

#### `LSPTransportInterface`

The transport interface exposes these behavioral methods:

| Method  | Signature                                   | Summary                                                      |
| ------- | ------------------------------------------- | ------------------------------------------------------------ |
| `start` | `start(): Promise<void>`                    | Starts or restarts the byte transport.                       |
| `send`  | `send(bytes: Uint8Array): Promise<boolean>` | Sends bytes and reports whether the transport accepted them. |
| `close` | `close(): Promise<void>`                    | Closes the active transport generation.                      |

## Surface

### Stdio client transport

The server surface provides these exports.

A `Shape` cell holds an interface's data members as bare names in braces, `?` marking an optional member and `plus` introducing its call-signature members, and a type alias's own type literal with a union's arms escaped as `\|`. An extended interface's name comes before `plus`, with the members it adds after. A function row's `Shape` cell holds its signature, and a guard row's the type it narrows to. A class row's `Shape` cell holds the interface it implements, or its constructor signature where it implements none.

| Export                          | Kind      | Shape                                                                     | Summary                                                                                 |
| ------------------------------- | --------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `StdioClientTransport`          | class     | `StdioClientTransportInterface`                                           | Streams Language Server Protocol bytes between a client and a child process over stdio. |
| `createStdioClientTransport`    | function  | `(options: StdioClientTransportOptions) => StdioClientTransportInterface` | Creates a byte transport over a Language Server Protocol child process.                 |
| `StdioClientTransportInterface` | interface | `LSPTransportInterface plus { pid }`                                      | Defines the stdio transport's own surface beyond the byte transport it carries.         |
| `StdioClientTransportOptions`   | interface | `{ on?, error?, server, grace? }`                                         | Configures a Language Server Protocol child process reached over its standard streams.  |

### Client and transport contracts

The client surface provides these entities and configuration contracts.

A `Shape` cell holds an interface's data members as bare names in braces, `?` marking an optional member and `plus` introducing its call-signature members, and a type alias's own type literal with a union's arms escaped as `\|`. A function row's `Shape` cell holds its signature, and a guard row's the type it narrows to. A class row's `Shape` cell holds the interface it implements, or its constructor signature where it implements none.

| Export                  | Kind      | Shape                                                                                                                                                                                                 | Summary                                                                               |
| ----------------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `LSPClient`             | class     | `LSPClientInterface`                                                                                                                                                                                  | Drives a Language Server Protocol peer through an injected byte transport.            |
| `createLSPClient`       | function  | `(options: LSPClientOptions) => LSPClientInterface`                                                                                                                                                   | Creates a transport-agnostic Language Server Protocol client.                         |
| `LSPClientInterface`    | interface | `{ emitter, capabilities, encoding } plus start, open, close, destroy`                                                                                                                                | Defines the document-oriented behavior exposed by an LSP client.                      |
| `LSPClientOptions`      | interface | `{ on?, error?, transport, workspace, timeout?, signal? }`                                                                                                                                            | Configures an LSP client and its transport.                                           |
| `LSPOpenOptions`        | interface | `{ signal }`                                                                                                                                                                                          | Configures a document inspection with the signal that bounds its diagnostics wait.    |
| `LSPClientEventMap`     | type      | `{ notification, exit, error }`                                                                                                                                                                       | Maps client event names to their listener arguments.                                  |
| `LSPClientLifecycle`    | type      | `{ phase: 'idle' } \| { phase: 'starting', promise, generation } \| { phase: 'ready', generation } \| { phase: 'closed' } \| { phase: 'destroying', promise, generation? } \| { phase: 'destroyed' }` | Describes the lifecycle state that gates client operations and transport generations. |
| `LSPClientCapabilities` | interface | `{ general?, textDocument? }`                                                                                                                                                                         | Describes the Language Server Protocol features this client advertises.               |
| `LSPTransportInterface` | interface | `{ emitter } plus start, send, close`                                                                                                                                                                 | Defines the byte transport required by an LSP client.                                 |
| `LSPTransportEventMap`  | type      | `{ chunk, exit, error }`                                                                                                                                                                              | Maps transport event names to their listener arguments.                               |
| `LSPPending`            | interface | `{ resolve, reject, signal, abort }`                                                                                                                                                                  | Describes one settlement record a client holds for an operation awaiting its outcome. |

### Framing, timing, and errors

The framing, timing, and error surface provides these exports.

A `Shape` cell holds an interface's data members as bare names in braces, `?` marking an optional member and `plus` introducing its call-signature members, and a type alias's own type literal with a union's arms escaped as `\|`. A function row's `Shape` cell holds its signature, and a guard row's the type it narrows to. A class row's `Shape` cell holds the interface it implements, or its constructor signature where it implements none.

| Export             | Kind      | Shape                                                                                                                               | Summary                                                                                     |
| ------------------ | --------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `encodeLSPMessage` | function  | `(message: JSONRPCMessage) => Uint8Array`                                                                                           | Encodes a JSON-RPC message as one byte-accurate LSP base-protocol frame.                    |
| `parseLSPMessages` | function  | `(chunk: Uint8Array, state?: LSPDecodeState) => readonly [messages: readonly JSONRPCMessage[], state: LSPDecodeState \| undefined]` | Parses a byte chunk into complete LSP base-protocol messages and retained decode state.     |
| `LSPDecodeState`   | type      | `{ bytes, previous?, size } \| { bytes, previous?, size, boundary, length }`                                                        | Retains incremental base-protocol bytes and resolved framing metadata between decode calls. |
| `joinLSPSegments`  | function  | `(state: LSPDecodeState) => Uint8Array`                                                                                             | Flattens the retained segments of a decode state into one owned buffer.                     |
| `takeLSPTail`      | function  | `(state: LSPDecodeState, count: number) => Uint8Array`                                                                              | Takes the last retained bytes of a decode state as an owned buffer.                         |
| `scanLSPBoundary`  | function  | `(bytes: Uint8Array) => number \| undefined`                                                                                        | Finds the first base-protocol header boundary in a flat buffer.                             |
| `readLSPHeader`    | function  | `(header: Uint8Array, messages?: readonly JSONRPCMessage[]) => number`                                                              | Reads one base-protocol header block and returns the content length it declares.            |
| `readLSPBody`      | function  | `(body: Uint8Array, messages?: readonly JSONRPCMessage[]) => JSONRPCMessage`                                                        | Reads one base-protocol content body as a validated JSON-RPC message.                       |
| `waitForDeadline`  | function  | `(timeout: number) => Promise<void>`                                                                                                | Waits for a deadline to elapse without holding the host event loop open.                    |
| `LSPError`         | class     | `new (message: string, options: LSPErrorOptions) => LSPError`                                                                       | Reports a package failure with a stable machine-readable category.                          |
| `isLSPError`       | function  | `LSPError`                                                                                                                          | Checks whether an unknown value is a branded package error.                                 |
| `LSPErrorCode`     | type      | `'spawn' \| 'framing' \| 'protocol' \| 'duplicate' \| 'server' \| 'timeout' \| 'aborted' \| 'closed'`                               | Identifies a stable package failure category, derived from `LSP_ERROR_CODES`.               |
| `LSPErrorContext`  | interface | `{ code?, messages?, value? }`                                                                                                      | Describes structured details attached to an `LSPError`.                                     |
| `LSPErrorOptions`  | interface | `{ code, context?, cause? }`                                                                                                        | Configures an `LSPError` instance.                                                          |

### JSON-RPC and initialization

The JSON-RPC and initialization surface provides these payload types.

A `Shape` cell holds an interface's data members as bare names in braces, `?` marking an optional member and `plus` introducing its call-signature members, and a type alias's own type literal with a union's arms escaped as `\|`.

| Export                  | Kind      | Shape                                                           | Summary                                                                       |
| ----------------------- | --------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `JSONRPCId`             | type      | `string \| number`                                              | Identifies a JSON-RPC request and its matching response.                      |
| `JSONRPCRequest`        | interface | `{ jsonrpc, id, method, params? }`                              | Describes a JSON-RPC 2.0 method call that requires a response.                |
| `JSONRPCNotification`   | interface | `{ jsonrpc, method, id?, params? }`                             | Describes a JSON-RPC 2.0 method call that permits no response.                |
| `JSONRPCError`          | interface | `{ code, message, data? }`                                      | Describes the error payload carried by a JSON-RPC error response.             |
| `JSONRPCResultResponse` | interface | `{ jsonrpc, id, result, error? }`                               | Describes a successful JSON-RPC 2.0 response.                                 |
| `JSONRPCErrorResponse`  | interface | `{ jsonrpc, id, error, result? }`                               | Describes a failed JSON-RPC 2.0 response.                                     |
| `JSONRPCResponse`       | type      | `JSONRPCResultResponse \| JSONRPCErrorResponse`                 | Describes either outcome of a JSON-RPC 2.0 request.                           |
| `JSONRPCMessage`        | type      | `JSONRPCRequest \| JSONRPCNotification \| JSONRPCResponse`      | Describes one complete JSON-RPC 2.0 wire message.                             |
| `LSPIdentity`           | interface | `{ name, version? }`                                            | Describes the name and optional version of an LSP peer.                       |
| `LSPInitializeParams`   | interface | `{ processId, clientInfo?, rootUri, capabilities }`             | Describes the initialization members sent by this client.                     |
| `LSPInitializeResult`   | interface | `{ capabilities, serverInfo? }`                                 | Describes the successful result of an initialize request.                     |
| `LSPServerCapabilities` | interface | `{ positionEncoding?, textDocumentSync?, diagnosticProvider? }` | Describes the known and extension capabilities returned by a language server. |
| `LSPExit`               | interface | `{ code, signal }`                                              | Describes how a transport process ended.                                      |

### Documents and diagnostics

The document and diagnostic surface provides these payload types.

A `Shape` cell holds an interface's data members as bare names in braces, `?` marking an optional member and `plus` introducing its call-signature members, and a type alias's own type literal with a union's arms escaped as `\|`.

| Export                        | Kind      | Shape                                                                                                | Summary                                                                                                |
| ----------------------------- | --------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `LSPDocumentURI`              | type      | `string`                                                                                             | Identifies a document by its Language Server Protocol URI.                                             |
| `LSPPosition`                 | interface | `{ line, character }`                                                                                | Describes a zero-based position inside a text document.                                                |
| `LSPRange`                    | interface | `{ start, end }`                                                                                     | Describes a half-open span inside a text document.                                                     |
| `LSPLocation`                 | interface | `{ uri, range }`                                                                                     | Describes a document URI and range pair.                                                               |
| `LSPTextDocumentIdentifier`   | interface | `{ uri }`                                                                                            | Identifies a text document in a Language Server Protocol message.                                      |
| `LSPTextDocumentItem`         | interface | `{ uri, languageId, version, text }`                                                                 | Describes the complete text and identity of a document being opened.                                   |
| `LSPDiagnosticSeverity`       | type      | `1 \| 2 \| 3 \| 4`                                                                                   | Identifies the standard severity assigned to a diagnostic, derived from `LSP_DIAGNOSTIC_SEVERITIES`.   |
| `LSPDiagnosticTag`            | type      | `1 \| 2`                                                                                             | Identifies a standard tag assigned to a diagnostic, derived from `LSP_DIAGNOSTIC_TAGS`.                |
| `LSPCodeDescription`          | interface | `{ href }`                                                                                           | Describes the external resource that explains a diagnostic code.                                       |
| `LSPDiagnosticRelated`        | interface | `{ location, message }`                                                                              | Describes related diagnostic text at another source location.                                          |
| `LSPDiagnostic`               | interface | `{ range, severity?, code?, codeDescription?, source?, message, tags?, relatedInformation?, data? }` | Describes one Language Server Protocol diagnostic.                                                     |
| `LSPPublishDiagnosticsParams` | interface | `{ uri, version?, diagnostics }`                                                                     | Describes diagnostics published for one document.                                                      |
| `LSPDocumentDiagnosticParams` | interface | `{ textDocument, identifier?, previousResultId? }`                                                   | Describes a request for diagnostics from one document.                                                 |
| `LSPDocumentDiagnosticReport` | type      | `{ kind: 'full', resultId?, items } \| { kind: 'unchanged', resultId }`                              | Describes a complete or unchanged document diagnostic report.                                          |
| `LSPPositionEncoding`         | type      | `string`                                                                                             | Identifies a position encoding selected by a language server.                                          |
| `LSPTextDocumentSyncKind`     | type      | `0 \| 1 \| 2`                                                                                        | Identifies the text synchronization mode selected by a language server, derived from `LSP_SYNC_KINDS`. |
| `LSPTextDocumentSyncOptions`  | interface | `{ openClose?, change? }`                                                                            | Describes the text synchronization features selected by a language server.                             |
| `LSPTextDocumentSync`         | type      | `LSPTextDocumentSyncKind \| LSPTextDocumentSyncOptions`                                              | Describes either compact or expanded text synchronization capabilities.                                |
| `LSPDiagnosticOptions`        | interface | `{ identifier?, interFileDependencies, workspaceDiagnostics }`                                       | Describes the diagnostic provider features selected by a language server.                              |

### Guards

The validation surface provides these guards.

In a guard table a `Shape` cell holds the type the guard narrows to.

| Export                          | Kind     | Shape                         | Summary                                                                         |
| ------------------------------- | -------- | ----------------------------- | ------------------------------------------------------------------------------- |
| `isJSONRPCError`                | function | `JSONRPCError`                | Checks whether an unknown value is a JSON-RPC error payload.                    |
| `isJSONRPCRequest`              | function | `JSONRPCRequest`              | Checks whether an unknown value is a JSON-RPC request.                          |
| `isJSONRPCNotification`         | function | `JSONRPCNotification`         | Checks whether an unknown value is a JSON-RPC notification.                     |
| `isJSONRPCResponse`             | function | `JSONRPCResponse`             | Checks whether an unknown value is a JSON-RPC response.                         |
| `isLSPPosition`                 | function | `LSPPosition`                 | Checks whether an unknown value is an LSP position.                             |
| `isLSPRange`                    | function | `LSPRange`                    | Checks whether an unknown value is an LSP range.                                |
| `isLSPLocation`                 | function | `LSPLocation`                 | Checks whether an unknown value is an LSP location.                             |
| `isLSPCodeDescription`          | function | `LSPCodeDescription`          | Checks whether an unknown value is an LSP code description.                     |
| `isLSPDiagnosticRelated`        | function | `LSPDiagnosticRelated`        | Checks whether an unknown value is related diagnostic information.              |
| `isLSPDiagnostic`               | function | `LSPDiagnostic`               | Checks whether an unknown value is an LSP diagnostic.                           |
| `isLSPPublishDiagnosticsParams` | function | `LSPPublishDiagnosticsParams` | Checks whether an unknown value is published diagnostic parameters.             |
| `isLSPDocumentDiagnosticReport` | function | `LSPDocumentDiagnosticReport` | Checks whether an unknown value is a document diagnostic report.                |
| `isLSPIdentity`                 | function | `LSPIdentity`                 | Checks whether an unknown value is an LSP identity.                             |
| `isLSPDiagnosticSeverity`       | const    | `LSPDiagnosticSeverity`       | Checks whether an unknown value is a diagnostic severity.                       |
| `isLSPDiagnosticTag`            | const    | `LSPDiagnosticTag`            | Checks whether an unknown value is a diagnostic tag.                            |
| `isLSPTextDocumentSyncKind`     | const    | `LSPTextDocumentSyncKind`     | Checks whether an unknown value is a text synchronization mode.                 |
| `isLSPTextDocumentSyncOptions`  | function | `LSPTextDocumentSyncOptions`  | Checks whether an unknown value is expanded text synchronization options.       |
| `isLSPDiagnosticOptions`        | function | `LSPDiagnosticOptions`        | Checks whether an unknown value is diagnostic provider options.                 |
| `isLSPServerCapabilities`       | function | `LSPServerCapabilities`       | Checks whether an unknown value is server capabilities this client can consume. |
| `isLSPInitializeResult`         | function | `LSPInitializeResult`         | Checks whether an unknown value is a successful initialize result.              |

### Constants

The constant surface provides these protocol names, advertisements, and limits.

A `Shape` cell holds the constant's declared type.

| Export                      | Kind  | Shape                                | Summary                                                                                    |
| --------------------------- | ----- | ------------------------------------ | ------------------------------------------------------------------------------------------ |
| `LSP_METHODS`               | const | `Readonly<Record<string, string>>`   | Names the Language Server Protocol methods this client sends or consumes.                  |
| `LSP_ENCODINGS`             | const | `readonly string[]`                  | Lists the position encodings named by Language Server Protocol 3.18.                       |
| `LSP_ERROR_CODES`           | const | `readonly LSPErrorCode[]`            | Lists the machine-readable failure categories an `LSPError` carries, in declaration order. |
| `LSP_DIAGNOSTIC_SEVERITIES` | const | `readonly LSPDiagnosticSeverity[]`   | Lists the diagnostic severities named by the Language Server Protocol, from error to hint. |
| `LSP_DIAGNOSTIC_TAGS`       | const | `readonly LSPDiagnosticTag[]`        | Lists the diagnostic tags named by the Language Server Protocol.                           |
| `LSP_SYNC_KINDS`            | const | `readonly LSPTextDocumentSyncKind[]` | Lists the text synchronization modes named by the Language Server Protocol.                |
| `LSP_CAPABILITIES`          | const | `LSPClientCapabilities`              | Describes the capabilities this client advertises in its initialize request.               |
| `LSP_TIMEOUT`               | const | `number`                             | Names the default request-settlement timeout, `30_000` milliseconds.                       |
| `JSONRPC_PARSE_ERROR`       | const | `number`                             | Identifies a malformed JSON payload, `-32700`.                                             |
| `JSONRPC_INVALID_REQUEST`   | const | `number`                             | Identifies a structurally invalid JSON-RPC request, `-32600`.                              |
| `JSONRPC_METHOD_NOT_FOUND`  | const | `number`                             | Identifies a JSON-RPC method that the receiver does not provide, `-32601`.                 |
| `JSONRPC_INVALID_PARAMS`    | const | `number`                             | Identifies invalid parameters supplied to a JSON-RPC method, `-32602`.                     |
| `JSONRPC_INTERNAL_ERROR`    | const | `number`                             | Identifies an internal JSON-RPC receiver failure, `-32603`.                                |
| `LSP_REQUEST_CANCELLED`     | const | `number`                             | Identifies a Language Server Protocol request cancelled by the client, `-32800`.           |
| `LSP_CONTENT_MODIFIED`      | const | `number`                             | Identifies a request invalidated by modified document content, `-32801`.                   |
| `LSP_SERVER_CANCELLED`      | const | `number`                             | Identifies a Language Server Protocol request cancelled by the server, `-32802`.           |
| `LSP_REQUEST_FAILED`        | const | `number`                             | Identifies a valid Language Server Protocol request that could not complete, `-32803`.     |
| `LSP_CONTENT_LIMIT`         | const | `number`                             | Bounds an accepted base-protocol content body to 64 MiB.                                   |
| `LSP_HEADER_LIMIT`          | const | `number`                             | Bounds an accepted base-protocol header to 64 KiB.                                         |

## Tests

- [`tests/guides.test.ts`](../tests/guides.test.ts) — the `## Surface` ↔ `src/core` and `src/server` bijection, the `LSPClientInterface` ↔ `LSPClient` and `LSPTransportInterface` method bijections, and the equality gate: every `Summary` cell against its declaration's description paragraph, the titled `Create a client and inspect a document` fence against the `@example` block of that title (pinned so the titled pair cannot be retired silently), and the README pitch against this guide's tagline. It also runs the flagship fences and asserts the values their comments claim.
- [`tests/src/core/LSPClient.test.ts`](../tests/src/core/LSPClient.test.ts) — the handshake, the ready and dead generations, document ownership, the pull and push diagnostics paths, the abort and timeout bounds, and bounded teardown.
- [`tests/src/core/factories.test.ts`](../tests/src/core/factories.test.ts) — `createLSPClient` returns a working `LSPClientInterface` over the options it is handed.
- [`tests/src/core/helpers.test.ts`](../tests/src/core/helpers.test.ts) — `encodeLSPMessage`, the retained-state operations `joinLSPSegments` and `takeLSPTail`, the `scanLSPBoundary` index, the `readLSPHeader` and `readLSPBody` grammars with their coded refusals, and `waitForDeadline`.
- [`tests/src/core/parsers.test.ts`](../tests/src/core/parsers.test.ts) — `parseLSPMessages` over split, coalesced, and malformed frames, and the state it retains between calls.
- [`tests/src/core/validators.test.ts`](../tests/src/core/validators.test.ts) — every guard accepts its own shape, refuses a near miss, and stays total for a hostile value.
- [`tests/src/server/factories.test.ts`](../tests/src/server/factories.test.ts) — `createStdioClientTransport` returns a working `StdioClientTransportInterface` over the options it is handed.
- [`tests/src/server/transports/StdioClientTransport.test.ts`](../tests/src/server/transports/StdioClientTransport.test.ts) — spawning, byte carriage into the child and out of it, generation ownership and reconnection, `pid`, and the bounded termination window against a child whose grandchild holds its standard output.
- [`tests/integration.test.ts`](../tests/integration.test.ts) — the core client driving a real language server child through the stdio transport.
- [`tests/conformance.test.ts`](../tests/conformance.test.ts) — the subset of Language Server Protocol 3.18 this package speaks, read against the mirrored metaModel instance.

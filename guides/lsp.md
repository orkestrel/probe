# Language Server Protocol client

The core package provides host-independent Language Server Protocol framing, validation, and a
document-oriented client over an injected byte transport.

## Client lifecycle

Create an `LSPClient` with an `LSPTransportInterface`, call `start()` before document operations,
and call `destroy()` when the session ends. Concurrent `start()` calls share the handshake. A
failed handshake or peer exit closes that transport generation, and a later `start()` call begins
a fresh generation.

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

Use the published client factory with any transport that implements the byte seam:

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

## Stdio transport

The server environment publishes `StdioTransport`, the byte transport over a language server run as
a child process. It carries bytes and never frames: every standard-output chunk reaches the `chunk`
event exactly as the host delivered it, so a frame split across reads and two frames coalesced into
one read both arrive unaltered and the client's parser owns the framing. Standard error is drained
so a chatty server can't fill its pipe and stall.

`server.command` is the child's argument vector: its first element names the executable and the rest
are its arguments, so a launcher and its target stay one value and no shell splits them.
`server.directory` is the child's working directory, and `server.environment` is its complete
environment; the current directory and this process's environment apply when either is absent.

```ts
import { createLSPClient } from '@orkestrel/lsp'
import { createStdioTransport } from '@orkestrel/lsp/server'
import { pathToFileURL } from 'node:url'

declare const directory: string

const transport = createStdioTransport({
	server: { command: ['my-language-server', '--stdio'], directory },
	grace: 5_000,
})
const client = createLSPClient({ transport, workspace: pathToFileURL(directory).href })
await client.start()
await client.destroy()
```

`grace` bounds the cooperative termination window in milliseconds, and `5000` applies when it is
absent. `close()` ends the child's input stream, waits `grace` for the child's own exit, and hands a
child that outlives that window to the process package's `stopChild` helper, which signals it, waits
`grace` again, and escalates to an unconditional kill. The child stays in the parent's process group
rather than leading its own, so that helper reaches it through a direct signal after the host reports
that no group owns its identifier. `close()` then waits up to `grace` more for the child's streams to
close, and emits `exit` carrying the code and signal the host reported, so a grandchild holding the
child's standard output open past its exit delays neither the call nor the event. A second `close()`
called while the first is in flight settles on that same termination rather than resolving early.
When the helper cannot confirm the child stopped, `close()` rejects with an `LSPError` whose `code`
property is `timeout`, and the transport keeps the still-live child.

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
holds the protocol's metaModel instance as fetched bytes. Refresh the mirror by running
`scripts/metamodel.sh`, which prints the fetched version and SHA-256. Update `META_MODEL_DIGEST`
and `META_MODEL_VERSION` in `tests/setupConformance.ts` to the printed values in the same commit,
so a mirror edited outside this procedure reddens the conformance run. The conformance proof covers
the subset of the protocol this package speaks, and the diagnostic surface is the string-message
form matching the client's advertised capability.

## Methods

#### `LSPClientInterface`

The client interface exposes these behavioral methods:

| Method    | Signature                                                                                         | Behavior                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `start`   | `start(): Promise<void>`                                                                          | Starts or restarts a transport generation and completes its initialize handshake.        |
| `open`    | `open(document: LSPTextDocumentItem, options: LSPOpenOptions): Promise<readonly LSPDiagnostic[]>` | Opens a document and waits for diagnostics under the required `options` signal.          |
| `close`   | `close(uri: LSPDocumentURI): Promise<void>`                                                       | Notifies the peer that an owned document closed.                                         |
| `destroy` | `destroy(): Promise<void>`                                                                        | Drains work, performs bounded protocol and transport teardown, and destroys the emitter. |

#### `LSPTransportInterface`

The transport interface exposes these behavioral methods:

| Method  | Signature                                   | Behavior                                                     |
| ------- | ------------------------------------------- | ------------------------------------------------------------ |
| `start` | `start(): Promise<void>`                    | Starts or restarts the byte transport.                       |
| `send`  | `send(bytes: Uint8Array): Promise<boolean>` | Sends bytes and reports whether the transport accepted them. |
| `close` | `close(): Promise<void>`                    | Closes the active transport generation.                      |

## Surface

The server surface provides these exports:

| Export                    | Kind      | Purpose                                                                   |
| ------------------------- | --------- | ------------------------------------------------------------------------- |
| `StdioTransport`          | class     | Implements the byte transport over a language server child process.       |
| `createStdioTransport`    | function  | Creates a `StdioTransportInterface` from `StdioTransportOptions`.         |
| `StdioTransportInterface` | interface | Defines the readonly `pid` property beside the byte transport surface.    |
| `StdioTransportOptions`   | interface | Configures the child's command, directory, environment, and grace window. |

The client surface provides these entities and configuration contracts:

| Export                  | Kind      | Purpose                                                                                           |
| ----------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `LSPClient`             | class     | Implements the document-oriented client.                                                          |
| `createLSPClient`       | function  | Creates an `LSPClientInterface` from `LSPClientOptions`.                                          |
| `LSPClientInterface`    | interface | Defines the readonly `emitter`, `capabilities`, and `encoding` properties and the client methods. |
| `LSPClientOptions`      | interface | Configures transport, workspace, lifecycle timeout, client abort, and event hooks.                |
| `LSPOpenOptions`        | interface | Configures a document inspection with the signal that bounds its diagnostics wait.                |
| `LSPClientEventMap`     | type      | Maps client notifications, exits, and errors to listener arguments.                               |
| `LSPClientLifecycle`    | type      | Describes lifecycle ownership and transport generations.                                          |
| `LSPClientCapabilities` | interface | Describes the capabilities advertised during initialization.                                      |
| `LSPTransportInterface` | interface | Defines the readonly `emitter` property and the byte transport methods.                           |
| `LSPTransportEventMap`  | type      | Maps byte chunks, exits, and errors to transport listeners.                                       |

The framing and error surface provides these exports:

| Export             | Kind      | Purpose                                                       |
| ------------------ | --------- | ------------------------------------------------------------- |
| `encodeLSPMessage` | function  | Encodes a JSON-RPC message into an LSP frame.                 |
| `parseLSPMessages` | function  | Decodes complete messages and returns retained framing state. |
| `LSPDecodeState`   | type      | Describes retained incremental framing bytes.                 |
| `LSPError`         | class     | Reports a package failure with a stable code.                 |
| `isLSPError`       | function  | Checks for a branded package error.                           |
| `LSPErrorCode`     | type      | Lists stable package error codes.                             |
| `LSPErrorContext`  | interface | Describes structured error details.                           |
| `LSPErrorOptions`  | interface | Configures a package error.                                   |

The JSON-RPC and initialization surface provides these payload types:

| Export                  | Kind      | Purpose                                       |
| ----------------------- | --------- | --------------------------------------------- |
| `JSONRPCId`             | type      | Identifies a request and response pair.       |
| `JSONRPCRequest`        | interface | Describes a request message.                  |
| `JSONRPCNotification`   | interface | Describes a notification message.             |
| `JSONRPCError`          | interface | Describes an error payload.                   |
| `JSONRPCResultResponse` | interface | Describes a successful response.              |
| `JSONRPCErrorResponse`  | interface | Describes a failed response.                  |
| `JSONRPCResponse`       | type      | Describes either response outcome.            |
| `JSONRPCMessage`        | type      | Describes any supported wire message.         |
| `LSPIdentity`           | interface | Describes a protocol peer.                    |
| `LSPInitializeParams`   | interface | Describes the client initialize payload.      |
| `LSPInitializeResult`   | interface | Describes a successful initialize result.     |
| `LSPServerCapabilities` | interface | Describes server capabilities and extensions. |
| `LSPExit`               | interface | Describes how a transport process ended.      |

The document and diagnostic surface provides these payload types:

| Export                        | Kind      | Purpose                                          |
| ----------------------------- | --------- | ------------------------------------------------ |
| `LSPDocumentURI`              | type      | Identifies a document.                           |
| `LSPPosition`                 | interface | Describes a zero-based document position.        |
| `LSPRange`                    | interface | Describes a half-open document span.             |
| `LSPLocation`                 | interface | Pairs a document URI with a range.               |
| `LSPTextDocumentIdentifier`   | interface | Identifies a text document payload.              |
| `LSPTextDocumentItem`         | interface | Describes an opened document and its text.       |
| `LSPDiagnosticSeverity`       | type      | Identifies a diagnostic severity.                |
| `LSPDiagnosticTag`            | type      | Identifies a diagnostic tag.                     |
| `LSPCodeDescription`          | interface | Links a diagnostic code to its description.      |
| `LSPDiagnosticRelated`        | interface | Describes related diagnostic information.        |
| `LSPDiagnostic`               | interface | Describes a diagnostic.                          |
| `LSPPublishDiagnosticsParams` | interface | Describes pushed diagnostics.                    |
| `LSPDocumentDiagnosticParams` | interface | Describes a pull-diagnostic request.             |
| `LSPDocumentDiagnosticReport` | type      | Describes a full or unchanged diagnostic report. |
| `LSPPositionEncoding`         | type      | Identifies a negotiated position encoding.       |
| `LSPTextDocumentSyncKind`     | type      | Identifies a text synchronization mode.          |
| `LSPTextDocumentSyncOptions`  | interface | Describes expanded synchronization options.      |
| `LSPTextDocumentSync`         | type      | Describes compact or expanded synchronization.   |
| `LSPDiagnosticOptions`        | interface | Describes a server diagnostic provider.          |

The validation surface provides these guards:

| Export                          | Kind     | Purpose                                  |
| ------------------------------- | -------- | ---------------------------------------- |
| `isJSONRPCError`                | function | Checks an error payload.                 |
| `isJSONRPCRequest`              | function | Checks a request message.                |
| `isJSONRPCNotification`         | function | Checks a notification message.           |
| `isJSONRPCResponse`             | function | Checks a response message.               |
| `isLSPPosition`                 | function | Checks a document position.              |
| `isLSPRange`                    | function | Checks a document range.                 |
| `isLSPLocation`                 | function | Checks a location.                       |
| `isLSPCodeDescription`          | function | Checks a diagnostic code description.    |
| `isLSPDiagnosticRelated`        | function | Checks related diagnostic information.   |
| `isLSPDiagnostic`               | function | Checks a diagnostic.                     |
| `isLSPPublishDiagnosticsParams` | function | Checks pushed diagnostic parameters.     |
| `isLSPDocumentDiagnosticReport` | function | Checks a diagnostic report.              |
| `isLSPIdentity`                 | function | Checks a peer identity.                  |
| `isLSPTextDocumentSyncOptions`  | function | Checks expanded synchronization options. |
| `isLSPDiagnosticOptions`        | function | Checks diagnostic provider options.      |
| `isLSPServerCapabilities`       | function | Checks server capabilities.              |
| `isLSPInitializeResult`         | function | Checks an initialize result.             |

The constant surface provides these protocol names and limits:

| Export                     | Kind  | Purpose                                                       |
| -------------------------- | ----- | ------------------------------------------------------------- |
| `LSP_METHODS`              | const | Names the protocol methods that the client sends or consumes. |
| `LSP_ENCODINGS`            | const | Lists protocol position encodings.                            |
| `LSP_TIMEOUT`              | const | Names the default request-settlement timeout in milliseconds. |
| `JSONRPC_PARSE_ERROR`      | const | Identifies a malformed JSON payload.                          |
| `JSONRPC_INVALID_REQUEST`  | const | Identifies a structurally invalid request.                    |
| `JSONRPC_METHOD_NOT_FOUND` | const | Identifies an unsupported method.                             |
| `JSONRPC_INVALID_PARAMS`   | const | Identifies invalid method parameters.                         |
| `JSONRPC_INTERNAL_ERROR`   | const | Identifies a receiver failure.                                |
| `LSP_REQUEST_CANCELLED`    | const | Identifies a client-cancelled request.                        |
| `LSP_CONTENT_MODIFIED`     | const | Identifies a request invalidated by content changes.          |
| `LSP_SERVER_CANCELLED`     | const | Identifies a server-cancelled request.                        |
| `LSP_REQUEST_FAILED`       | const | Identifies a request that could not complete.                 |
| `LSP_CONTENT_LIMIT`        | const | Bounds an accepted content body.                              |
| `LSP_HEADER_LIMIT`         | const | Bounds an accepted framing header.                            |

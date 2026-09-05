import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { createScratch } from '@orkestrel/test/server'
import { describe, expect, it } from 'vitest'
import {
	DIRECTORY_LINKS,
	REFUSED_RUNTIME_TARGETS,
	createLintFixture,
	describeEnding,
	killFixtureServer,
	probeRefusedTargets,
	readChildEnding,
	readFixtureServer,
	readHostEnding,
	readSignalEnding,
	waitForFixtureServer,
	writeWorkspaceFixture,
} from './setupServer.js'

describe('server test setup', () => {
	it('classifies whether this host refuses a name it will not accept', () => {
		const refused = probeRefusedTargets()
		expect(typeof refused).toBe('boolean')
		// The constant is what every gated proof reads, and it is one call taken at load. Comparing a
		// fresh call against it is what keeps the gate a live reading of this host rather than a value
		// nothing can re-derive.
		expect(REFUSED_RUNTIME_TARGETS).toBe(refused)
	})

	it('builds one framing writer and the selections a caller made', () => {
		const fixture = createLintFixture({ budget: 300_000, delay: 100 })
		expect(fixture.program).toContain('setTimeout(() => process.exit(0), 300000)')
		expect(fixture.program).toContain('setTimeout(() => publish(uri), 100)')
		// One writer and one parser, which is the whole point of building this text in one place: a
		// second copy is what lets one program answer a protocol its siblings no longer speak.
		expect(fixture.program.split("process.stdout.write('Content-Length: ").length - 1).toBe(1)
		expect(fixture.program.split('JSON.parse(buffer.subarray(').length - 1).toBe(1)
		const published: unknown = JSON.parse(fixture.manifest)
		expect(published).toMatchObject({ name: 'oxlint', bin: { oxlint: 'fixture.js' } })
		expect(Object.keys(fixture.files)).toContain('node_modules/oxlint/fixture.js')
		// A caller naming its own binary publishes that entry and needs no program beside it.
		const linked = createLintFixture({ binary: '/opt/oxlint/bin/oxlint' })
		const named: unknown = JSON.parse(linked.manifest)
		expect(named).toMatchObject({ bin: { oxlint: '/opt/oxlint/bin/oxlint' } })
		expect(Object.keys(linked.files)).not.toContain('node_modules/oxlint/fixture.js')
	})

	it('writes a version-only TypeScript 7 workspace and nothing beside it by default', () => {
		const scratch = createScratch({ prefix: 'probe-setup-workspace-' })
		try {
			// The default: TypeScript 7 as a workspace installs it, and nothing beside it.
			const bare = writeWorkspaceFixture(scratch, { version: '7.0.2' })
			expect(bare).toBe(scratch.path)
			expect(scratch.has('node_modules/@typescript/typescript6/package.json')).toBe(false)
			expect(scratch.has('node_modules/oxlint/package.json')).toBe(false)
			// Each entry is loaded rather than read, because every proof driving this fixture reaches
			// it through a `require` and a text that cannot be loaded still matches a string.
			const published: unknown = createRequire(resolve(bare, 'package.json'))('typescript')
			expect(published).toStrictEqual({ version: '7.0.2' })
		} finally {
			scratch.destroy()
		}
	})

	it.runIf(DIRECTORY_LINKS)(
		'links the bridge and writes the tools beside the compiler a caller selects',
		() => {
			const scratch = createScratch({ prefix: 'probe-setup-workspace-' })
			try {
				// Every selection at once: the workspace a proof that branches on the installation
				// reaches for its equipped case.
				const equipped = writeWorkspaceFixture(scratch, {
					root: 'equipped',
					version: '6.9.9',
					carried: true,
					bridged: true,
					tooled: true,
				})
				expect(equipped).toBe(resolve(scratch.path, 'equipped'))
				const load = createRequire(resolve(equipped, 'package.json'))
				const carried: unknown = load('typescript')
				expect(carried).toMatchObject({ version: '6.9.9', createProgram: expect.any(Function) })
				// The linked bridge is this checkout's own installation, so it answers with a compiler.
				const bridge: unknown = load('@typescript/typescript6')
				expect(bridge).toMatchObject({ createProgram: expect.any(Function) })
				const oxlint: unknown = JSON.parse(
					scratch.read('equipped/node_modules/oxlint/package.json') ?? '',
				)
				expect(oxlint).toMatchObject({ name: 'oxlint', bin: { oxlint: 'fixture.js' } })
				const vitest: unknown = JSON.parse(
					scratch.read('equipped/node_modules/vitest/package.json') ?? '',
				)
				expect(vitest).toMatchObject({ name: 'vitest', version: '4.1.11' })
			} finally {
				scratch.destroy()
			}
		},
	)

	it('builds a fixture server that runs and announces itself', async () => {
		const scratch = createScratch({ files: createLintFixture().files })
		const child = spawn(
			process.execPath,
			[resolve(scratch.path, 'node_modules/oxlint/fixture.js')],
			{ cwd: scratch.path, stdio: 'ignore' },
		)
		const ended = readChildEnding(child)
		try {
			// The announcement is what every proof driving this fixture reads its child through, so
			// this drives the built text rather than inspecting it: a program that cannot parse or
			// cannot start announces nothing.
			expect(await waitForFixtureServer(scratch)).toBe(child.pid)
		} finally {
			child.kill('SIGKILL')
			await ended
			scratch.destroy()
		}
	})

	it('reads the code and the signal a child ended with', async () => {
		const child = spawn(process.execPath, ['-e', 'process.exit(3)'], { stdio: 'ignore' })
		expect(await readChildEnding(child)).toStrictEqual({ code: 3, signal: null })
	})

	it('names an ending by the member the host reported', () => {
		expect(describeEnding({ code: 0, signal: null })).toBe('code 0')
		expect(describeEnding({ code: null, signal: 'SIGKILL' })).toBe('signal SIGKILL')
	})

	it('reads how this host ends a child killed through its own signal door', async () => {
		// The control comes first: a child nobody killed ends on its own code, so a reading that
		// reported a kill's ending for it would be reading nothing about the kill.
		expect(describeEnding(await readHostEnding())).toBe('code 0')
		// How a kill lands is the host's decision — a signal on one host, an exit code on another —
		// so this reads the difference rather than a phrase one host writes.
		expect(describeEnding(await readHostEnding('SIGKILL'))).not.toBe('code 0')
	})

	it('reads the ending of a real child after signaling it', async () => {
		const ending = await readSignalEnding(
			'SIGTERM',
			[
				"process.once('SIGTERM', () => process.exit(7))",
				"process.stdout.write('armed')",
				'setTimeout(() => {}, 10_000)',
			].join('\n'),
		)
		expect(
			(ending.code === 7 && ending.signal === null) ||
				(ending.code === null && ending.signal === 'SIGTERM'),
		).toBe(true)
	})

	it('waits for, reads, and kills an announced fixture process', async () => {
		const scratch = createScratch({ prefix: 'probe-setup-server-' })
		const child = spawn(
			process.execPath,
			[
				'-e',
				"import { writeFileSync } from 'node:fs'; writeFileSync(process.argv[1], String(process.pid)); setTimeout(() => {}, 10_000)",
				resolve(scratch.path, 'server.pid'),
			],
			{ stdio: 'ignore' },
		)
		const id = child.pid
		if (id === undefined) throw new Error('The fixture child never reported a process id')
		const ended = new Promise<void>((settle) => {
			child.once('exit', () => settle())
		})
		try {
			expect(await waitForFixtureServer(scratch)).toBe(id)
			expect(readFixtureServer(scratch)).toBe(id)
			killFixtureServer(scratch)
			// The child's own exit event is what proves the kill landed on the announced process: it
			// settles only for the process this test started, which a signal-zero reading of a
			// reusable id cannot promise.
			await ended
		} finally {
			try {
				child.kill('SIGKILL')
				await ended
			} finally {
				scratch.destroy()
			}
		}
	})
})

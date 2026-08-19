diff --git a/tests/src/bin/main.test.ts b/tests/src/bin/main.test.ts
index bb0ec81..8dbd895 100644
--- a/tests/src/bin/main.test.ts
+++ b/tests/src/bin/main.test.ts
@@ -10,6 +10,28 @@ import { describe, expect, it } from 'vitest'
 const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
 const ENTRY = 'src/bin/main.ts'
 const BUILT_ENTRY = resolve(ROOT, 'dist/bin/main.js')
+const ARMING_TIMEOUT = 5_000
+
+function readArming(directory: string): readonly string[] {
+	try {
+		return readdirSync(directory).filter(
+			(name) => name.startsWith('arm-type-') || name.startsWith('arm-runtime-'),
+		)
+	} catch (error: unknown) {
+		if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
+		throw error
+	}
+}
+
+async function waitForArming(directory: string): Promise<readonly string[]> {
+	const deadline = performance.now() + ARMING_TIMEOUT
+	do {
+		const arming = readArming(directory)
+		if (arming.length === 2) return arming
+		await waitForDelay(10)
+	} while (performance.now() < deadline)
+	throw new Error(`Timed out waiting for two arming files in ${directory}`)
+}
 
 describe('bin entry', () => {
 	it('occupies the path the manifest declares side-effectful', () => {
@@ -339,16 +361,10 @@ describe('bin entry', () => {
 			})
 			let leaked: readonly string[] = []
 			try {
-				await waitForDelay(750)
-				const arming = readdirSync(directory).filter(
-					(name) => name.startsWith('arm-type-') || name.startsWith('arm-runtime-'),
-				)
-				expect(arming).toHaveLength(2)
+				const arming = await waitForArming(directory)
 				child.kill('SIGTERM')
 				await exited
-				leaked = readdirSync(directory).filter(
-					(name) => name.startsWith('arm-type-') || name.startsWith('arm-runtime-'),
-				)
+				leaked = readArming(directory)
 				expect([...leaked].sort()).toStrictEqual(arming.sort())
 			} finally {
 				if (child.exitCode === null) {

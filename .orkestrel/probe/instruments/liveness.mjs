import { spawn } from 'node:child_process'
// The claim: a signal-killed child leaves exitCode null, so `exitCode !== null` reads dead as alive.
const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: ['pipe','pipe','pipe'] })
child.once('spawn', () => setTimeout(() => child.kill('SIGKILL'), 100))
child.once('exit', (code, signal) => {
  console.log('exit event      code=%s signal=%s', code, signal)
  console.log('child.exitCode  =', child.exitCode)
  console.log('child.signalCode=', child.signalCode)
  console.log('GUARD exitCode !== null =>', child.exitCode !== null, '(false means the guard reads a dead child as alive)')
  let threw = false
  try { child.stdin.write('{"jsonrpc":"2.0"}\n') } catch { threw = true }
  console.log('write after death threw =', threw)
  // Negative control: an ordinary exit MUST set exitCode, or the probe cannot discriminate.
  const clean = spawn(process.execPath, ['-e', 'process.exit(3)'])
  clean.once('exit', () => {
    console.log('CONTROL clean exit: exitCode =', clean.exitCode, 'signalCode =', clean.signalCode)
    console.log('CONTROL guard exitCode !== null =>', clean.exitCode !== null, '(must be true, or the guard never works at all)')
  })
})

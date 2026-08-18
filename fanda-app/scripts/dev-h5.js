/* eslint-disable import/no-commonjs */
const { spawn } = require('node:child_process')

const taroCli = require.resolve('@tarojs/cli/bin/taro')
const child = spawn(process.execPath, [taroCli, 'build', '--type', 'h5', '--watch'], {
  env: {
    ...process.env,
    ENABLE_H5_PREVIEW_MOCK: 'true',
  },
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    child.kill(signal)
  })
}

child.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exitCode = code ?? 1
})

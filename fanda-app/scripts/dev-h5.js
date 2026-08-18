/* eslint-disable import/no-commonjs */
const { spawn } = require('node:child_process')

// H5 开发启动脚本：通过 Node 包装 Taro CLI，并注入预览 mock 环境变量。
const taroCli = require.resolve('@tarojs/cli/bin/taro')
const child = spawn(process.execPath, [taroCli, 'build', '--type', 'h5', '--watch'], {
  env: {
    ...process.env,
    // 本地 H5 预览不具备小程序登录能力，开启后请求层会走 mock 数据。
    ENABLE_H5_PREVIEW_MOCK: 'true',
  },
  stdio: 'inherit',
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    // 透传终止信号给子进程，避免 Taro watch 进程残留。
    child.kill(signal)
  })
}

child.on('error', (error) => {
  // 启动失败时保留原始错误输出，并通过 exitCode 通知外层命令失败。
  console.error(error)
  process.exitCode = 1
})

child.on('exit', (code, signal) => {
  if (signal) {
    // 子进程被信号结束时同步结束父进程，保持命令行行为一致。
    process.kill(process.pid, signal)
    return
  }
  process.exitCode = code ?? 1
})

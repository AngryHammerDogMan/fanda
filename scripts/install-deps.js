#!/usr/bin/env node

const { spawn } = require('node:child_process')

const INSTALL_STEPS = [
  {
    label: '安装前端依赖',
    command: 'npm',
    args: ['--prefix', 'fanda-app', 'install'],
  },
  {
    label: '下载后端 Go 依赖',
    command: 'go',
    args: ['-C', 'fanda-server', 'mod', 'download'],
  },
]

function getInstallSteps() {
  return INSTALL_STEPS.map((step) => ({
    ...step,
    args: [...step.args],
  }))
}

function runStep(step) {
  console.log(`\n> ${step.label}`)

  return new Promise((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${step.label}失败，退出码 ${code}`))
    })
  })
}

async function main() {
  for (const step of getInstallSteps()) {
    await runStep(step)
  }

  console.log('\n依赖安装完成')
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

module.exports = {
  getInstallSteps,
  runStep,
}

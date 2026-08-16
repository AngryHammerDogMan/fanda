#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const NPMRC_PATH = path.join(ROOT, 'fanda-app', '.npmrc')
const PACKAGE_JSON_PATH = path.join(ROOT, 'fanda-app', 'package.json')
const NODE_MODULES_LOCK = path.join(ROOT, 'fanda-app', 'node_modules', '.package-lock.json')

const INSTALL_STEPS = [
  {
    label: '初始化前端 npm 源',
    command: 'node',
    args: ['scripts/setup-npm-registry.js'],
    isDone: () => fs.existsSync(NPMRC_PATH),
  },
  {
    label: '安装前端依赖',
    command: 'npm',
    args: ['--prefix', 'fanda-app', 'install'],
    isDone: () => {
      if (!fs.existsSync(NODE_MODULES_LOCK)) return false
      // 如果 package.json 比 node_modules 更新，说明新增了依赖，需要重新安装
      try {
        const pkgStat = fs.statSync(PACKAGE_JSON_PATH)
        const lockStat = fs.statSync(NODE_MODULES_LOCK)
        return lockStat.mtimeMs >= pkgStat.mtimeMs
      } catch {
        return false
      }
    },
  },
  {
    label: '下载后端 Go 依赖',
    command: 'go',
    args: ['-C', 'fanda-server', 'mod', 'download'],
    isDone: () => false,
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
  const force = process.argv.includes('--force')
  let skipped = 0

  for (const step of getInstallSteps()) {
    if (!force && step.isDone()) {
      console.log(`\n> ${step.label}（已就绪，跳过）`)
      skipped++
      continue
    }

    await runStep(step)
  }

  if (skipped > 0) {
    console.log(`\n依赖安装完成（${skipped} 项已跳过，使用 --force 可强制重装）`)
  } else {
    console.log('\n依赖安装完成')
  }
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

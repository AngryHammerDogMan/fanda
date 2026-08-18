#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const PACKAGE_JSON_PATH = path.join(ROOT, 'fanda-app', 'package.json')
const PACKAGE_LOCK_PATH = path.join(ROOT, 'fanda-app', 'package-lock.json')
const NODE_MODULES_LOCK = path.join(ROOT, 'fanda-app', 'node_modules', '.package-lock.json')

// 脚本职责：串联前端 npm 源、前端依赖和后端 Go 依赖初始化，并在 postinstall 场景跳过重步骤。
function isFileNotOlderThan(targetPath, sourcePaths) {
  // targetPath 是可复用产物；sourcePaths 是判断产物是否过期的输入文件集合。
  if (!fs.existsSync(targetPath)) return false

  try {
    const targetStat = fs.statSync(targetPath)
    return sourcePaths.every((sourcePath) => {
      if (!fs.existsSync(sourcePath)) return true
      const sourceStat = fs.statSync(sourcePath)
      return targetStat.mtimeMs >= sourceStat.mtimeMs
    })
  } catch {
    return false
  }
}

// INSTALL_STEPS 描述依赖初始化流水线；heavy 标记允许 --skip-heavy 在轻量安装时过滤。
const INSTALL_STEPS = [
  {
    label: '初始化前端 npm 源',
    command: 'node',
    args: ['scripts/setup-npm-registry.js'],
    isDone: () => false,
  },
  {
    label: '安装前端依赖',
    command: 'npm',
    args: ['--prefix', 'fanda-app', 'install'],
    heavy: true,
    isDone: () => isFileNotOlderThan(NODE_MODULES_LOCK, [
      PACKAGE_JSON_PATH,
      PACKAGE_LOCK_PATH,
    ]),
  },
  {
    label: '下载后端 Go 依赖',
    command: 'go',
    args: ['-C', 'fanda-server', 'mod', 'download'],
    heavy: true,
    isDone: () => false,
  },
]

function getInstallSteps(options = {}) {
  return INSTALL_STEPS.filter((step) => !options.skipHeavy || !step.heavy).map((step) => ({
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
  const skipHeavy = process.argv.includes('--skip-heavy')
  // skipped 统计因产物已就绪而跳过的步骤数量，用于最终提示用户实际执行情况。
  let skipped = 0

  for (const step of getInstallSteps({ skipHeavy })) {
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

  if (skipHeavy) {
    console.log('已跳过前端依赖安装和后端 Go 依赖下载；如需完整初始化，请运行 npm run bootstrap')
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
  isFileNotOlderThan,
  runStep,
}

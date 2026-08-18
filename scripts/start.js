#!/usr/bin/env node

const { spawn } = require('node:child_process')
const readline = require('node:readline/promises')

// 脚本职责：统一暴露本地开发常用启动项，支持命令行参数和交互菜单两种入口。
const postgresStartCommand = `
if ! command -v brew >/dev/null 2>&1; then
  echo "未找到 brew，无法自动启动 PostgreSQL。请先手动启动数据库。"
  exit 1
fi

service="$(brew services list | awk '/^postgresql(@[0-9]+)?[[:space:]]/ { print $1; exit }')"
if [ -z "$service" ]; then
  service="postgresql"
fi

echo "使用 Homebrew 服务: $service"
brew services start "$service"
`

const redisStartCommand = `
if ! command -v brew >/dev/null 2>&1; then
  echo "未找到 brew，无法自动启动 Redis。Redis 是可选缓存，也可以先跳过。"
  exit 1
fi

brew services start redis
`

// TASKS 记录菜单 key、展示文案以及真实子进程命令，是 resolveTask/runTask 的共享数据源。
const TASKS = [
  {
    key: 'registry',
    label: '初始化前端 npm 源',
    command: 'node',
    args: ['scripts/setup-npm-registry.js'],
  },
  {
    key: 'h5',
    label: '启动前端 H5 预览',
    command: 'npm',
    args: ['--prefix', 'fanda-app', 'run', 'dev:h5'],
  },
  {
    key: 'server',
    label: '启动后端服务',
    command: 'go',
    args: ['-C', 'fanda-server', 'run', 'cmd/server/main.go'],
  },
  {
    key: 'postgres',
    label: '启动 PostgreSQL',
    command: 'sh',
    args: ['-lc', postgresStartCommand],
  },
  {
    key: 'redis',
    label: '启动 Redis（可选）',
    command: 'sh',
    args: ['-lc', redisStartCommand],
  },
  {
    key: 'migrate',
    label: '初始化/迁移数据库',
    command: 'go',
    args: ['-C', 'fanda-server', 'run', 'cmd/migrate/main.go'],
  },
]

function getMenuItems() {
  return TASKS.map(({ key, label }) => ({ key, label }))
}

function resolveTask(input) {
  // value 是用户输入的序号或任务 key，统一 trim 后再尝试匹配。
  const value = String(input || '').trim()
  const index = Number(value)

  if (Number.isInteger(index) && index >= 1 && index <= TASKS.length) {
    return TASKS[index - 1]
  }

  return TASKS.find((task) => task.key === value)
}

function getTaskArg(argv) {
  // taskFlagIndex 用来区分显式 --task 参数和位置参数，便于无效任务时直接退出而不进菜单。
  const taskFlagIndex = argv.indexOf('--task')
  if (taskFlagIndex >= 0) {
    return {
      explicit: true,
      value: argv[taskFlagIndex + 1],
    }
  }

  const value = argv.find((arg) => !arg.startsWith('-'))
  return {
    explicit: Boolean(value),
    value,
  }
}

function printMenu() {
  console.log('\n请选择要启动的服务：\n')

  getMenuItems().forEach((item, index) => {
    console.log(`${index + 1}. ${item.label} (${item.key})`)
  })

  console.log('')
}

async function promptTask() {
  printMenu()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  try {
    const answer = await rl.question('输入序号或 key：')
    return resolveTask(answer)
  } finally {
    rl.close()
  }
}

function runTask(task) {
  console.log(`\n> ${task.label}`)

  return new Promise((resolve, reject) => {
    // child 是被代理的实际启动命令；父进程负责转发中断信号并同步退出状态。
    const child = spawn(task.command, task.args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    const forwardSignal = (signal) => {
      if (!child.killed) {
        child.kill(signal)
      }
    }

    const onSigint = () => forwardSignal('SIGINT')
    const onSigterm = () => forwardSignal('SIGTERM')

    process.once('SIGINT', onSigint)
    process.once('SIGTERM', onSigterm)

    child.on('error', reject)
    child.on('exit', (code) => {
      process.removeListener('SIGINT', onSigint)
      process.removeListener('SIGTERM', onSigterm)

      if (code === 0) {
        resolve()
        return
      }

      reject(new Error(`${task.label}失败，退出码 ${code}`))
    })
  })
}

async function main() {
  const taskArg = getTaskArg(process.argv.slice(2))
  const task = taskArg.value ? resolveTask(taskArg.value) : undefined

  if (taskArg.explicit && !task) {
    console.error('未识别的选项')
    process.exit(1)
  }

  const selectedTask = task || await promptTask()

  if (!selectedTask) {
    console.error('未识别的选项')
    process.exit(1)
  }

  await runTask(selectedTask)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

module.exports = {
  getMenuItems,
  resolveTask,
  runTask,
}

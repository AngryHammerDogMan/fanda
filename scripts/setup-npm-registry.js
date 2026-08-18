#!/usr/bin/env node

const fs = require('node:fs')
const https = require('node:https')
const path = require('node:path')

const INTERNAL_REGISTRY = 'https://bnpm.byted.org/'
const PUBLIC_REGISTRY = 'https://registry.npmmirror.com/'
const DEFAULT_TIMEOUT_MS = 3000
const TARGET_NPMRC = path.resolve(__dirname, '../fanda-app/.npmrc')

// 脚本职责：探测可用 npm registry，并写入前端项目本机 .npmrc，避免修改锁文件源地址。
function normalizeRegistry(registry) {
  return registry.endsWith('/') ? registry : `${registry}/`
}

function createNpmrcContent(registry) {
  return [
    '# 本文件由 npm run setup:registry 自动生成，仅用于本机安装依赖。',
    '# 不要提交到 Git；仓库锁文件应保持使用公开镜像源。',
    `registry=${normalizeRegistry(registry)}`,
    'replace-registry-host=always',
    '',
  ].join('\n')
}

function probeRegistry(registry, timeoutMs = DEFAULT_TIMEOUT_MS) {
  // pingUrl 是 registry 的健康检查端点；timeoutMs 控制探测失败时的等待上限。
  const pingUrl = new URL('-/ping', normalizeRegistry(registry))

  return new Promise((resolve) => {
    const controller = new AbortController()
    const timer = setTimeout(() => {
      controller.abort()
      resolve(false)
    }, timeoutMs)

    const request = https.get(pingUrl, { signal: controller.signal }, (response) => {
      clearTimeout(timer)
      response.resume()
      const isUsableStatus = response.statusCode >= 200 && response.statusCode < 400
      resolve(isUsableStatus)
    })

    request.on('error', () => {
      clearTimeout(timer)
      resolve(false)
    })
  })
}

async function selectRegistry(probe = probeRegistry) {
  // canUseInternalRegistry 表示内网源探测结果，失败时回退到公开镜像源。
  const canUseInternalRegistry = await probe(INTERNAL_REGISTRY)
  return canUseInternalRegistry ? INTERNAL_REGISTRY : PUBLIC_REGISTRY
}

function writeProjectNpmrc(registry, targetPath = TARGET_NPMRC) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, createNpmrcContent(registry), 'utf8')
}

function resolveForcedRegistry(argv) {
  const forceArg = argv.find((arg) => arg.startsWith('--force='))
  if (!forceArg) {
    return undefined
  }

  const value = forceArg.slice('--force='.length)
  if (value === 'internal') {
    return INTERNAL_REGISTRY
  }

  if (value === 'public') {
    return PUBLIC_REGISTRY
  }

  throw new Error('无效的 --force 参数，请使用 internal 或 public')
}

async function setupNpmRegistry(argv = process.argv.slice(2)) {
  const forcedRegistry = resolveForcedRegistry(argv)
  const registry = forcedRegistry || await selectRegistry()

  writeProjectNpmrc(registry)
  console.log(`已写入前端本地 npm 源: ${registry}`)

  return registry
}

if (require.main === module) {
  setupNpmRegistry().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

module.exports = {
  INTERNAL_REGISTRY,
  PUBLIC_REGISTRY,
  TARGET_NPMRC,
  createNpmrcContent,
  normalizeRegistry,
  probeRegistry,
  resolveForcedRegistry,
  selectRegistry,
  setupNpmRegistry,
  writeProjectNpmrc,
}

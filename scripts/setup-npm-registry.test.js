const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const test = require('node:test')

const {
  INTERNAL_REGISTRY,
  PUBLIC_REGISTRY,
  createNpmrcContent,
  normalizeRegistry,
  resolveForcedRegistry,
  selectRegistry,
  writeProjectNpmrc,
} = require('./setup-npm-registry')

test('normalizes registry with trailing slash', () => {
  assert.equal(normalizeRegistry('https://registry.npmmirror.com'), PUBLIC_REGISTRY)
  assert.equal(normalizeRegistry(PUBLIC_REGISTRY), PUBLIC_REGISTRY)
})

test('selects internal registry when probe succeeds', async () => {
  const registry = await selectRegistry(async () => true)

  assert.equal(registry, INTERNAL_REGISTRY)
})

test('falls back to public registry when probe fails', async () => {
  const registry = await selectRegistry(async () => false)

  assert.equal(registry, PUBLIC_REGISTRY)
})

test('creates local npmrc content with generated-file warning', () => {
  const content = createNpmrcContent(PUBLIC_REGISTRY)

  assert.match(content, /自动生成/)
  assert.match(content, /不要提交到 Git/)
  assert.match(content, new RegExp(`registry=${PUBLIC_REGISTRY}`))
})

test('writes project npmrc to target path', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fanda-npmrc-'))
  const targetPath = path.join(tempDir, 'fanda-app', '.npmrc')

  writeProjectNpmrc(PUBLIC_REGISTRY, targetPath)

  assert.equal(fs.readFileSync(targetPath, 'utf8'), createNpmrcContent(PUBLIC_REGISTRY))
})

test('resolves forced registry argument', () => {
  assert.equal(resolveForcedRegistry(['--force=internal']), INTERNAL_REGISTRY)
  assert.equal(resolveForcedRegistry(['--force=public']), PUBLIC_REGISTRY)
  assert.equal(resolveForcedRegistry([]), undefined)
  assert.throws(() => resolveForcedRegistry(['--force=unknown']), /无效的 --force 参数/)
})

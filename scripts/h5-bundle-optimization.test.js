const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const H5_ENTRYPOINT_WARNING_LIMIT_KIB = 340

function collectScssFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return collectScssFiles(fullPath)
    }
    return entry.name.endsWith('.scss') ? [fullPath] : []
  })
}

test('H5 pages use route lazyload and splitChunks size guardrails', () => {
  const config = fs.readFileSync(path.join(process.cwd(), 'fanda-app/config/index.ts'), 'utf8')

  assert.match(config, /router:\s*\{\s*lazyload:\s*true\s*\}/)
  assert.match(config, /splitChunks\(\{\s*chunks:\s*['"]all['"]/)
  assert.match(config, /maxSize:\s*220\s*\*\s*1024/)
  assert.match(config, /runtimeChunk\(['"]single['"]\)/)
  assert.match(config, /maxEntrypointSize\(H5_ENTRYPOINT_WARNING_LIMIT_KIB\s*\*\s*1024\)/)
})

test('H5 entrypoint warning limit is documented in webpack performance hints', () => {
  const config = fs.readFileSync(path.join(process.cwd(), 'fanda-app/config/index.ts'), 'utf8')
  const testSource = fs.readFileSync(__filename, 'utf8')

  assert.match(config, new RegExp(`const H5_ENTRYPOINT_WARNING_LIMIT_KIB = ${H5_ENTRYPOINT_WARNING_LIMIT_KIB}`))
  assert.match(testSource, /^const H5_ENTRYPOINT_WARNING_LIMIT_KIB = 340$/m)
})

test('H5 stylesheets avoid bundling duplicate src/assets images', () => {
  const pagesDir = path.join(process.cwd(), 'fanda-app/src/pages')
  const scssFiles = collectScssFiles(pagesDir)
  const relativeAssetReferences = scssFiles.flatMap((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8')
    const relativePath = path.relative(process.cwd(), filePath)
    const matches = source.match(/url\(['"]?\.\.\/\.\.\/assets\//g) || []

    return matches.map((match) => `${relativePath}: ${match}`)
  })

  assert.deepEqual(relativeAssetReferences, [])
})

test('production request bundle does not statically import the H5 preview mock data', () => {
  const requestSource = fs.readFileSync(path.join(process.cwd(), 'fanda-app/src/services/request.ts'), 'utf8')

  assert.doesNotMatch(requestSource, /import\s+\{[^}]*createH5PreviewResponse[^}]*\}\s+from\s+['"]\.\/h5-preview['"]/)
  assert.match(requestSource, /import\(['"]\.\/h5-preview['"]\)/)
})

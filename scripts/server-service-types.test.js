const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const serviceDir = path.join(process.cwd(), 'fanda-server/internal/service')

function collectGoFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return collectGoFiles(fullPath)
    }
    return entry.name.endsWith('.go') && !entry.name.endsWith('_test.go') ? [fullPath] : []
  })
}

test('service layer uses concrete business types instead of interface maps', () => {
  const offenders = collectGoFiles(serviceDir).flatMap((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8')
    const relativePath = path.relative(process.cwd(), filePath)
    const matches = []

    if (/interface\{\}/.test(source)) {
      matches.push(`${relativePath}: interface{}`)
    }

    if (/map\[string\]interface\{\}/.test(source)) {
      matches.push(`${relativePath}: map[string]interface{}`)
    }

    return matches
  })

  assert.deepEqual(offenders, [])
})

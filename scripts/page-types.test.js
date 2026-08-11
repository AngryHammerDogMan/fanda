const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const pagesDir = path.join(process.cwd(), 'fanda-app/src/pages')

function collectSourceFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return collectSourceFiles(fullPath)
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : []
  })
}

test('page files avoid any-typed catches and any-valued query records', () => {
  const offenders = collectSourceFiles(pagesDir).flatMap((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8')
    const relativePath = path.relative(process.cwd(), filePath)
    const matches = []

    if (/catch \(err: any\)/.test(source)) {
      matches.push(`${relativePath}: catch (err: any)`)
    }

    if (/Record<string,\s*any>/.test(source)) {
      matches.push(`${relativePath}: Record<string, any>`)
    }

    if (/\bany\b/.test(source)) {
      matches.push(`${relativePath}: any`)
    }

    if (/as any/.test(source)) {
      matches.push(`${relativePath}: as any`)
    }

    return matches
  })

  assert.deepEqual(offenders, [])
})

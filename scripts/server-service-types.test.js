const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const serviceDir = path.join(process.cwd(), 'fanda-server/internal/service')

// collectGoFiles 递归收集后端 service 生产源码，排除 _test.go 以只检查业务实现。
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

// 测试意图：防止 service 层退回 interface{}、map[string]interface{} 或 any 等弱类型表达。
test('service layer uses concrete business types instead of interface maps', () => {
  const offenders = collectGoFiles(serviceDir).flatMap((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8')
    const relativePath = path.relative(process.cwd(), filePath)
    const matches = []
    // matches 保存当前 Go 文件命中的弱类型片段，最终要求 offenders 为空。

    if (/interface\{\}/.test(source)) {
      matches.push(`${relativePath}: interface{}`)
    }

    if (/map\[string\]interface\{\}/.test(source)) {
      matches.push(`${relativePath}: map[string]interface{}`)
    }

    if (/\bany\b/.test(source)) {
      matches.push(`${relativePath}: any`)
    }

    return matches
  })

  assert.deepEqual(offenders, [])
})

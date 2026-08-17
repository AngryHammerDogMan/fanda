const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const H5_ENTRYPOINT_WARNING_LIMIT_KIB = 340

test('fanda-app npm test uses the existing Node static test entry instead of Jest', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'fanda-app/package.json'), 'utf8'))
  const appTestsDir = path.join(process.cwd(), 'fanda-app/src/__tests__')
  const appStaticTests = fs.readdirSync(appTestsDir).filter((fileName) => fileName.endsWith('.test.cjs'))

  assert.equal(packageJson.scripts.test, 'node --test src/__tests__/*.test.cjs')
  assert.doesNotMatch(packageJson.scripts.test, /\bjest\b/)
  assert.deepEqual(appStaticTests, ['page-data-flow.test.cjs'])
})

test('H5 entrypoint warning limit is documented without blocking preview tests', () => {
  const testSource = fs.readFileSync(__filename, 'utf8')

  assert.match(testSource, /^const H5_ENTRYPOINT_WARNING_LIMIT_KIB = 340$/m)
})

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

test('H5 preview has the Taro HTML entry template', () => {
  const templatePath = path.join(process.cwd(), 'fanda-app/src/index.html')

  assert.equal(fs.existsSync(templatePath), true)

  const template = fs.readFileSync(templatePath, 'utf8')
  assert.match(template, /<div id="app"><\/div>/)
  assert.match(template, /htmlWebpackPlugin\.options\.script/)
})

test('H5 development server opens localhost instead of the auto-detected LAN address', () => {
  const devConfig = fs.readFileSync(path.join(process.cwd(), 'fanda-app/config/dev.ts'), 'utf8')

  assert.match(devConfig, /host:\s*'localhost'/)
  assert.match(devConfig, /open:\s*'http:\/\/localhost:10086\/'/)
})

test('H5 preview copies source assets to the runtime /assets path', () => {
  const config = fs.readFileSync(path.join(process.cwd(), 'fanda-app/config/index.ts'), 'utf8')

  assert.match(config, /from:\s*'src\/assets'/)
  assert.match(config, /to:\s*'dist\/assets'/)
})

test('H5 rem scaling keeps desktop preview at the source design size', () => {
  const config = fs.readFileSync(path.join(process.cwd(), 'fanda-app/config/index.ts'), 'utf8')

  assert.match(config, /pxtransform:\s*\{[\s\S]*maxRootSize:\s*12/)
  assert.match(config, /pxtransform:\s*\{[\s\S]*minRootSize:\s*12/)
})

test('H5 global styles define variables and constrain the preview shell', () => {
  const appScss = fs.readFileSync(path.join(process.cwd(), 'fanda-app/src/app.scss'), 'utf8')

  assert.match(appScss, /:root,\s*page,\s*taro-page/)
  assert.match(appScss, /body\s*>\s*#app,\s*body\s*>\s*#container\.taro-tabbar__container/)
  assert.match(appScss, /max-width:\s*430px/)
  assert.match(appScss, /margin:\s*0 auto/)
})

test('H5 global styles prevent horizontal overflow in the mobile shell', () => {
  const appScss = fs.readFileSync(path.join(process.cwd(), 'fanda-app/src/app.scss'), 'utf8')

  assert.match(appScss, /\*,\s*\*::before,\s*\*::after\s*\{[\s\S]*box-sizing:\s*border-box/)
  assert.match(appScss, /html,\s*body\s*\{[\s\S]*overflow-x:\s*hidden/)
  assert.match(appScss, /body\s*>\s*#app,\s*body\s*>\s*#container\.taro-tabbar__container\s*\{[\s\S]*overflow-x:\s*hidden/)
  assert.match(appScss, /body\s*>\s*#container\.taro-tabbar__container\s*>\s*\.taro-tabbar__panel\s*\{[\s\S]*overflow-x:\s*hidden/)
})

test('H5 tabbar remains visible inside the mobile preview shell', () => {
  const appScss = fs.readFileSync(path.join(process.cwd(), 'fanda-app/src/app.scss'), 'utf8')

  assert.match(appScss, /body\s*>\s*#container\.taro-tabbar__container\s*\{[\s\S]*height:\s*100vh/)
  assert.match(appScss, /body\s*>\s*#container\.taro-tabbar__container\s*>\s*\.taro-tabbar__panel\s*\{[\s\S]*min-height:\s*0/)
  assert.match(appScss, /body\s*>\s*#container\.taro-tabbar__container\s*>\s*taro-tabbar\s*\{[\s\S]*display:\s*block/)
  assert.match(appScss, /body\s*>\s*#container\.taro-tabbar__container\s*>\s*taro-tabbar\s*\{[\s\S]*flex:\s*0 0 50px/)
  assert.doesNotMatch(appScss, /(^|\n)#app\s*\{[^}]*overflow:\s*hidden/)
})

test('H5 login page can force-hide the tabbar shell', () => {
  const appScss = fs.readFileSync(path.join(process.cwd(), 'fanda-app/src/app.scss'), 'utf8')
  const loginContent = fs.readFileSync(path.join(process.cwd(), 'fanda-app/src/pages/login/index.tsx'), 'utf8')

  assert.match(loginContent, /LOGIN_BODY_CLASS\s*=\s*'fanda-login-active'/)
  assert.match(loginContent, /document\.body\.classList\.add\(LOGIN_BODY_CLASS\)/)
  assert.match(loginContent, /document\.body\.classList\.remove\(LOGIN_BODY_CLASS\)/)
  assert.match(appScss, /body\.fanda-login-active\s*>\s*#container\.taro-tabbar__container\s*>\s*taro-tabbar\s*\{[\s\S]*display:\s*none !important/)
  assert.match(appScss, /body\.fanda-login-active\s*>\s*#container\.taro-tabbar__container\s*>\s*\.taro-tabbar__panel\s*\{[\s\S]*height:\s*100vh/)
})

test('H5 preview mock requires explicit non-production preview flag', () => {
  const previewSource = fs.readFileSync(path.join(process.cwd(), 'fanda-app/src/services/h5-preview.ts'), 'utf8')

  assert.match(previewSource, /ENABLE_H5_PREVIEW_MOCK/)
  assert.match(previewSource, /process\.env\.TARO_ENV === ['"]h5['"]/)
  assert.match(previewSource, /process\.env\.NODE_ENV !== ['"]production['"]/)
  assert.doesNotMatch(previewSource, /process\.env\.TARO_ENV === ['"]h5['"] && token === ['"]h5-preview-token['"]/)
})

test('fixed page style blocks do not use browser-wide inset zero', () => {
  const pagesDir = path.join(process.cwd(), 'fanda-app/src/pages')
  const offenders = collectScssFiles(pagesDir).flatMap((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8')
    const relativePath = path.relative(process.cwd(), filePath)
    const blocks = source.match(/[^{}]+\{[^{}]*\}/g) || []

    return blocks.flatMap((block) => {
      if (block.includes('position: fixed') && /inset:\s*0\b/.test(block)) {
        const selector = block.split('{')[0].trim()
        return [`${relativePath}: ${selector} uses fixed inset: 0`]
      }
      return []
    })
  })

  assert.deepEqual(offenders, [])
})

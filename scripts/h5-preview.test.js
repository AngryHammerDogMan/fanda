const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

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

test('H5 tabbar remains visible inside the mobile preview shell', () => {
  const appScss = fs.readFileSync(path.join(process.cwd(), 'fanda-app/src/app.scss'), 'utf8')

  assert.match(appScss, /body\s*>\s*#container\.taro-tabbar__container\s*\{[\s\S]*height:\s*100vh/)
  assert.match(appScss, /body\s*>\s*#container\.taro-tabbar__container\s*>\s*\.taro-tabbar__panel\s*\{[\s\S]*min-height:\s*0/)
  assert.match(appScss, /body\s*>\s*#container\.taro-tabbar__container\s*>\s*taro-tabbar\s*\{[\s\S]*display:\s*block/)
  assert.match(appScss, /body\s*>\s*#container\.taro-tabbar__container\s*>\s*taro-tabbar\s*\{[\s\S]*flex:\s*0 0 50px/)
  assert.doesNotMatch(appScss, /(^|\n)#app\s*\{[^}]*overflow:\s*hidden/)
})

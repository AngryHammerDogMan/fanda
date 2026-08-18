module.exports = {
  // Babel 使用 Taro 预设处理 React + TypeScript 源码，具体平台差异由 Taro 构建器接管。
  presets: [
    ['taro', {
      // framework/ts 字段与项目模板保持一致，声明 React 运行时和 TS 编译输入。
      framework: 'react',
      ts: true
    }]
  ]
}

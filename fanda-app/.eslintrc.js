module.exports = {
  // ESLint 根配置：继承 Taro React 规则，避免向上查找父目录配置。
  root: true,
  extends: ['taro/react'],
  rules: {
    // React 18 + Taro JSX 转换不需要显式 import React。
    'react/jsx-uses-react': 'off',
    'react/react-in-jsx-scope': 'off',
  },
  settings: {
    'import/resolver': {
      alias: {
        // 与 config/index.ts 的 @ -> src 别名保持一致，保证 lint 能解析业务导入。
        map: [['@', './src']],
        extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      },
    },
  },
}

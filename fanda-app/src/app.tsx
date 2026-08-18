import { PropsWithChildren } from 'react'
import './app.scss'

// Taro 根组件：不持有业务状态，仅作为全局样式和页面 children 的挂载容器。
function App({ children }: PropsWithChildren<{}>) {
  return children
}

export default App

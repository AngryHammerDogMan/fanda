// 最新请求标记器：用于列表搜索/切换餐桌等场景，避免旧请求覆盖新结果。
export class LatestRequest {
  private requestId = 0

  start(): number {
    // 每次发起请求递增编号，调用方保存返回值用于后续比对。
    this.requestId += 1
    return this.requestId
  }

  isLatest(requestId: number): boolean {
    // 只有最后一次请求的编号才允许落库到页面状态。
    return requestId === this.requestId
  }
}

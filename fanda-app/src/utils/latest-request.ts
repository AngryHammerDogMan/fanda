export class LatestRequest {
  private requestId = 0

  start(): number {
    this.requestId += 1
    return this.requestId
  }

  isLatest(requestId: number): boolean {
    return requestId === this.requestId
  }
}

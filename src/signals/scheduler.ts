// Host scheduling primitive, vendored from React's Scheduler so the coarse
// tier can time-slice a large burst of deferred-graph builds / notifications
// with the same, proven semantics.
// Source: react/packages/scheduler/src/forks/Scheduler.js (line refs below).
//
// We copy only what a chunked pass needs — a macrotask scheduler plus a
// `shouldYield()` deadline — not the priority min-heap.
//
// DEVIATION FROM REACT (improvement): React yields early, before the 5ms
// frame budget, when it knows a paint is pending (`needsPaint`, set by its own
// commit phase — a signal a library doesn't have). We reproduce that early
// yield for the one signal a library does have: `navigator.scheduling
// .isInputPending()`, so an in-progress pass releases the main thread the
// instant the user interacts.

// Scheduler.js:11 — frameYieldMs
const frameInterval = 5

// After blocking this long we yield even while input keeps arriving, so a
// burst of input can't starve the pass indefinitely.
const maxYieldInterval = 300

let getCurrentTime: () => number
if (typeof performance === 'object' && typeof performance.now === 'function') {
  const localPerformance = performance
  getCurrentTime = () => localPerformance.now()
} else {
  const localDate = Date
  const initialTime = localDate.now()
  getCurrentTime = () => localDate.now() - initialTime
}

export { getCurrentTime }

type Scheduling = {
  isInputPending?: (options?: { includeContinuous?: boolean }) => boolean
}
const scheduling: Scheduling | undefined =
  typeof navigator !== 'undefined'
    ? (navigator as unknown as { scheduling?: Scheduling }).scheduling
    : undefined
const isInputPending =
  scheduling && typeof scheduling.isInputPending === 'function'
    ? scheduling.isInputPending.bind(scheduling)
    : null
const continuousOptions = { includeContinuous: true }

let startTime = -1
let needsPaint = false

export function requestPaint(): void {
  needsPaint = true
}

// Scheduler.js:459-472 — shouldYieldToHost, extended with the isInputPending
// early-yield described above.
export function shouldYield(): boolean {
  if (needsPaint) {
    return true
  }
  const timeElapsed = getCurrentTime() - startTime
  if (timeElapsed < frameInterval) {
    if (
      isInputPending !== null &&
      timeElapsed < maxYieldInterval &&
      isInputPending(continuousOptions)
    ) {
      return true
    }
    return false
  }
  return true
}

// Macrotask transport. Scheduler.js:530-561 prefers a single reused
// MessageChannel (avoids setTimeout's 4ms clamp), then setTimeout. `startTime`
// is reset before each callback so `shouldYield()` measures the block length
// of this chunk (Scheduler.js:504-507).
let queue: Array<() => void> = []
let channel: MessageChannel | undefined

function flush() {
  const pending = queue
  queue = []
  for (let i = 0; i < pending.length; i++) {
    needsPaint = false
    startTime = getCurrentTime()
    pending[i]()
  }
}

export function scheduleCallback(callback: () => void): void {
  queue.push(callback)
  if (queue.length > 1) return

  if (typeof MessageChannel !== 'undefined') {
    if (!channel) {
      channel = new MessageChannel()
      channel.port1.onmessage = flush
    }
    channel.port2.postMessage(null)
  } else {
    setTimeout(flush, 0)
  }
}

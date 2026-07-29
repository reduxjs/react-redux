/**
 * Evaluation-scoped finalization queue for the 'registry' untrack strategy.
 *
 * Port of Immer/Mutative's finalization-callback idea: at the points where
 * the LIBRARY creates proxy-bearing containers (filter/slice interceptor
 * results), register the container so untrack can finalize it directly,
 * instead of discovering it by walking the selector result.
 *
 * Standalone module with no imports: arrayMethodOverrides (registration
 * side) and untrack (drain side) both import it, and trackingProxy <->
 * arrayMethodOverrides already form an import cycle we must not extend.
 *
 * The queue is null unless a registry-strategy evaluation is active, so
 * registration is a no-op for the other strategies.
 */

let queue: object[] | null = null

export function beginEvaluationQueue(): void {
  queue = []
}

export function clearEvaluationQueue(): void {
  queue = null
}

/**
 * Record a library-created container holding tracking proxies (e.g. a
 * filter() result array). No-op unless a registry-strategy evaluation
 * is active.
 */
export function registerEscapeCandidate(container: object): void {
  queue?.push(container)
}

/** Take the current queue contents, leaving an empty active queue. */
export function drainEvaluationQueue(): object[] {
  if (queue === null || queue.length === 0) return []
  const drained = queue
  queue = []
  return drained
}

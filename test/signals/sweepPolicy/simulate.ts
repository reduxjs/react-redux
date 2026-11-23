import type { SweepPolicyFactory } from '../../../src/signals/sweepPolicy'

/**
 * One registry event during a dispatch. `release`: the path lost its last
 * signal with `weight` tracked paths below it. `read`: the path was
 * registered again.
 */
export type TraceEvent =
  | { dispatch: number; kind: 'release'; path: string; weight: number }
  | { dispatch: number; kind: 'read'; path: string }

export interface Trace {
  /** Dispatches in the trace; events use 0 to `dispatches - 1`. */
  dispatches: number
  /** Milliseconds between dispatches. */
  msPerDispatch: number
  events: readonly TraceEvent[]
}

export interface Metrics {
  /** Paths read again after they were swept. */
  rereads: number
  /** Summed weight of those reads: the paths re-registered from scratch. */
  rereadWeight: number
  /** Held weight summed over every dispatch: memory kept for nothing. */
  idleWeightDispatches: number
  peakHeldWeight: number
  /** Largest `policy.size()`, including any history the policy keeps. */
  peakSize: number
  /** Longest wait from release to sweep, in dispatches. */
  maxSweepDelay: number
  /** Paths still held after the trace plus the idle tail. */
  heldAtEnd: number
}

/** Idle dispatches run after the trace so slow policies can finish. */
export const IDLE_TAIL = 1000

interface Held {
  weight: number
  at: number
}

/**
 * Replays `trace` against a fresh policy the way the registry drives it:
 * each dispatch ticks the policy first, then applies that dispatch's
 * events.
 */
export function simulate(factory: SweepPolicyFactory, trace: Trace): Metrics {
  const policy = factory()
  const held = new Map<string, Held>()
  const swept = new Map<string, number>()
  const byDispatch: TraceEvent[][] = []
  for (const event of trace.events) {
    ;(byDispatch[event.dispatch] ??= []).push(event)
  }

  const metrics: Metrics = {
    rereads: 0,
    rereadWeight: 0,
    idleWeightDispatches: 0,
    peakHeldWeight: 0,
    peakSize: 0,
    maxSweepDelay: 0,
    heldAtEnd: 0,
  }

  const total = trace.dispatches + IDLE_TAIL
  for (let dispatch = 0; dispatch < total; dispatch++) {
    const now = dispatch * trace.msPerDispatch
    for (const path of policy.tick(now)) {
      const entry = held.get(path)
      if (entry === undefined) continue
      held.delete(path)
      swept.set(path, entry.weight)
      metrics.maxSweepDelay = Math.max(
        metrics.maxSweepDelay,
        dispatch - entry.at,
      )
    }

    for (const event of byDispatch[dispatch] ?? []) {
      if (event.kind === 'release') {
        held.set(event.path, { weight: event.weight, at: dispatch })
        swept.delete(event.path)
        policy.released(event.path, event.weight, now)
      } else {
        const weight = swept.get(event.path)
        if (weight !== undefined) {
          swept.delete(event.path)
          metrics.rereads++
          metrics.rereadWeight += weight
        }
        held.delete(event.path)
        policy.read(event.path, now)
      }
    }

    let heldWeight = 0
    for (const entry of held.values()) heldWeight += entry.weight
    metrics.idleWeightDispatches += heldWeight
    metrics.peakHeldWeight = Math.max(metrics.peakHeldWeight, heldWeight)
    metrics.peakSize = Math.max(metrics.peakSize, policy.size())
  }

  metrics.heldAtEnd = held.size
  return metrics
}

/** Small seeded generator so traces are the same on every run. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Picks a value from `[value, weight]` pairs. */
export function pickWeighted(
  random: () => number,
  table: readonly (readonly [number, number])[],
): number {
  let total = 0
  for (const [, weight] of table) total += weight
  let roll = random() * total
  for (const [value, weight] of table) {
    roll -= weight
    if (roll < 0) return value
  }
  return table[table.length - 1][0]
}

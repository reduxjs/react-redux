import { pickWeighted, seededRandom } from './simulate'
import type { Metrics, Trace, TraceEvent } from './simulate'

export interface Scenario {
  name: string
  /** What happens in the app, in one or two sentences. */
  description: string
  trace: Trace
  /** Returns the intended limits this run breaks, empty when it passes. */
  check(metrics: Metrics, trace: Trace): string[]
}

function limit(
  broken: string[],
  name: keyof Metrics,
  metrics: Metrics,
  max: number,
): void {
  if (metrics[name] > max) broken.push(`${name} ${metrics[name]} > ${max}`)
}

/** Releases of paths that the trace reads again at some point. */
function releaseCount(trace: Trace): number {
  const reread = new Set(
    trace.events.filter((e) => e.kind === 'read').map((e) => e.path),
  )
  return trace.events.filter((e) => e.kind === 'release' && reread.has(e.path))
    .length
}

/**
 * Gaps between a dependency leaving one component and the next read,
 * measured on the derived-selectors benchmark (dispatches: count), plus a
 * thin tail out to 15.
 */
const MOVE_GAPS = [
  [1, 44],
  [2, 52],
  [3, 30],
  [5, 10],
  [8, 4],
  [12, 3],
  [15, 2],
] as const

/**
 * Memoized selectors shared between components move a collection
 * dependency around: only the component whose computed reruns the input
 * selector reads the collection, so it is released and read again a few
 * dispatches later. Rereads cost a full re-registration of the
 * collection's element paths.
 */
function dependencyMoves(): Scenario {
  const random = seededRandom(1)
  const paths = [
    ['comments.entities', 1000],
    ['comments.ids', 1000],
    ['posts.entities', 500],
    ['posts.ids', 500],
  ] as const
  const events = releaseAndReread(random, paths, 300, () =>
    pickWeighted(random, MOVE_GAPS),
  )
  const trace = { dispatches: 300, msPerDispatch: 16, events }
  return {
    name: 'dependency moves between components',
    description:
      'Four collections are released and read again 1-15 dispatches later.',
    trace,
    check(metrics) {
      const broken: string[] = []
      limit(broken, 'rereads', metrics, Math.floor(releaseCount(trace) * 0.02))
      limit(broken, 'heldAtEnd', metrics, 0)
      return broken
    },
  }
}

/**
 * A route or tab unmounts and never comes back. The held paths should go
 * within a bounded number of dispatches.
 */
function unmountForGood(): Scenario {
  const random = seededRandom(3)
  const events: TraceEvent[] = []
  for (let i = 0; i < 50; i++) {
    events.push({
      dispatch: 10,
      kind: 'release',
      path: `view.items.${i}`,
      weight: 20 + Math.floor(random() * 480),
    })
  }
  const trace = { dispatches: 300, msPerDispatch: 16, events }
  return {
    name: 'unmount for good',
    description: 'Fifty paths are released at once and never read again.',
    trace,
    check(metrics) {
      const broken: string[] = []
      limit(broken, 'rereads', metrics, 0)
      limit(broken, 'maxSweepDelay', metrics, 64)
      limit(broken, 'heldAtEnd', metrics, 0)
      return broken
    },
  }
}

/** Components read their paths every dispatch and nothing is released. */
function steadyState(): Scenario {
  const events: TraceEvent[] = []
  for (let dispatch = 0; dispatch < 300; dispatch++) {
    events.push({ dispatch, kind: 'read', path: `feed.${dispatch}` })
  }
  const trace = { dispatches: 300, msPerDispatch: 16, events }
  return {
    name: 'steady state',
    description: 'New paths are registered every dispatch; none is released.',
    trace,
    check(metrics) {
      const broken: string[] = []
      limit(broken, 'rereads', metrics, 0)
      limit(broken, 'peakHeldWeight', metrics, 0)
      limit(broken, 'peakSize', metrics, 0)
      return broken
    },
  }
}

/**
 * Each path is released, read again `nextGap()` dispatches later, then
 * stays live for 1-8 dispatches before the next release.
 */
function releaseAndReread(
  random: () => number,
  paths: readonly (readonly [string, number])[],
  dispatches: number,
  nextGap: () => number,
): TraceEvent[] {
  const events: TraceEvent[] = []
  for (const [path, weight] of paths) {
    let dispatch = Math.floor(random() * 10)
    while (dispatch < dispatches) {
      events.push({ dispatch, kind: 'release', path, weight })
      dispatch += nextGap()
      if (dispatch >= dispatches) break
      events.push({ dispatch, kind: 'read', path })
      dispatch += 1 + Math.floor(random() * 8)
    }
  }
  return events
}

/**
 * Tabs or routes that unmount and come back after 50-200 dispatches.
 * Re-registering on return costs about what the first mount did, so
 * rereads are allowed; the limit is on how long memory is held.
 */
function viewToggle(): Scenario {
  const random = seededRandom(2)
  const paths: [string, number][] = []
  for (let i = 0; i < 10; i++) {
    paths.push([`tabs.panel${i}`, 100 + Math.floor(random() * 1900)])
  }
  const events = releaseAndReread(
    random,
    paths,
    2000,
    () => 50 + Math.floor(random() * 150),
  )
  const trace = { dispatches: 2000, msPerDispatch: 100, events }
  return {
    name: 'view toggle',
    description:
      'Ten panels are released and read again 50-200 dispatches later.',
    trace,
    check(metrics) {
      const broken: string[] = []
      limit(broken, 'maxSweepDelay', metrics, 256)
      limit(broken, 'heldAtEnd', metrics, 0)
      return broken
    },
  }
}

/**
 * The dependency moves of the first scenario under a stream that
 * dispatches every millisecond: a read 10-60 ms after the release is
 * 10-60 dispatches later.
 */
function highRateFeed(): Scenario {
  const random = seededRandom(4)
  const events = releaseAndReread(
    random,
    [
      ['ticks.entities', 2000],
      ['ticks.ids', 2000],
    ],
    3000,
    () => 10 + Math.floor(random() * 50),
  )
  const trace = { dispatches: 3000, msPerDispatch: 1, events }
  return {
    name: 'high-rate feed',
    description:
      'Two collections move between components under 1 ms dispatches.',
    trace,
    check(metrics) {
      const broken: string[] = []
      limit(broken, 'rereads', metrics, Math.floor(releaseCount(trace) * 0.02))
      limit(broken, 'heldAtEnd', metrics, 0)
      return broken
    },
  }
}

/** Entities are deleted and their paths never come back. */
function deletedEntities(): Scenario {
  const events: TraceEvent[] = []
  let id = 0
  for (let dispatch = 0; dispatch < 100; dispatch++) {
    for (let i = 0; i < 20; i++) {
      events.push({
        dispatch,
        kind: 'release',
        path: `todos.entities.${id++}`,
        weight: 5,
      })
    }
  }
  const trace = { dispatches: 300, msPerDispatch: 16, events }
  return {
    name: 'deleted entities',
    description:
      'Twenty entity paths are released every dispatch for 100 dispatches.',
    trace,
    check(metrics) {
      const broken: string[] = []
      limit(broken, 'maxSweepDelay', metrics, 64)
      limit(broken, 'peakSize', metrics, 2000)
      limit(broken, 'heldAtEnd', metrics, 0)
      return broken
    },
  }
}

/**
 * Parameterized selectors (search results, per-query caches) release a
 * path that is never used again on every dispatch. A policy that keeps
 * history per path must not grow without bound.
 */
function manyTransientPaths(): Scenario {
  const events: TraceEvent[] = []
  for (let dispatch = 0; dispatch < 2000; dispatch++) {
    for (let i = 0; i < 5; i++) {
      events.push({
        dispatch,
        kind: 'release',
        path: `search.results.q${dispatch}_${i}`,
        weight: 10,
      })
    }
  }
  const trace = { dispatches: 2000, msPerDispatch: 16, events }
  return {
    name: 'many transient paths',
    description: 'Five never-repeated paths are released every dispatch.',
    trace,
    check(metrics) {
      const broken: string[] = []
      limit(broken, 'peakSize', metrics, 500)
      limit(broken, 'heldAtEnd', metrics, 0)
      return broken
    },
  }
}

/**
 * A selector reads one of two subtrees depending on a flag that flips
 * every 2-40 dispatches. The same few paths churn forever, so a policy
 * should learn to keep them.
 */
function flagDependent(): Scenario {
  const random = seededRandom(7)
  const events: TraceEvent[] = []
  const sides = [
    ['settings.compact', 800],
    ['settings.detailed', 800],
  ] as const
  let live = 0
  let dispatch = 0
  while (dispatch < 2000) {
    const [released, weight] = sides[live]
    live = 1 - live
    events.push({ dispatch, kind: 'release', path: released, weight })
    events.push({ dispatch, kind: 'read', path: sides[live][0] })
    dispatch += 2 + Math.floor(random() * 39)
  }
  const trace = { dispatches: 2000, msPerDispatch: 16, events }
  return {
    name: 'flag-dependent selector',
    description: 'Two subtrees swap places every 2-40 dispatches.',
    trace,
    check(metrics) {
      const broken: string[] = []
      limit(broken, 'rereads', metrics, Math.floor(releaseCount(trace) * 0.25))
      limit(broken, 'heldAtEnd', metrics, 0)
      return broken
    },
  }
}

/** Dependency moves, a final unmount and transient paths at once. */
function mixed(): Scenario {
  const parts = [dependencyMoves(), unmountForGood(), manyTransientPaths()]
  const events = parts.flatMap((part) => part.trace.events)
  const trace = {
    dispatches: Math.max(...parts.map((part) => part.trace.dispatches)),
    msPerDispatch: 16,
    events,
  }
  return {
    name: 'mixed',
    description:
      'The dependency-moves, unmount and transient-path traces together.',
    trace,
    check(metrics) {
      const broken: string[] = []
      limit(broken, 'rereads', metrics, Math.floor(releaseCount(trace) * 0.02))
      limit(broken, 'maxSweepDelay', metrics, 64)
      limit(broken, 'peakSize', metrics, 500)
      limit(broken, 'heldAtEnd', metrics, 0)
      return broken
    },
  }
}

export const scenarios: readonly Scenario[] = [
  dependencyMoves(),
  viewToggle(),
  unmountForGood(),
  highRateFeed(),
  deletedEntities(),
  manyTransientPaths(),
  flagDependent(),
  steadyState(),
  mixed(),
]

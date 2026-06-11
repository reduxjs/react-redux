import type { PathSignalRegistry } from './pathSignalRegistry'
import { unwrap } from './trackingProxy'

/**
 * Non-mutating array methods that we override on the tracking proxy.
 *
 * The key optimization: callbacks receive RAW frozen values (no proxy, no signal
 * registration). Only the RESULTS get proxied — so signal dependencies are
 * established only for the elements the selector actually uses.
 *
 * Example: `state.items.find(i => i.id === 42)` scans 1000 raw items (fast),
 * then returns a proxy for the one match (registers signals for that element only).
 *
 * **Whole-array dependency:** Every overridden method registers a signal on the
 * array itself. Because callbacks scan raw (unproxied) elements, individual
 * element changes wouldn't be detected otherwise. The coarse array signal
 * ensures the selector re-runs when ANY element changes. This may over-fire,
 * but the selector's `===` equality check on its result bails out cheaply.
 *
 * Categories:
 * - Subset operations (find, findLast, filter, slice): return proxied elements
 * - Primitive-returning (findIndex, indexOf, some, every, includes, etc.): return as-is
 * - Transform operations (concat, flat): return raw values (new structures, not subsets)
 * - Pass-through (map, forEach, reduce, flatMap): NOT overridden — callbacks need tracking
 */

type SubsetMethod = 'find' | 'findLast' | 'filter' | 'slice'
type PrimitiveMethod =
  | 'findIndex'
  | 'findLastIndex'
  | 'some'
  | 'every'
  | 'indexOf'
  | 'lastIndexOf'
  | 'includes'
  | 'join'
  | 'toString'
  | 'toLocaleString'
type TransformMethod = 'concat' | 'flat'

type OverriddenMethod = SubsetMethod | PrimitiveMethod | TransformMethod

const FIND_METHODS = new Set<OverriddenMethod>(['find', 'findLast'])

const OVERRIDDEN_METHODS = new Set<string>([
  // Subset — return proxied results
  'find',
  'findLast',
  'filter',
  'slice',
  // Primitive-returning
  'findIndex',
  'findLastIndex',
  'some',
  'every',
  'indexOf',
  'lastIndexOf',
  'includes',
  'join',
  'toString',
  'toLocaleString',
  // Transform — return raw values
  'concat',
  'flat',
])

/**
 * Check if a property name is an overridden array method.
 * @param prop - The property name to check
 * @returns Whether the property is an overridden array method
 */
export function isOverriddenArrayMethod(prop: string): boolean {
  return OVERRIDDEN_METHODS.has(prop)
}

function normalizeSliceIndex(index: number, length: number): number {
  if (index < 0) {
    return Math.max(length + index, 0)
  }
  return Math.min(index, length)
}

/**
 * Create an interceptor for an array method that operates on the raw frozen
 * array, bypassing per-element proxy creation. Only results that the caller
 * will actually use get wrapped in tracking proxies.
 *
 * Registers a coarse dependency on the array itself so that changes to ANY
 * element (even ones the callback scanned but didn't match) trigger re-evaluation.
 *
 * @param target - The raw frozen array
 * @param proxy - The tracking proxy wrapping this array (used to return proxied elements)
 * @param method - The method name being intercepted
 * @param registry - Signal registry for dependency tracking
 * @param parentPath - Path to this array in the state tree
 * @returns An interceptor function that delegates to the raw array
 */
export function createArrayMethodInterceptor(
  target: readonly unknown[],
  proxy: object,
  method: string,
  registry: PathSignalRegistry,
  parentPath: string,
): (...args: unknown[]) => unknown {
  return function intercepted(...args: unknown[]): unknown {
    const m = method as OverriddenMethod

    // Register a dependency on the array itself. Since callbacks receive
    // raw (unproxied) elements, per-element signals aren't created during
    // the scan. This coarse signal ensures re-evaluation when any element
    // changes. diffArray fires registry.update(parentPath, ...) for every
    // visited array, so this signal will fire on any descendant change.
    registry.getOrCreate(parentPath, target).get()

    // --- Subset operations: scan raw, return proxied results ---

    if (m === 'filter') {
      const predicate = args[0] as (
        value: unknown,
        index: number,
        array: readonly unknown[],
      ) => boolean
      const result: unknown[] = []
      for (let i = 0; i < target.length; i++) {
        if (predicate(target[i], i, target)) {
          // Access through proxy to register signals for matching elements
          result.push((proxy as Record<string, unknown>)[i])
        }
      }
      return result
    }

    if (FIND_METHODS.has(m)) {
      const predicate = args[0] as (
        value: unknown,
        index: number,
        array: readonly unknown[],
      ) => boolean
      const isForward = m === 'find'
      const step = isForward ? 1 : -1
      const start = isForward ? 0 : target.length - 1

      for (let i = start; i >= 0 && i < target.length; i += step) {
        if (predicate(target[i], i, target)) {
          // Return proxied element — registers signals for just this one
          return (proxy as Record<string, unknown>)[i]
        }
      }
      return undefined
    }

    if (m === 'slice') {
      const rawStart = (args[0] as number) ?? 0
      const rawEnd = (args[1] as number) ?? target.length
      const start = normalizeSliceIndex(rawStart, target.length)
      const end = normalizeSliceIndex(rawEnd, target.length)
      const result: unknown[] = []
      for (let i = start; i < end; i++) {
        result.push((proxy as Record<string, unknown>)[i])
      }
      return result
    }

    // --- Identity-comparing methods: unwrap proxy arguments ---

    // indexOf/lastIndexOf/includes compare by === (SameValueZero for includes).
    // If the search argument is a tracking proxy, unwrap it to the raw target
    // so the comparison works against raw array elements.
    if (m === 'includes' || m === 'indexOf' || m === 'lastIndexOf') {
      const unwrappedArgs = args.map((arg, i) =>
        i === 0 ? unwrap(arg) : arg,
      )
      return (target as any)[m](...unwrappedArgs)
    }

    // --- Other primitive and transform operations: call on raw array ---

    return (target as any)[m](...args)
  }
}

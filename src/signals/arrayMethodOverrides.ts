import { throwStateMutationError } from './mutationError'
import type { PathSignalRegistry, StructureKind } from './pathSignalRegistry'
import {
  getElementPathKey,
  getProxyPath,
  getProxyTarget,
  registerRecordingHolder,
  unwrap,
} from './trackingProxy'

/**
 * Non-mutating array methods that we override on the tracking proxy.
 *
 * The key optimization: callbacks scan elements WITHOUT per-element proxy
 * creation or per-element signal registration, and elements that leave
 * the array through a method (find, filter, slice, map's `x => x`) leave
 * as RAW objects with one identity dependency each on the element's path.
 *
 * Example: `state.items.find(i => i.id === 42)` scans 1000 items (fast),
 * then returns the raw match and depends on `items.{id:42}`.
 *
 * **Why raw elements:** state is immutable, so any change inside an
 * element replaces the element and fires its identity signal. Tracking
 * individual fields of an element after it has left the array would be
 * more precise but costs a proxy trap plus a signal registration per
 * read — and elements handed to downstream code (Reselect result
 * functions, `.filter` on the returned array) are typically read
 * wholesale, thousands of reads per evaluation. The identity dependency
 * can over-run the selector (a change to a field it didn't read), never
 * miss an update; the result equality check keeps over-runs from
 * becoming renders. Direct index access (`items[0].name`) still returns
 * a tracking proxy and keeps field-level precision.
 *
 * **Dependency tracking for scans:**
 * - Callback methods (find, filter, some, every, findIndex, ...) pass a
 *   lightweight *scan recorder* proxy to the callback. It records WHICH
 *   properties the callback reads (e.g. `done` in `find(x => x.done)`) and
 *   forwards values from the raw element. After the scan, one *column signal*
 *   per (array, property) pair is registered — e.g. `items.{*}.done`. The
 *   diff fires a column signal when any element's value for that property
 *   changes, or when membership changes. This keeps scans O(N) with O(props)
 *   signals instead of O(N×props).
 * - If the callback reads nested objects, enumerates keys, or elements are
 *   primitives, we fall back to a coarse whole-array version signal (fires
 *   on any descendant change — may over-fire, but the selector's `===`
 *   result check bails out cheaply).
 * - Non-callback methods that depend on all elements (includes, indexOf,
 *   join, concat, slice, ...) always register the coarse array signal.
 *
 * Categories:
 * - Subset operations (find, findLast, filter, slice): return raw elements
 *   with identity dependencies
 * - map: scans through the recorder; results that are elements (own or
 *   from another tracked object) come back raw with identity dependencies
 * - Primitive-returning (findIndex, indexOf, some, every, includes, etc.): return as-is
 * - Transform operations (concat, flat): return raw values (new structures, not subsets)
 * - Pass-through (forEach, reduce, flatMap): NOT overridden — callbacks need tracking
 */

type SubsetMethod = 'find' | 'findLast' | 'filter' | 'slice' | 'map'
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

/** Methods whose element dependencies come from what the callback reads. */
const CALLBACK_METHODS = new Set<OverriddenMethod>([
  'find',
  'findLast',
  'filter',
  'map',
  'findIndex',
  'findLastIndex',
  'some',
  'every',
])

const OVERRIDDEN_METHODS = new Set<string>([
  // Subset — return raw elements with identity dependencies
  'find',
  'findLast',
  'filter',
  'slice',
  'map',
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
 * A reusable recorder for array scan callbacks. One proxy is created per
 * method call (not per element); it reads from `holder.current`, which is
 * swapped to each element as the scan advances.
 */
interface ScanRecorder {
  proxy: object
  holder: { current: unknown }
  /** String property names the callback read on elements. */
  recorded: Set<string>
  /** True when column tracking can't capture the callback's reads
   *  (nested object reads, key enumeration, primitive elements). */
  fallback: boolean
}

function createScanRecorder(): ScanRecorder {
  const holder: { current: unknown } = { current: undefined }
  const recorder: ScanRecorder = {
    proxy: null as unknown as object,
    holder,
    recorded: new Set(),
    fallback: false,
  }

  recorder.proxy = new Proxy({} as Record<PropertyKey, unknown>, {
    get(_obj, prop) {
      const current = holder.current as Record<PropertyKey, unknown>
      if (typeof prop === 'symbol') return current[prop]
      recorder.recorded.add(prop)
      const value = current[prop]
      if (value !== null && typeof value === 'object') {
        // Nested object read — column signals only cover depth-1 property
        // values. Fall back to the coarse array signal for correctness.
        recorder.fallback = true
      }
      return value
    },
    has(_obj, prop) {
      if (typeof prop === 'string') recorder.recorded.add(prop)
      return Reflect.has(holder.current as object, prop)
    },
    ownKeys() {
      recorder.fallback = true
      return Reflect.ownKeys(holder.current as object)
    },
    getOwnPropertyDescriptor(_obj, prop) {
      recorder.fallback = true
      const desc = Object.getOwnPropertyDescriptor(
        holder.current as object,
        prop,
      )
      // Frozen state props are non-configurable; the recorder's dummy
      // target doesn't have them, so report configurable to satisfy
      // proxy invariants.
      return desc ? { ...desc, configurable: true } : desc
    },
    getPrototypeOf() {
      return Object.getPrototypeOf(holder.current as object)
    },
    set(_obj, prop) {
      throwStateMutationError('set', String(prop))
    },
    deleteProperty(_obj, prop) {
      throwStateMutationError('delete', String(prop))
    },
  })

  registerRecordingHolder(recorder.proxy, holder)
  return recorder
}

/**
 * Present an element to a scan callback: objects go through the recorder
 * proxy (so property reads are recorded), primitives pass through raw
 * (and force coarse fallback since column tracking can't cover them).
 * @param recorder - The scan recorder for this method call
 * @param value - The raw element value
 * @returns The value to pass to the user callback
 */
function presentElement(recorder: ScanRecorder, value: unknown): unknown {
  if (value !== null && typeof value === 'object') {
    recorder.holder.current = value
    return recorder.proxy
  }
  recorder.fallback = true
  return value
}

/**
 * Which structural change kinds each (method, outcome) pair depends on.
 *
 * Semantics per method (outcome = did the scan find a match?):
 * - find/matched: first match at position i — appends can't precede it,
 *   removals of earlier elements are non-matching by definition, and
 *   removal of the match itself fires its element signals via prune.
 *   Only inserts/reorders before the match can change the result.
 * - find/missed: a new element anywhere could become the first match.
 * - findLast: appends can also change the result (new last match).
 * - findIndex/matched: like find/matched, but removals shift the index.
 * - findLastIndex/matched: appends and removals both shift the index.
 * - filter: membership of the result changes with any structural change.
 * - some/true: only removal of the witness can flip true→false
 *   (replacements fire remove too). Adds can't flip true.
 * - some/false: a new element could flip false→true.
 * - every/true: a new element could flip true→false.
 * - every/false: only removal of the counterexample can flip false→true.
 *
 * Value changes on elements are covered separately by column signals.
 * Errors in this table must err toward including a kind (over-firing).
 */
const STRUCTURE_DEPS: Record<
  string,
  { matched: readonly StructureKind[]; missed: readonly StructureKind[] }
> = {
  find: {
    matched: ['insertOrReorder'],
    missed: ['append', 'insertOrReorder'],
  },
  findLast: {
    matched: ['append', 'insertOrReorder'],
    missed: ['append', 'insertOrReorder'],
  },
  findIndex: {
    matched: ['insertOrReorder', 'remove'],
    missed: ['append', 'insertOrReorder'],
  },
  findLastIndex: {
    matched: ['append', 'insertOrReorder', 'remove'],
    missed: ['append', 'insertOrReorder'],
  },
  filter: {
    matched: ['append', 'insertOrReorder', 'remove'],
    missed: ['append', 'insertOrReorder', 'remove'],
  },
  map: {
    matched: ['append', 'insertOrReorder', 'remove'],
    missed: ['append', 'insertOrReorder', 'remove'],
  },
  some: {
    matched: ['remove'],
    missed: ['append', 'insertOrReorder'],
  },
  every: {
    // For every, "matched" = returned true (no counterexample found)
    matched: ['append', 'insertOrReorder'],
    // "missed" = returned false (counterexample exists)
    missed: ['remove'],
  },
}

/**
 * After a scan completes, register the reactive dependencies it implies:
 * column signals for each recorded property plus structural signals per
 * the (method, outcome) matrix — or the coarse array signal when column
 * tracking can't capture the callback's behavior.
 * @param recorder - The scan recorder for this method call
 * @param registry - Signal registry for dependency tracking
 * @param parentPath - Path to the array in the state tree
 * @param target - The raw frozen array
 * @param method - The scan method that ran
 * @param matched - Whether the scan found a match (see STRUCTURE_DEPS)
 * @returns void
 */
function finalizeScanDeps(
  recorder: ScanRecorder,
  registry: PathSignalRegistry,
  parentPath: string,
  target: readonly unknown[],
  method: OverriddenMethod,
  matched: boolean,
): void {
  if (recorder.fallback || recorder.recorded.size === 0) {
    registry.getOrCreate(parentPath, target).get()
    return
  }
  for (const prop of recorder.recorded) {
    registry.trackColumn(parentPath, prop).get()
  }
  const kinds = STRUCTURE_DEPS[method]
  if (kinds) {
    const wanted = matched ? kinds.matched : kinds.missed
    for (const kind of wanted) {
      registry.trackStructure(parentPath, kind).get()
    }
  }
}

/**
 * Hand an element of this array to the caller: the raw value, plus an
 * identity dependency on the element's path when it is an object.
 * @param registry - Signal registry for dependency tracking
 * @param parentPath - Path to the array in the state tree
 * @param target - The raw frozen array
 * @param index - Index of the element to emit
 * @returns The raw element
 */
function emitElement(
  registry: PathSignalRegistry,
  parentPath: string,
  target: readonly unknown[],
  index: number,
): unknown {
  const value = target[index]
  if (value !== null && typeof value === 'object') {
    registry
      .getOrCreate(getElementPathKey(registry, parentPath, index, value), value)
      .get()
  }
  return value
}

/**
 * Normalize a value returned from a `map` callback. A tracking proxy from
 * elsewhere in the state tree (`ids.map(id => entities[id])`) comes back
 * raw with an identity dependency on its path, so the caller's downstream
 * reads run on plain objects. Anything else is returned unchanged.
 * @param registry - Signal registry for dependency tracking
 * @param value - The callback's return value
 * @returns The value to place in the mapped array
 */
function emitMappedValue(
  registry: PathSignalRegistry,
  value: unknown,
): unknown {
  if (value === null || typeof value !== 'object') return value
  const raw = getProxyTarget(value)
  if (raw === undefined) return value
  const path = getProxyPath(value)
  if (path !== undefined && path !== '') {
    registry.getOrCreate(path, raw).get()
  }
  return raw
}

/**
 * Create an interceptor for an array method that operates on the raw frozen
 * array, bypassing per-element proxy creation. Elements that leave the
 * array come back raw with identity dependencies (see module comment).
 *
 * @param target - The raw frozen array
 * @param method - The method name being intercepted
 * @param registry - Signal registry for dependency tracking
 * @param parentPath - Path to this array in the state tree
 * @returns An interceptor function that delegates to the raw array
 */
export function createArrayMethodInterceptor(
  target: readonly unknown[],
  method: string,
  registry: PathSignalRegistry,
  parentPath: string,
): (...args: unknown[]) => unknown {
  return function intercepted(...args: unknown[]): unknown {
    const m = method as OverriddenMethod

    // --- Callback-driven scans: record property reads, register column signals ---

    if (CALLBACK_METHODS.has(m)) {
      const callback = args[0] as (
        value: unknown,
        index: number,
        array: readonly unknown[],
      ) => unknown
      const recorder = createScanRecorder()

      let result: unknown
      let matched: boolean

      if (m === 'filter') {
        const matches: unknown[] = []
        for (let i = 0; i < target.length; i++) {
          if (callback(presentElement(recorder, target[i]), i, target)) {
            matches.push(emitElement(registry, parentPath, target, i))
          }
        }
        result = matches
        matched = matches.length > 0
      } else if (m === 'map') {
        const mapped: unknown[] = []
        // The recorder proxy is reused across elements, so a callback
        // that embeds its element in a fresh object (`x => ({ item: x })`)
        // would capture a recorder pointing at whichever element is
        // scanned last. Once a callback returns a fresh object, redo that
        // element and scan the rest with raw elements under the coarse
        // array dependency.
        let rawMode = false
        for (let i = 0; i < target.length; i++) {
          const element = target[i]
          if (!rawMode) {
            const out = callback(presentElement(recorder, element), i, target)
            if (out === recorder.proxy) {
              mapped[i] = emitElement(registry, parentPath, target, i)
              continue
            }
            if (
              out === null ||
              typeof out !== 'object' ||
              getProxyTarget(out) !== undefined
            ) {
              mapped[i] = emitMappedValue(registry, out)
              continue
            }
            rawMode = true
            recorder.fallback = true
          }
          mapped[i] = emitMappedValue(registry, callback(element, i, target))
        }
        result = mapped
        matched = true
      } else if (FIND_METHODS.has(m)) {
        const isForward = m === 'find'
        const step = isForward ? 1 : -1
        const start = isForward ? 0 : target.length - 1
        result = undefined
        for (let i = start; i >= 0 && i < target.length; i += step) {
          if (callback(presentElement(recorder, target[i]), i, target)) {
            result = emitElement(registry, parentPath, target, i)
            break
          }
        }
        matched = result !== undefined
      } else {
        // findIndex / findLastIndex / some / every — primitive results
        result = (target as any)[m](
          (value: unknown, i: number, arr: readonly unknown[]) =>
            callback(presentElement(recorder, value), i, arr),
        )
        if (m === 'findIndex' || m === 'findLastIndex') {
          matched = result !== -1
        } else {
          // some: true = witness found; every: true = no counterexample
          matched = result === true
        }
      }

      finalizeScanDeps(recorder, registry, parentPath, target, m, matched)
      return result
    }

    // --- Non-callback methods depend on all elements: coarse array signal ---
    // diffArray fires registry.update(parentPath, ...) for every visited
    // array, so this signal fires on any descendant change. That's the
    // right granularity: these methods read element identity or content
    // wholesale (includes/indexOf compare refs, join/concat serialize all).
    registry.getOrCreate(parentPath, target).get()

    if (m === 'slice') {
      const rawStart = (args[0] as number) ?? 0
      const rawEnd = (args[1] as number) ?? target.length
      const start = normalizeSliceIndex(rawStart, target.length)
      const end = normalizeSliceIndex(rawEnd, target.length)
      const result: unknown[] = []
      for (let i = start; i < end; i++) {
        result.push(emitElement(registry, parentPath, target, i))
      }
      return result
    }

    // --- Identity-comparing methods: unwrap proxy arguments ---

    // indexOf/lastIndexOf/includes compare by === (SameValueZero for includes).
    // If the search argument is a tracking proxy, unwrap it to the raw target
    // so the comparison works against raw array elements.
    if (m === 'includes' || m === 'indexOf' || m === 'lastIndexOf') {
      const unwrappedArgs = args.map((arg, i) => (i === 0 ? unwrap(arg) : arg))
      return (target as any)[m](...unwrappedArgs)
    }

    // --- Other primitive and transform operations: call on raw array ---

    return (target as any)[m](...args)
  }
}

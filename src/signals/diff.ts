import {
  buildIdentityPath,
  encodePathSegment,
  getKeyValue,
  joinPath,
  keysMetaPath,
} from './arrayKeys'
import type { PathSignalRegistry } from './pathSignalRegistry'
import type { SignalEngine } from './types'
import { isPlainObject } from './objects'

/**
 * Diff a plain object: recurse into changed properties.
 * Separated from the main dispatcher for V8 monomorphic optimization.
 * @param prev - Previous object state
 * @param next - Next object state
 * @param parentPath - Dot-separated path to this object in the state tree
 * @param registry - Signal registry to update
 * @param changedRootKeys - Root call only: collects the raw (unencoded)
 *   keys whose values changed, were added, or were removed. Feeds the
 *   coarse segment index — the ref-compare over root keys happens here
 *   anyway, so collection is a push per *changed* key, not a second pass.
 * @returns void
 */
function diffObject(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  parentPath: string,
  registry: PathSignalRegistry,
  changedRootKeys?: string[],
): void {
  const nextKeys = Object.keys(next)
  const prevKeys = Object.keys(prev)
  let keysChanged = prevKeys.length !== nextKeys.length

  if (parentPath) {
    registry.update(parentPath, next)
  }

  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i]

    // Same length and the same key at every position means the same key
    // set in the same order. Any mismatch is an added key or a reorder,
    // and both change what Object.keys and spread return.
    if (!keysChanged && key !== prevKeys[i]) {
      keysChanged = true
    }

    // Hoist reference equality check before path construction.
    // Structural sharing means most keys are unchanged — skip early.
    // The self-inequality test catches NaN (NaN !== NaN would otherwise
    // descend and re-fire the leaf signal on every dispatch).
    const prevVal = prev[key]
    const nextVal = next[key]
    if (prevVal === nextVal || (prevVal !== prevVal && nextVal !== nextVal)) {
      // Added key whose value is `undefined`: ref-equal to the missing
      // read (undefined === undefined), but `in` / hasOwnProperty gates
      // on this key still flipped — the root collector must see it. The
      // extra `in` check only runs for undefined-valued keys.
      if (
        changedRootKeys !== undefined &&
        nextVal === undefined &&
        !(key in prev)
      ) {
        changedRootKeys.push(key)
      }
      continue
    }

    if (changedRootKeys !== undefined) {
      changedRootKeys.push(key)
    }

    // Keys are encoded to match the proxy's pathKey construction —
    // reserved path characters in state keys (dots, braces, '@') are
    // %-escaped on both sides.
    const childPath = joinPath(parentPath, encodePathSegment(key))
    if (registry.hasPrefix(childPath)) {
      diffAndUpdateSignals(prevVal, nextVal, childPath, registry)
    }
  }

  if (keysChanged) {
    registry.update(keysMetaPath(parentPath), nextKeys)

    for (let i = 0; i < prevKeys.length; i++) {
      if (!(prevKeys[i] in next)) {
        if (changedRootKeys !== undefined) {
          changedRootKeys.push(prevKeys[i])
        }
        registry.prune(joinPath(parentPath, encodePathSegment(prevKeys[i])))
      }
    }
  }
}

/**
 * Diff an array: detect key field and dispatch to identity or index based.
 * Separated from the main dispatcher for V8 monomorphic optimization.
 * @param prev - Previous array state
 * @param next - Next array state
 * @param parentPath - Dot-separated path to this array in the state tree
 * @param registry - Signal registry to update
 * @returns void
 */
function diffArray(
  prev: unknown[],
  next: unknown[],
  parentPath: string,
  registry: PathSignalRegistry,
): void {
  if (parentPath) {
    registry.update(parentPath, next)
  }

  if (prev.length !== next.length) {
    registry.update(keysMetaPath(parentPath), next)
    registry.update(joinPath(parentPath, 'length'), next.length)
  }

  const keyField = registry.keyFieldFor(parentPath, next[0])
  if (keyField !== undefined) {
    diffArrayByKey(prev, next, parentPath, registry, keyField)
  } else {
    diffArrayByIndex(prev, next, parentPath, registry)
  }
}

/**
 * Compare one surviving element's tracked column properties and fire
 * column signals for any that changed. Non-object elements fire all
 * remaining columns (can't shallow-compare — err toward firing).
 * @param prevItem - Previous element value
 * @param nextItem - Next element value
 * @param registry - Signal registry to update
 * @param cols - Tracked columns for this array: column path → property
 * @param fired - Column paths already fired (dedup across elements)
 * @returns void
 */
function bumpColumnsForElement(
  prevItem: unknown,
  nextItem: unknown,
  registry: PathSignalRegistry,
  cols: Map<string, string>,
  fired: Set<string>,
): void {
  if (
    prevItem !== null &&
    nextItem !== null &&
    typeof prevItem === 'object' &&
    typeof nextItem === 'object'
  ) {
    for (const [path, prop] of cols) {
      if (fired.has(path)) continue
      if (
        (prevItem as Record<string, unknown>)[prop] !==
        (nextItem as Record<string, unknown>)[prop]
      ) {
        registry.bumpColumn(path)
        fired.add(path)
      }
    }
  } else {
    // Non-object element changed — can't shallow-compare, fire everything
    for (const path of cols.keys()) {
      if (!fired.has(path)) {
        registry.bumpColumn(path)
        fired.add(path)
      }
    }
  }
}

/**
 * Walk prev and next state trees, updating path signals for changed values.
 * Only visits subtrees that have tracked signals (registered paths).
 * Exploits Immer's structural sharing: `prev === next` skips entire subtrees.
 *
 * Dispatches to monomorphic helpers (diffObject/diffArray) for V8 optimization.
 * @param prev - Previous state value
 * @param next - Next state value
 * @param parentPath - Dot-separated path to this node in the state tree
 * @param registry - Signal registry to update
 * @returns void
 */
export function diffAndUpdateSignals(
  prev: unknown,
  next: unknown,
  parentPath: string,
  registry: PathSignalRegistry,
): void {
  // Structural sharing: identical references mean nothing changed.
  // The self-inequality test catches NaN (NaN !== NaN would otherwise
  // fall through to the leaf branch and re-fire on every dispatch).
  if (prev === next || (prev !== prev && next !== next)) return

  // Both plain objects: recurse into properties
  if (isPlainObject(prev) && isPlainObject(next)) {
    diffObject(prev, next, parentPath, registry)
    return
  }

  // Both arrays
  if (Array.isArray(prev) && Array.isArray(next)) {
    diffArray(prev, next, parentPath, registry)
    return
  }

  // Leaf value change: primitive, non-plain object (Date, Map, class
  // instance — tracked by reference only), or type mismatch
  // (object→primitive, array→object, ...)
  if (parentPath) {
    registry.update(parentPath, next)
  }

  // If prev was an object/array, we did NOT recurse — any child signals
  // registered under this path would go silently stale.
  if (prev !== null && typeof prev === 'object') {
    if (next === null || typeof next !== 'object') {
      // object → primitive: the path itself is no longer an object; drop
      // the whole subtree (fires child signals before removal)
      registry.prune(parentPath)
    } else {
      // object → object we can't diff into (class instance replaced,
      // array↔object type change): keep this path's just-updated signal
      // but fire-and-drop the children
      registry.pruneChildren(parentPath)
    }
  }
}

/**
 * Identity-based array diffing. Matches elements by their key field value.
 * When an entity moves indices but content is unchanged (prev === next via
 * structural sharing), the identity-based signal path stays the same and
 * no signal updates are needed.
 * @param prev - Previous array state
 * @param next - Next array state
 * @param parentPath - Dot-separated path to this array in the state tree
 * @param registry - Signal registry to update
 * @param keyField - Property that identifies elements
 * @returns void
 */
function diffArrayByKey(
  prev: unknown[],
  next: unknown[],
  parentPath: string,
  registry: PathSignalRegistry,
  keyField: string,
): void {
  const rec = registry.getArrayRecord(parentPath)
  const cols = rec?.columns
  const fired = cols ? new Set<string>() : null
  const structs = rec?.structures

  // Fast path: same-length arrays with no key shifts.
  // Only touch changed elements. Pure value changes — no structural bumps needed.
  if (prev.length === next.length) {
    let usedFastPath = true
    for (let i = 0; i < next.length; i++) {
      if (prev[i] === next[i]) continue // structural sharing: skip (most elements)

      // Different ref — verify same key at same index
      const prevKv = getKeyValue(prev[i], keyField)
      const nextKv = getKeyValue(next[i], keyField)
      if (prevKv === undefined || nextKv === undefined || prevKv !== nextKv) {
        usedFastPath = false
        break
      }

      const identityPath = buildIdentityPath(parentPath, keyField, nextKv)
      if (registry.hasPrefix(identityPath)) {
        diffAndUpdateSignals(prev[i], next[i], identityPath, registry)
      }
      if (fired && cols) {
        bumpColumnsForElement(prev[i], next[i], registry, cols, fired)
      }
    }
    if (usedFastPath) {
      return
    }
    // Fast path failed partway — fall through to full identity diff below.
  }

  // Full identity-based diff: lengths differ or keys shifted positions.
  // Forward scan: skip shared prefix where prev[i] === next[i].
  // This makes pure append/prepend-from-end nearly free.
  const minLen = Math.min(prev.length, next.length)
  let startIdx = 0
  while (startIdx < minLen && prev[startIdx] === next[startIdx]) {
    startIdx++
  }

  // If we skipped the entire overlap and next is longer, it's a pure append.
  // Overlap is identical, so no value changes are possible — membership
  // change is covered by the `append` structural signal alone.
  if (startIdx === minLen && next.length >= prev.length) {
    if (structs && next.length > prev.length) {
      registry.bumpStructure(parentPath, 'append')
    }
    for (let i = startIdx; i < next.length; i++) {
      const nextItem = next[i]
      const kv = getKeyValue(nextItem, keyField)
      const elementPath =
        kv !== undefined
          ? buildIdentityPath(parentPath, keyField, kv)
          : joinPath(parentPath, i)
      if (registry.hasPrefix(elementPath)) {
        diffAndUpdateSignals(undefined, nextItem, elementPath, registry)
      }
    }
    return
  }

  // If we skipped the entire overlap and prev is longer, it's a pure truncation.
  if (startIdx === minLen && prev.length > next.length) {
    if (structs) {
      registry.bumpStructure(parentPath, 'remove')
    }
    for (let i = startIdx; i < prev.length; i++) {
      const kv = getKeyValue(prev[i], keyField)
      registry.prune(
        kv !== undefined
          ? buildIdentityPath(parentPath, keyField, kv)
          : joinPath(parentPath, i),
      )
    }
    return
  }

  // General case: match next elements to prev elements by key.
  // Keyless elements (no usable key value) are tracked at index paths.
  const prevByKey = new Map<string | number, unknown>()
  let prevKeylessFrom = -1
  for (let i = 0; i < prev.length; i++) {
    const kv = getKeyValue(prev[i], keyField)
    if (kv !== undefined) prevByKey.set(kv, prev[i])
    else if (prevKeylessFrom === -1 && i >= startIdx) prevKeylessFrom = i
  }

  // Track every prev key seen in next so removed entities get pruned.
  // Removals can happen at ANY relative length — a same-length
  // remove+add (page swap, temp-id → server-id) still removes entities.
  const seenPrevKeys = new Set<string | number>()
  // Mark skipped prefix keys as seen (they can't be removed)
  for (let i = 0; i < startIdx; i++) {
    const kv = getKeyValue(prev[i], keyField)
    if (kv !== undefined) seenPrevKeys.add(kv)
  }

  // Structural classification state (only maintained when tracked):
  // - addedAny: any element whose key wasn't in prev
  // - middleInsert: an added element appeared before a surviving element
  // - reorder: survivors are not a subsequence of prev's order
  //   (checked with a forward-only pointer into prev)
  // - survivorCount: next elements (from startIdx) whose key existed in prev
  // - sawUnkeyed: element without a key — can't classify, fire everything
  let addedAny = false
  let middleInsert = false
  let reorder = false
  let survivorCount = 0
  let sawUnkeyed = false
  let pi = startIdx

  for (let i = startIdx; i < next.length; i++) {
    const nextItem = next[i]
    const kv = getKeyValue(nextItem, keyField)

    if (kv === undefined) {
      sawUnkeyed = true
      const childPath = joinPath(parentPath, i)
      const prevItem = i < prev.length ? prev[i] : undefined
      if (prevItem !== nextItem) {
        if (registry.hasPrefix(childPath)) {
          // Index-path signals only describe a keyless previous element.
          const tracked =
            getKeyValue(prevItem, keyField) === undefined ? prevItem : undefined
          diffAndUpdateSignals(tracked, nextItem, childPath, registry)
        }
        if (fired && cols) {
          bumpColumnsForElement(prevItem, nextItem, registry, cols, fired)
        }
      }
      continue
    }

    const prevItem = prevByKey.get(kv)
    const isSurvivor = prevItem !== undefined

    if (isSurvivor) {
      survivorCount++
      if (addedAny) middleInsert = true
      if (structs && !reorder) {
        // Subsequence check: survivors must appear in prev in the same
        // relative order. Advance pointer to this key; if we run off the
        // end, order changed.
        while (pi < prev.length && getKeyValue(prev[pi], keyField) !== kv) {
          pi++
        }
        if (pi >= prev.length) {
          reorder = true
        } else {
          pi++
        }
      }
    } else {
      addedAny = true
    }

    if (prevItem === nextItem) {
      seenPrevKeys.add(kv)
      continue
    }

    seenPrevKeys.add(kv)

    const identityPath = buildIdentityPath(parentPath, keyField, kv)

    if (isSurvivor) {
      if (registry.hasPrefix(identityPath)) {
        diffAndUpdateSignals(prevItem, nextItem, identityPath, registry)
      }
      if (fired && cols) {
        bumpColumnsForElement(prevItem, nextItem, registry, cols, fired)
      }
    } else {
      if (registry.hasPrefix(identityPath)) {
        diffAndUpdateSignals(undefined, nextItem, identityPath, registry)
      }
    }
  }

  for (const kv of prevByKey.keys()) {
    if (!seenPrevKeys.has(kv)) {
      const identityPath = buildIdentityPath(parentPath, keyField, kv)
      registry.prune(identityPath)
    }
  }

  // A keyless previous element whose index now holds a keyed element, or
  // no element, leaves its index path behind.
  if (prevKeylessFrom !== -1) {
    for (let i = prevKeylessFrom; i < prev.length; i++) {
      if (
        prev[i] !== next[i] &&
        getKeyValue(prev[i], keyField) === undefined &&
        (i >= next.length || getKeyValue(next[i], keyField) !== undefined)
      ) {
        registry.prune(joinPath(parentPath, i))
      }
    }
  }

  if (structs) {
    // Removals: prev suffix elements not matched by a surviving key.
    // Over-counts in rare duplicate-key cases — errs toward firing.
    const removedAny = prev.length - startIdx > survivorCount
    if (sawUnkeyed) {
      registry.bumpStructure(parentPath, 'append')
      registry.bumpStructure(parentPath, 'insertOrReorder')
      registry.bumpStructure(parentPath, 'remove')
    } else {
      if (addedAny) registry.bumpStructure(parentPath, 'append')
      if (middleInsert || reorder) {
        registry.bumpStructure(parentPath, 'insertOrReorder')
      }
      if (removedAny) registry.bumpStructure(parentPath, 'remove')
    }
  }
}

/**
 * Index-based array diffing (original algorithm).
 * Used for primitive arrays or arrays without a detectable key field.
 * @param prev - Previous array state
 * @param next - Next array state
 * @param parentPath - Dot-separated path to this array in the state tree
 * @param registry - Signal registry to update
 * @returns void
 */
function diffArrayByIndex(
  prev: unknown[],
  next: unknown[],
  parentPath: string,
  registry: PathSignalRegistry,
): void {
  const rec = registry.getArrayRecord(parentPath)
  const cols = rec?.columns
  const fired = cols ? new Set<string>() : null

  if (prev.length !== next.length) {
    // Unkeyed length change: elements can't be aligned between prev and
    // next, so we can't classify the change — fire all structural kinds
    // and all columns (err toward firing).
    if (rec?.structures) {
      registry.bumpStructure(parentPath, 'append')
      registry.bumpStructure(parentPath, 'insertOrReorder')
      registry.bumpStructure(parentPath, 'remove')
    }
    if (cols) {
      for (const path of cols.keys()) registry.bumpColumn(path)
    }
  }

  const minLen = Math.min(prev.length, next.length)
  for (let i = 0; i < minLen; i++) {
    if (prev[i] !== next[i]) {
      const childPath = joinPath(parentPath, i)
      if (registry.hasPrefix(childPath)) {
        diffAndUpdateSignals(prev[i], next[i], childPath, registry)
      }
      // Same-length: aligned compare per changed index covers value
      // changes AND swaps (both indexes show ref mismatches).
      if (fired && cols && prev.length === next.length) {
        bumpColumnsForElement(prev[i], next[i], registry, cols, fired)
      }
    }
  }
  for (let i = minLen; i < next.length; i++) {
    const childPath = joinPath(parentPath, i)
    if (registry.hasPrefix(childPath)) {
      diffAndUpdateSignals(undefined, next[i], childPath, registry)
    }
  }
  for (let i = next.length; i < prev.length; i++) {
    registry.prune(joinPath(parentPath, i))
  }
}

const NO_CHANGED_KEYS: string[] = []

/**
 * Wrapper that batches all signal updates into a single propagation pass.
 *
 * Returns the raw root keys whose values changed (added / removed /
 * ref-changed) so the SignalProvider can wake coarse-tier subscribers,
 * or `null` when the root wasn't a diffable pair of plain objects (the
 * caller must treat every coarse subscriber as a candidate).
 * @param prev - Previous state
 * @param next - Next state
 * @param registry - Signal registry to update
 * @param engine - Signal engine for batching
 * @returns Changed root keys, or null if the root couldn't be diffed
 */
export function reconcileState(
  prev: unknown,
  next: unknown,
  registry: PathSignalRegistry,
  engine: SignalEngine,
): string[] | null {
  if (prev === next) return NO_CHANGED_KEYS

  if (isPlainObject(prev) && isPlainObject(next)) {
    const changedRootKeys: string[] = []
    engine.batch(() => {
      diffObject(prev, next, '', registry, changedRootKeys)
    })
    return changedRootKeys
  }

  engine.batch(() => {
    diffAndUpdateSignals(prev, next, '', registry)
  })
  return null
}

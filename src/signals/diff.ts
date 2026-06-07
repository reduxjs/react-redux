import {
  buildIdentityPath,
  findKeyField,
  getKeyValue,
} from './arrayKeys'
import type { PathSignalRegistry } from './pathSignalRegistry'
import type { SignalEngine } from './types'

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/**
 * Diff a plain object: recurse into changed properties.
 * Separated from the main dispatcher for V8 monomorphic optimization.
 */
function diffObject(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
  parentPath: string,
  registry: PathSignalRegistry,
): void {
  const nextKeys = Object.keys(next)
  const prevKeys = Object.keys(prev)
  let keysChanged = prevKeys.length !== nextKeys.length

  if (parentPath) {
    registry.update(parentPath, next)
  }

  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i]

    if (!keysChanged && !(key in prev)) {
      keysChanged = true
    }

    // Hoist reference equality check before path construction.
    // Structural sharing means most keys are unchanged — skip early.
    if (prev[key] === next[key]) continue

    const childPath = parentPath ? parentPath + '.' + key : key
    if (registry.hasPrefix(childPath)) {
      diffAndUpdateSignals(prev[key], next[key], childPath, registry)
    }
  }

  if (keysChanged) {
    const keysPath = parentPath ? parentPath + '.@@keys' : '@@keys'
    registry.update(keysPath, nextKeys)

    for (let i = 0; i < prevKeys.length; i++) {
      if (!(prevKeys[i] in next)) {
        const childPath = parentPath
          ? parentPath + '.' + prevKeys[i]
          : prevKeys[i]
        registry.prune(childPath)
      }
    }
  }
}

/**
 * Diff an array: detect key field and dispatch to identity or index based.
 * Separated from the main dispatcher for V8 monomorphic optimization.
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
    const keysPath = parentPath ? parentPath + '.@@keys' : '@@keys'
    registry.update(keysPath, next.length)
    const lengthPath = parentPath ? parentPath + '.length' : 'length'
    registry.update(lengthPath, next.length)
  }

  let meta = registry.getArrayMeta(parentPath)
  if (meta) {
    if (meta.entityMap.size === 0 && prev.length > 0) {
      for (let i = 0; i < prev.length; i++) {
        const kv = getKeyValue(prev[i], meta.keyField)
        if (kv !== undefined) meta.entityMap.set(kv, prev[i])
      }
    }
  } else if (next.length > 0) {
    const keyField = findKeyField(next[0])
    if (keyField) {
      const entityMap = new Map<string | number, unknown>()
      for (let i = 0; i < prev.length; i++) {
        const kv = getKeyValue(prev[i], keyField)
        if (kv !== undefined) entityMap.set(kv, prev[i])
      }
      meta = { keyField, entityMap }
      registry.setArrayMeta(parentPath, meta)
    }
  }

  if (meta) {
    diffArrayByKey(prev, next, parentPath, registry, meta)
  } else {
    diffArrayByIndex(prev, next, parentPath, registry)
  }
}

/**
 * Walk prev and next state trees, updating path signals for changed values.
 * Only visits subtrees that have tracked signals (registered paths).
 * Exploits Immer's structural sharing: `prev === next` skips entire subtrees.
 *
 * Dispatches to monomorphic helpers (diffObject/diffArray) for V8 optimization.
 */
export function diffAndUpdateSignals(
  prev: unknown,
  next: unknown,
  parentPath: string,
  registry: PathSignalRegistry,
): void {
  // Structural sharing: identical references mean nothing changed
  if (prev === next) return

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

  // Leaf value change (primitive, or type mismatch like object→primitive)
  if (parentPath) {
    registry.update(parentPath, next)
  }

  // If prev was an object/array and next is not, prune child signals
  if (
    prev !== null &&
    typeof prev === 'object' &&
    (next === null || typeof next !== 'object')
  ) {
    registry.prune(parentPath)
  }
}

/**
 * Identity-based array diffing. Matches elements by their key field value.
 * When an entity moves indices but content is unchanged (prev === next via
 * structural sharing), the identity-based signal path stays the same and
 * no signal updates are needed.
 */
function diffArrayByKey(
  prev: unknown[],
  next: unknown[],
  parentPath: string,
  registry: PathSignalRegistry,
  meta: import('./arrayKeys').ArrayMeta,
): void {
  const { keyField, entityMap: prevEntityMap } = meta

  // Fast path: same-length arrays with no key shifts.
  // Only touch changed elements. Update entityMap incrementally instead of rebuilding.
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

      // Same key, different content — diff and update entityMap entry
      const identityPath = buildIdentityPath(parentPath, keyField, nextKv)
      if (registry.hasPrefix(identityPath)) {
        diffAndUpdateSignals(prev[i], next[i], identityPath, registry)
      }
      prevEntityMap.set(nextKv, next[i])
    }
    if (usedFastPath) {
      return
    }
    // Fast path failed partway — fall through to full identity diff below.
    // Restore any partially-updated entityMap entries from prev array.
    for (let i = 0; i < prev.length; i++) {
      const kv = getKeyValue(prev[i], keyField)
      if (kv !== undefined) prevEntityMap.set(kv, prev[i])
    }
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
  // No Map needed — just update entityMap for new tail entries.
  if (startIdx === minLen && next.length >= prev.length) {
    for (let i = startIdx; i < next.length; i++) {
      const nextItem = next[i]
      const kv = getKeyValue(nextItem, keyField)
      if (kv !== undefined) {
        prevEntityMap.set(kv, nextItem)
        const identityPath = buildIdentityPath(parentPath, keyField, kv)
        if (registry.hasPrefix(identityPath)) {
          diffAndUpdateSignals(undefined, nextItem, identityPath, registry)
        }
      }
    }
    return
  }

  // If we skipped the entire overlap and prev is longer, it's a pure truncation.
  // Prune the removed tail entries from entityMap.
  if (startIdx === minLen && prev.length > next.length) {
    for (let i = startIdx; i < prev.length; i++) {
      const prevItem = prev[i]
      const kv = getKeyValue(prevItem, keyField)
      if (kv !== undefined) {
        prevEntityMap.delete(kv)
        const identityPath = buildIdentityPath(parentPath, keyField, kv)
        registry.prune(identityPath)
      }
    }
    return
  }

  // General case: build Map only from startIdx onward
  const mayHaveRemovals = next.length < prev.length

  const nextEntityMap = new Map<string | number, unknown>()
  // Carry over skipped prefix entries from prevEntityMap
  for (let i = 0; i < startIdx; i++) {
    const kv = getKeyValue(next[i], keyField)
    if (kv !== undefined) nextEntityMap.set(kv, next[i])
  }

  const seenPrevKeys = mayHaveRemovals ? new Set<string | number>() : null
  // Mark skipped prefix keys as seen (they can't be removed)
  if (seenPrevKeys) {
    for (let i = 0; i < startIdx; i++) {
      const kv = getKeyValue(prev[i], keyField)
      if (kv !== undefined) seenPrevKeys.add(kv)
    }
  }

  for (let i = startIdx; i < next.length; i++) {
    const nextItem = next[i]
    const kv = getKeyValue(nextItem, keyField)

    if (kv === undefined) {
      const childPath = parentPath ? parentPath + '.' + i : String(i)
      if (registry.hasPrefix(childPath)) {
        const prevItem = i < prev.length ? prev[i] : undefined
        if (prevItem !== nextItem) {
          diffAndUpdateSignals(prevItem, nextItem, childPath, registry)
        }
      }
      continue
    }

    nextEntityMap.set(kv, nextItem)
    const prevItem = prevEntityMap.get(kv)

    if (prevItem === nextItem) {
      if (seenPrevKeys) seenPrevKeys.add(kv)
      continue
    }

    if (seenPrevKeys) seenPrevKeys.add(kv)

    const identityPath = buildIdentityPath(parentPath, keyField, kv)

    if (prevItem !== undefined) {
      if (registry.hasPrefix(identityPath)) {
        diffAndUpdateSignals(prevItem, nextItem, identityPath, registry)
      }
    } else {
      if (registry.hasPrefix(identityPath)) {
        diffAndUpdateSignals(undefined, nextItem, identityPath, registry)
      }
    }
  }

  if (seenPrevKeys) {
    for (const [kv] of prevEntityMap) {
      if (!seenPrevKeys.has(kv)) {
        const identityPath = buildIdentityPath(parentPath, keyField, kv)
        registry.prune(identityPath)
      }
    }
  }

  meta.entityMap = nextEntityMap
}

/**
 * Index-based array diffing (original algorithm).
 * Used for primitive arrays or arrays without a detectable key field.
 */
function diffArrayByIndex(
  prev: unknown[],
  next: unknown[],
  parentPath: string,
  registry: PathSignalRegistry,
): void {
  const minLen = Math.min(prev.length, next.length)
  for (let i = 0; i < minLen; i++) {
    if (prev[i] !== next[i]) {
      const childPath = parentPath ? parentPath + '.' + i : String(i)
      if (registry.hasPrefix(childPath)) {
        diffAndUpdateSignals(prev[i], next[i], childPath, registry)
      }
    }
  }
  for (let i = minLen; i < next.length; i++) {
    const childPath = parentPath ? parentPath + '.' + i : String(i)
    if (registry.hasPrefix(childPath)) {
      diffAndUpdateSignals(undefined, next[i], childPath, registry)
    }
  }
  for (let i = next.length; i < prev.length; i++) {
    const childPath = parentPath ? parentPath + '.' + i : String(i)
    registry.prune(childPath)
  }
}

/**
 * Wrapper that batches all signal updates into a single propagation pass.
 */
export function reconcileState(
  prev: unknown,
  next: unknown,
  registry: PathSignalRegistry,
  engine: SignalEngine,
): void {
  engine.batch(() => {
    diffAndUpdateSignals(prev, next, '', registry)
  })
}

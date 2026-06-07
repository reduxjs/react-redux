/**
 * Helpers to populate a PathSignalRegistry with tracked paths,
 * simulating what happens when selectors access specific state paths.
 */
import { createPathSignalRegistry } from '../../../src/signals/pathSignalRegistry'
import type { PathSignalRegistry } from '../../../src/signals/pathSignalRegistry'
import type { SignalEngine } from '../../../src/signals/types'
import { findKeyField, buildIdentityPath, getKeyValue } from '../../../src/signals/arrayKeys'

/**
 * Walk an object and register all leaf paths as tracked signals.
 * Intermediate objects get ensurePrefix (like the tracking proxy does).
 */
export function registerAllPaths(
  state: unknown,
  parentPath: string,
  registry: PathSignalRegistry,
): void {
  if (state === null || typeof state !== 'object') {
    if (parentPath) registry.getOrCreate(parentPath, state)
    return
  }

  if (parentPath) registry.ensurePrefix(parentPath)

  if (Array.isArray(state)) {
    for (let i = 0; i < state.length; i++) {
      const childPath = parentPath ? `${parentPath}.${i}` : String(i)
      registerAllPaths(state[i], childPath, registry)
    }
  } else {
    const keys = Object.keys(state as Record<string, unknown>)
    for (const key of keys) {
      const childPath = parentPath ? `${parentPath}.${key}` : key
      registerAllPaths((state as Record<string, unknown>)[key], childPath, registry)
    }
  }
}

/**
 * Register specific paths as tracked.
 * Each path gets a signal created with the value from the state.
 */
export function registerPaths(
  state: unknown,
  paths: string[],
  registry: PathSignalRegistry,
): void {
  for (const path of paths) {
    const value = getValueAtPath(state, path)
    // Ensure parent prefixes exist
    const parts = path.split('.')
    for (let i = 1; i < parts.length; i++) {
      registry.ensurePrefix(parts.slice(0, i).join('.'))
    }
    registry.getOrCreate(path, value)
  }
}

/**
 * Register paths for a typical "entity list" selector pattern:
 * - all leaf fields of every entity in an array
 * - the array's @@keys signal
 */
export function registerEntityArrayPaths(
  state: Record<string, unknown>,
  arrayPath: string,
  registry: PathSignalRegistry,
): void {
  const arr = getValueAtPath(state, arrayPath) as unknown[]
  if (!Array.isArray(arr)) return

  // Register array path and @@keys
  registry.ensurePrefix(arrayPath)
  registry.getOrCreate(`${arrayPath}.@@keys`, arr.length)
  registry.getOrCreate(`${arrayPath}.length`, arr.length)

  // Detect key field on first element (same as proxy does)
  const keyField = arr.length > 0 ? findKeyField(arr[0]) : undefined

  if (keyField) {
    // Set up ArrayMeta so diff uses identity-based matching
    registry.setArrayMeta(arrayPath, { keyField, entityMap: new Map() })
  }

  for (let i = 0; i < arr.length; i++) {
    const item = arr[i]
    if (item !== null && typeof item === 'object' && !Array.isArray(item)) {
      // Use identity path if key field detected, else index path
      let itemPath: string
      if (keyField) {
        const kv = getKeyValue(item, keyField)
        itemPath = kv !== undefined
          ? buildIdentityPath(arrayPath, keyField, kv)
          : `${arrayPath}.${i}`
      } else {
        itemPath = `${arrayPath}.${i}`
      }
      registry.ensurePrefix(itemPath)
      const keys = Object.keys(item as Record<string, unknown>)
      for (const key of keys) {
        registry.getOrCreate(
          `${itemPath}.${key}`,
          (item as Record<string, unknown>)[key],
        )
      }
    }
  }
}

/**
 * Register paths for a wide-flat object: all leaf values of each top-level key's child object.
 */
export function registerWideFlatPaths(
  state: Record<string, unknown>,
  registry: PathSignalRegistry,
): void {
  const keys = Object.keys(state)
  for (const key of keys) {
    const childPath = key
    const child = state[key]
    if (child !== null && typeof child === 'object' && !Array.isArray(child)) {
      registry.ensurePrefix(childPath)
      const childKeys = Object.keys(child as Record<string, unknown>)
      for (const ck of childKeys) {
        registry.getOrCreate(
          `${childPath}.${ck}`,
          (child as Record<string, unknown>)[ck],
        )
      }
    } else {
      registry.getOrCreate(childPath, child)
    }
  }
}

/**
 * Register all paths in a deep-nested state tree.
 */
export function registerDeepNestedPaths(
  state: Record<string, unknown>,
  parentPath: string,
  registry: PathSignalRegistry,
): void {
  registerAllPaths(state, parentPath, registry)
}

function getValueAtPath(state: unknown, path: string): unknown {
  const parts = path.split('.')
  let current = state
  for (const part of parts) {
    if (current === null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

export { createPathSignalRegistry }

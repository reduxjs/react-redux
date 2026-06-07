/**
 * Identity-based array tracking utilities.
 *
 * When array elements have ID fields (e.g., {id: 42, name: "Alice"}),
 * signals use identity-based paths (items.{id:42}.name) instead of
 * index-based paths (items.0.name). This makes signals stable across
 * reorders, insertions, and removals.
 */

/** Candidate key field names, checked in priority order. */
const KEY_CANDIDATES = ['id', 'key', '_id', '__id'] as const

/**
 * Detect an identity key field on an object.
 * Returns the property name if found, undefined otherwise.
 * Checks 'id' > 'key' > '_id' > '__id' — same priority order as Legend State.
 */
export function findKeyField(obj: unknown): string | undefined {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return undefined
  for (let i = 0; i < KEY_CANDIDATES.length; i++) {
    const candidate = KEY_CANDIDATES[i]
    if (candidate in (obj as Record<string, unknown>)) {
      const value = (obj as Record<string, unknown>)[candidate]
      // Key must be a primitive that can be used in a path string
      if (typeof value === 'string' || typeof value === 'number') {
        return candidate
      }
    }
  }
  return undefined
}

/**
 * Per-array metadata for identity-based tracking.
 * Stored in the registry, keyed by the array's parent path.
 */
export interface ArrayMeta {
  /** The property name used as the identity key (e.g., 'id') */
  keyField: string
  /**
   * Map from key value → previous array element reference.
   * Used by diff to match elements across prev/next arrays by identity.
   */
  entityMap: Map<string | number, unknown>
}

/**
 * Build the identity path segment for an array element.
 * e.g., arrayPath="items", keyField="id", element={id: 42} → "items.{id:42}"
 */
export function buildIdentityPath(
  arrayPath: string,
  keyField: string,
  keyValue: string | number,
): string {
  return arrayPath ? `${arrayPath}.{${keyField}:${keyValue}}` : `{${keyField}:${keyValue}}`
}

/**
 * Extract a key value from an array element.
 * Returns undefined if element is not an object or key field is missing.
 */
export function getKeyValue(
  element: unknown,
  keyField: string,
): string | number | undefined {
  if (element === null || typeof element !== 'object' || Array.isArray(element)) {
    return undefined
  }
  const value = (element as Record<string, unknown>)[keyField]
  if (typeof value === 'string' || typeof value === 'number') {
    return value
  }
  return undefined
}

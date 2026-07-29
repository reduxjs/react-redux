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
 * @param obj - The object to inspect for a key field
 * @returns The key field name, or undefined if none found
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

// Characters that corrupt path bookkeeping if they appear in a path
// segment (an object key or an identity key value):
// '.' breaks the ancestor walks (lastIndexOf('.')), '{'/'}' can collide
// with identity/column segments, '%' is the escape character itself,
// '"' is reserved for quoting numeric-looking strings (a literal quote
// in a key would otherwise collide with the quoted form of another key),
// and '@' guards meta segments — a state key literally named '@@keys'
// must not collide with the `parent.@@keys` meta signal.
const NEEDS_ESCAPE = /[%.{}"@]/

/**
 * Encode a single path segment so it can be safely joined with '.' into
 * a path string. Reserved characters are %-escaped. The common case
 * (no reserved characters) returns the input string unchanged.
 * Used for object property keys, identity key values, and column props.
 * @param s - The raw segment (object key or stringified key value)
 * @returns The encoded segment
 */
export function encodePathSegment(s: string): string {
  if (!NEEDS_ESCAPE.test(s)) return s
  return s
    .replace(/%/g, '%25')
    .replace(/\./g, '%2E')
    .replace(/\{/g, '%7B')
    .replace(/\}/g, '%7D')
    .replace(/"/g, '%22')
    .replace(/@/g, '%40')
}

/**
 * Render a key value as a path segment fragment.
 *
 * Two invariants:
 * 1. No '.', '{', or '}' in the output (escaped as %XX) so path
 *    prefix walking and pruning stay correct for ids like "a@b.com".
 * 2. A string key never renders identically to a number key. Strings
 *    whose escaped form matches a number's rendering (e.g. "1", "1.5")
 *    are wrapped in quotes: number 1 → `1`, string "1" → `"1"`.
 * @param keyValue - The identity key value
 * @returns The encoded segment fragment
 */
function encodeKeyValue(keyValue: string | number): string {
  if (typeof keyValue === 'number') {
    // Integers (the common case) can't contain escapable characters
    if (Number.isInteger(keyValue)) return String(keyValue)
    return encodePathSegment(String(keyValue))
  }
  const escaped = encodePathSegment(keyValue)
  // Quote strings that would collide with a number's rendering
  return String(Number(keyValue)) === keyValue ? '"' + escaped + '"' : escaped
}

/**
 * Build the identity path segment for an array element.
 * e.g., arrayPath="items", keyField="id", element={id: 42} → "items.{id:42}"
 * Key values are encoded: dots/braces are %-escaped, and numeric-looking
 * string keys are quoted to stay distinct from number keys.
 * @param arrayPath - Parent array's path
 * @param keyField - The identity key field name
 * @param keyValue - The identity key value
 * @returns The identity-based path string
 */
export function buildIdentityPath(
  arrayPath: string,
  keyField: string,
  keyValue: string | number,
): string {
  const segment = `{${keyField}:${encodeKeyValue(keyValue)}}`
  return arrayPath ? `${arrayPath}.${segment}` : segment
}

/**
 * Extract a key value from an array element.
 * Returns undefined if element is not an object or key field is missing.
 * @param element - The array element to extract the key from
 * @param keyField - The identity key field name
 * @returns The key value, or undefined if not extractable
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

/**
 * Throw a descriptive error for a selector attempting to write to Redux
 * state through one of the read-only proxies (probe guard, deep tracking
 * proxy, or array scan recorder).
 *
 * Every write trap throws instead of returning `false`: `return false`
 * only throws in strict-mode callers (with the engine's cryptic
 * "'set' on proxy: trap returned falsish"), and silently no-ops in
 * sloppy-mode code. Mutating state from a selector is always a bug, so
 * it should fail loudly with a message that names the property.
 * @param op - The kind of write that was attempted
 * @param path - Dot-separated state path, or a bare property name when
 *   the full path is unknown
 * @returns Never returns — always throws a `TypeError`
 */
export function throwStateMutationError(
  op: 'set' | 'delete' | 'defineProperty' | 'setPrototypeOf',
  path: string,
): never {
  const verb =
    op === 'set'
      ? `assign to property '${path}' of`
      : op === 'delete'
        ? `delete property '${path}' from`
        : op === 'defineProperty'
          ? `define property '${path}' on`
          : 'change the prototype of'
  throw new TypeError(
    `[react-redux] A selector attempted to ${verb} the Redux state. ` +
      `Selectors must not mutate state — treat state as read-only and ` +
      `return new values instead.`,
  )
}

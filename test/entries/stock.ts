/**
 * Test entry point that presents the stock implementation under its own
 * names. See `./signals.ts` for how the two are selected.
 *
 * This exists so the stock run is pinned to the real stock hooks even
 * while `src/exports.ts` carries the benchmark override that points
 * `Provider`/`useSelector` at the signal versions. Explicit local
 * exports shadow `export *`.
 */
export * from '../../src/index'

export { default as Provider } from '../../src/components/Provider'
export { useSelector, createSelectorHook } from '../../src/hooks/useSelector'

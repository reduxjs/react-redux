/**
 * Test entry point that presents the signal implementation under the
 * stock public names.
 *
 * `vitest.config.mts` aliases the bare specifier `react-redux` to one of
 * these entries. Test files import `{ Provider, useSelector }` from
 * `'react-redux'` and never learn which implementation they got, so the
 * SAME spec file validates both — no copy-paste, and no need to edit
 * `src/exports.ts` to point the library at the signal versions.
 *
 * Explicit local exports shadow `export *`, so this file is correct
 * regardless of what `src/exports.ts` currently exports under these
 * names.
 */
export * from '../../src/index'

export {
  SignalProvider as Provider,
  useSignalSelector as useSelector,
  createSignalSelectorHook as createSelectorHook,
} from '../../src/signals'

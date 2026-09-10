/**
 * `react-redux/signals` entry point.
 *
 * Presents the signals implementation under the stock public names, so a
 * bundler alias can swap an entire app onto the signals implementation
 * without touching application code:
 *
 * ```js
 * // vite.config.js
 * export default defineConfig({
 *   resolve: {
 *     alias: { 'react-redux': 'react-redux/signals' },
 *   },
 * })
 * ```
 *
 * Everything else (`connect`, `useDispatch`, `useStore`, types) is
 * re-exported unchanged from the main entry. The explicit exports below
 * shadow the corresponding names from `export *`.
 */
export * from './index'

export {
  SignalProvider as Provider,
  useSignalSelector as useSelector,
  createSignalSelectorHook as createSelectorHook,
} from './signals'

export type { SignalProviderProps as ProviderProps } from './signals'

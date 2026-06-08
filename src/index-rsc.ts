import type * as normal from './index'
import type * as rsc from './index-rsc'

// checks to make sure we didn't forgot to replicate any exports

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _check: typeof normal = {} as typeof rsc
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _check2: typeof rsc = {} as typeof normal

// -------------------------------------------------------------------------------------

const throwNotSupportedError = ((
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ...args: any[]
): any => {
  throw new Error(
    'This function is not supported in React Server Components. Please only use this export in a Client Component.',
  )
}) as any

export {
  throwNotSupportedError as batch,
  throwNotSupportedError as connect,
  throwNotSupportedError as createDispatchHook,
  throwNotSupportedError as createSelectorHook,
  throwNotSupportedError as createStoreHook,
  throwNotSupportedError as legacy_connect,
  throwNotSupportedError as Provider,
  throwNotSupportedError as useDispatch,
  throwNotSupportedError as useSelector,
  throwNotSupportedError as useStore,
}
export const ReactReduxContext = {} as any
export { shallowEqual } from './utils/shallowEqual'

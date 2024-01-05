import type * as normal from './index'
import type * as rsc from './index-rsc'

// checks to make sure we didn't forgot to replicate any exports

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _check: typeof normal = {} as typeof rsc
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _check2: typeof rsc = {} as typeof normal

// -------------------------------------------------------------------------------------

function throwNotSupportedError(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ...args: any[]
): any {
  throw new Error(
    'This function is not supported in React Server Components. Please only use this export in a Client Component.',
  )
}

export {
  throwNotSupportedError as batch,
  throwNotSupportedError as Provider,
  throwNotSupportedError as connect,
  throwNotSupportedError as useSelector,
  throwNotSupportedError as useDispatch,
  throwNotSupportedError as useStore,
  throwNotSupportedError as createDispatchHook,
  throwNotSupportedError as createSelectorHook,
  throwNotSupportedError as createStoreHook,
}
export const ReactReduxContext = {} as any
export { default as shallowEqual } from './utils/shallowEqual'

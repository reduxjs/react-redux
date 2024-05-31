import { React } from '../utils/react'

// React currently throws a warning when using useLayoutEffect on the server.
// To get around it, we can conditionally useEffect on the server (no-op) and
// useLayoutEffect in the browser. We need useLayoutEffect to ensure the store
// subscription callback always has the selector from the latest render commit
// available, otherwise a store update may happen between render and the effect,
// which may cause missed updates; we also must ensure the store subscription
// is created synchronously, otherwise a store update may occur before the
// subscription is created and an inconsistent state may be observed

// Matches logic in React's `shared/ExecutionEnvironment` file
export const canUseDOM = !!(
  typeof window !== 'undefined' &&
  typeof window.document !== 'undefined' &&
  typeof window.document.createElement !== 'undefined'
)

// Under React Native, we know that we always want to use useLayoutEffect

/**
 * Checks if the code is running in a React Native environment.
 *
 * @see {@link https://github.com/facebook/react-native/issues/1331 Reference}
 */
export const isReactNative =
  typeof navigator !== 'undefined' && navigator.product === 'ReactNative'

const getUseIsomorphicLayoutEffect = () =>
  canUseDOM || isReactNative ? React.useLayoutEffect : React.useEffect

export const useIsomorphicLayoutEffect =
  /* @__PURE__ */ getUseIsomorphicLayoutEffect()

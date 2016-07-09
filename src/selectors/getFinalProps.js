import memoizeProps from '../utils/memoizeProps'

export function createImpureFinalPropsSelector({ getState, getDispatch, mergeProps }) {
  return function impureSelector(state, props, dispatch) {
    return mergeProps(
      getState(state, props, dispatch),
      getDispatch(state, props, dispatch),
      props
    )
  }
}

export function createPureFinalPropsSelector({ getState, getDispatch, mergeProps }) {
  const memoizeOwn = memoizeProps()
  const memoizeGetState = memoizeProps()
  const memoizeGetDispatch = memoizeProps()
  const memoizeFinal = memoizeProps()
  let lastOwn = undefined
  let lastState = undefined
  let lastDispatch = undefined
  let lastMerged = undefined

  return function pureSelector(state, props, dispatch) {
    const nextOwn = memoizeOwn(props)
    const nextState = memoizeGetState(getState(state, nextOwn, dispatch))
    const nextDispatch = memoizeGetDispatch(getDispatch(state, nextOwn, dispatch))

    if (lastOwn !== nextOwn
      || lastState !== nextState
      || lastDispatch !== nextDispatch) {
      lastMerged = memoizeFinal(mergeProps(nextState, nextDispatch, nextOwn))
      lastOwn = nextOwn
      lastState = nextState
      lastDispatch = nextDispatch
    }

    return lastMerged
  }
}

export function createFinalPropsSelector(options) {
  return options.pure
    ? createPureFinalPropsSelector(options)
    : createImpureFinalPropsSelector(options)
}

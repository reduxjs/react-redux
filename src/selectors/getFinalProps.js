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
  let lastOwn = undefined
  let lastState = undefined
  let lastDispatch = undefined
  let lastMerged = undefined
  return function pureSelector(state, props, dispatch) {
    const nextOwn = props
    const nextState = getState(state, props, dispatch)
    const nextDispatch = getDispatch(state, props, dispatch)

    if (lastOwn !== nextOwn || lastState !== nextState || lastDispatch !== nextDispatch) {
      lastMerged = mergeProps(nextState, nextDispatch, nextOwn)
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

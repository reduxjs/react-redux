import connectAdvanced from './connectAdvanced'
import { buildDispatchPropsSelector } from '../selectors/dispatch'
import { buildOwnPropsSelector } from '../selectors/ownProps'
import { buildStatePropsSelector } from '../selectors/state'
import shallowEqual from '../utils/shallowEqual'
import verifyPlainObject from '../utils/verifyPlainObject'

export function defaultMergeProps(stateProps, dispatchProps, ownProps) {
  return {
    ...ownProps,
    ...stateProps,
    ...dispatchProps
  }
}

export function wrapWithVerify(displayName, { getState, getDispatch, getOwn, merge }) {
  return {
    getState: verifyPlainObject(displayName, 'mapStateToProps', getState),
    getDispatch: verifyPlainObject(displayName, 'mapDispatchToProps', getDispatch),
    getOwn,
    merge: merge !== defaultMergeProps
      ? verifyPlainObject(displayName, 'mergeProps', merge)
      : merge
  }
}

export function buildImpureSelector({ getState, getDispatch, getOwn, merge }) {
  return function impureSelector(state, props, dispatch) {
    return merge(
      getState(state, props, dispatch),
      getDispatch(state, props, dispatch),
      getOwn(state, props, dispatch)
    )
  }
}

export function buildPureSelector({ getState, getDispatch, getOwn, merge }) {
  let lastOwn = undefined
  let lastState = undefined
  let lastDispatch = undefined
  let lastResult = undefined
  return function pureSelector(state, props, dispatch) {
    const nextOwn = getOwn(state, props, dispatch)
    const nextState = getState(state, props, dispatch)
    const nextDispatch = getDispatch(state, props, dispatch)

    if (lastOwn !== nextOwn || lastState !== nextState || lastDispatch !== nextDispatch) {
      lastOwn = nextOwn
      lastState = nextState
      lastDispatch = nextDispatch

      const nextResult = merge(nextState, nextDispatch, nextOwn)
      if (!lastResult || !shallowEqual(lastResult, nextResult)) {
        lastResult = nextResult
      }
    }

    return lastResult
  }
}

// create a connectAdvanced-compatible selectorFactory function that applies the results of
// mapStateToProps, mapDispatchToProps, and mergeProps
export function buildSelectorFactory(mapStateToProps, mapDispatchToProps, merge) {
  return function selectorFactory({ displayName, pure }) {
    const getOwn = buildOwnPropsSelector(pure)
    const getState = buildStatePropsSelector(pure, getOwn, mapStateToProps)
    const getDispatch = buildDispatchPropsSelector(pure, getOwn, mapDispatchToProps)

    const build = pure ? buildPureSelector : buildImpureSelector
    return build(wrapWithVerify(displayName, { getState, getDispatch, getOwn, merge }))
  }
}

export default function connect(
  mapStateToProps,
  mapDispatchToProps,
  mergeProps,
  options
) {
  return connectAdvanced(
    buildSelectorFactory(mapStateToProps, mapDispatchToProps, mergeProps || defaultMergeProps),
    {
      getDisplayName: name => `Connect(${name})`,
      ...options,
      methodName: 'connect',
      dependsOnState: Boolean(mapStateToProps)
    }
  )
}

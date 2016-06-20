import { bindActionCreators } from 'redux'

import buildFactoryAwareSelector from './buildFactoryAwareSelector'

export function buildMissingDispatchSelector() {
  let dispatchProps = undefined
  return function dispatchSelector(_, __, dispatch) {
    if (!dispatchProps) {
      dispatchProps = { dispatch }
    }
    return dispatchProps
  }
}

export function buildBoundActionCreatorsSelector(mapDispatchToProps) {
  let bound = undefined
  return function boundActionCreatorsSelector(_, __, dispatch) {
    if (!bound) {
      bound = bindActionCreators(mapDispatchToProps, dispatch)
    }
    return bound
  }
}

export function buildFactoryAwareDispatchSelector(pure, ownPropsSelector, mapDispatchToProps) {
  return buildFactoryAwareSelector(
    pure,
    ownPropsSelector,
    (_, __, dispatch) => dispatch,
    mapDispatchToProps
  )    
}

export function buildDispatchPropsSelector(pure, ownPropsSelector, mapDispatchToProps) {
  if (!mapDispatchToProps) {
    return buildMissingDispatchSelector()
  }

  if (typeof mapDispatchToProps !== 'function') {
    return buildBoundActionCreatorsSelector(mapDispatchToProps)
  }

  return buildFactoryAwareDispatchSelector(pure, ownPropsSelector, mapDispatchToProps)
}

import buildFactoryAwareSelector from './buildFactoryAwareSelector'

export function buildMissingStateSelector() {
  const empty = {}
  return function missingStateSelector() {
    return empty
  }
}

export function buildFactoryAwareStateSelector(pure, ownPropsSelector, mapStateToProps) {
  return buildFactoryAwareSelector(
    pure,
    ownPropsSelector,
    state => state,
    mapStateToProps
  )
}

export function buildStatePropsSelector(pure, ownPropsSelector, mapStateToProps) {
  if (!mapStateToProps) {
    return buildMissingStateSelector()
  }

  return buildFactoryAwareStateSelector(pure, ownPropsSelector, mapStateToProps)
}

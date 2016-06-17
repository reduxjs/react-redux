import { createSelectorCreator, defaultMemoize } from 'reselect'

import shallowEqual from '../utils/shallowEqual'

export default function buildSelector({
    displayName,
    ref,
    selectorFactory,
    recomputationsProp,
    shouldUseState,
    store
  }) {
  // wrap the source selector in a shallow equals because props objects with same properties are
  // symantically equal to React... no need to re-render.
  const selector = createSelectorCreator(defaultMemoize, shallowEqual)(

    // get the source selector from the factory
    selectorFactory({
      // useful for selector factories to show in error messages
      displayName,
      // useful for selectors that want to bind action creators before returning their selector
      dispatch: store.dispatch
    }),
    
    // make a shallow copy so that mutations don't leak to the original selector. any additional
    // mutations added to the mutateProps func below should be checked for here
    ref || recomputationsProp
      ? (result => ({ ...result }))
      : (result => result)
  )

  function mutateProps(props, before, recomputations) {
    if (before === recomputations) return
    if (ref) props.ref = ref
    if (recomputationsProp) props[recomputationsProp] = recomputations
  }

  return function runSelector(ownProps) {
    const before = selector.recomputations()
    const state = shouldUseState ? store.getState() : null
    const props = selector(state, ownProps, store.dispatch)
    const recomputations = selector.recomputations()

    mutateProps(props, before, recomputations)
    return { props, recomputations }
  }
}

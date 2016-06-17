import { createSelectorCreator, defaultMemoize } from 'reselect'

import shallowEqual from '../utils/shallowEqual'

export default function buildSelector({
    selectorFactory,
    dispatch,
    getState,
    ref,
    recomputationsProp,
    ...options
  }) {
  // the final props obect is mutated directly instead of projecting into a new object to avoid
  // some extra object creation and tracking.
  const mightMutateProps = ref || recomputationsProp
  function mutateProps(props, before, recomputations) {
    if (before === recomputations) return
    if (ref) props.ref = ref
    if (recomputationsProp) props[recomputationsProp] = recomputations
  }

  // wrap the source selector in a shallow equals because props objects with same properties are
  // semantically equal to React... no need to re-render.
  const masterSelector = createSelectorCreator(defaultMemoize, shallowEqual)(
    selectorFactory({
      // useful for selecto factories that want to bind action creators before returning
      // their selector
      dispatch,
      // additional options passed to buildSelector are passed along to the selectorFactory
      ...options
    }),

    // make a shallow copy so that fields added by mutateProps don't leak to the original selector.
    // this is especially important for 'ref' since that's a reference back to the component
    // instance. a singleton memoized selector would then be holding a reference to the instance,
    // preventing the instance from being garbage collected
    mightMutateProps
      ? (result => ({ ...result }))
      : (result => result)
  )

  return function runSelector(ownProps) {
    const before = masterSelector.recomputations()
    const state = getState()
    const props = masterSelector(state, ownProps, dispatch)
    const recomputations = masterSelector.recomputations()

    if (mightMutateProps) mutateProps(props, before, recomputations)
    return { props, recomputations }
  }
}

import React from 'react'
import hoistStatics from 'hoist-non-react-statics'
import StoreModifier, { createStoreModifier } from './StoreModifier'

export default function withModifiedStore(modification, options = {}) {
  const ModifierComponent = options.context
    ? createStoreModifier(options.context)
    : StoreModifier

  return function wrapWithStoreModifier(WrappedComponent) {
    const wrappedComponentName =
      WrappedComponent.displayName || WrappedComponent.name || 'Component'

    const displayName = `StoreModifier(${wrappedComponentName})`

    function StoreModifierHOC({ forwardedRef, ...props }) {
      return (
        <ModifierComponent
          modification={modification}
          modifyStore={options.modifyStore}
        >
          <WrappedComponent {...props} ref={forwardedRef} />
        </ModifierComponent>
      )
    }

    StoreModifierHOC.WrappedComponent = WrappedComponent
    StoreModifierHOC.displayName = displayName

    if (options.forwardRef) {
      const forwarded = React.forwardRef(function forwardStoreModifierRef(
        props,
        ref
      ) {
        return <StoreModifierHOC {...props} forwardedRef={ref} />
      })

      forwarded.WrappedComponent = WrappedComponent
      forwarded.displayName = displayName

      return hoistStatics(forwarded, WrappedComponent)
    }

    return hoistStatics(StoreModifierHOC, WrappedComponent)
  }
}

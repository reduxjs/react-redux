import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import PropTypes from 'prop-types'
import React, { useContext, useMemo} from 'react'
import { isValidElementType } from 'react-is'

import {ReactReduxContext} from "./context"


export default function connectAdvanced(
  /*
    selectorFactory is a func that is responsible for returning the selector function used to
    compute new props from state, props, and dispatch. For example:

      export default connectAdvanced((dispatch, options) => (state, props) => ({
        thing: state.things[props.thingId],
        saveThing: fields => dispatch(actionCreators.saveThing(props.thingId, fields)),
      }))(YourComponent)

    Access to dispatch is provided to the factory so selectorFactories can bind actionCreators
    outside of their selector as an optimization. Options passed to connectAdvanced are passed to
    the selectorFactory, along with displayName and WrappedComponent, as the second argument.

    Note that selectorFactory is responsible for all caching/memoization of inbound and outbound
    props. Do not use connectAdvanced directly without memoizing results between calls to your
    selector, otherwise the Connect component will re-render on every state or props change.
  */
  selectorFactory,
  // options object:
  {
    // the func used to compute this HOC's displayName from the wrapped component's displayName.
    // probably overridden by wrapper functions such as connect()
    getDisplayName = name => `ConnectAdvanced(${name})`,

    // shown in error messages
    // probably overridden by wrapper functions such as connect()
    methodName = 'connectAdvanced',

    // determines whether this HOC subscribes to store changes
    shouldHandleStateChanges = true,


    // the context to use
    context : defaultContext = ReactReduxContext,

    // REMOVED: the key of props/context to get the store
    storeKey = 'store',

    // REMOVED: expose the wrapped component via refs
    withRef = false,

    // use React's forwardRef to expose a ref of the wrapped component
    forwardRef = false,

    // additional options are passed through to the selectorFactory
    ...connectOptions
  } = {}
) {
  invariant(!withRef,
    "withRef is removed. To access the wrapped instance, use a ref on the connected component"
  )

  invariant(storeKey === 'store',
    'storeKey has been removed. To use a custom redux store for a single component, ' +
    'create a custom React context with React.createContext() and pass it to react-redux\'s Provider ' +
    'and this component as in <Provider context={MyCustomContext}><' +
    'ConnectedComponent context={MyCustomContext} /></Provider>'
  )


  return function wrapWithConnect(WrappedComponent) {
    invariant(
      isValidElementType(WrappedComponent),
      `You must pass a component to the function returned by ` +
      `${methodName}. Instead received ${JSON.stringify(WrappedComponent)}`
    )

    const wrappedComponentName = WrappedComponent.displayName
      || WrappedComponent.name
      || 'Component'

    const displayName = getDisplayName(wrappedComponentName)

    const selectorFactoryOptions = {
      ...connectOptions,
      getDisplayName,
      methodName,
      shouldHandleStateChanges,
      displayName,
      wrappedComponentName,
      WrappedComponent
    }


    function createChildSelector(store) {
      return selectorFactory(store.dispatch, selectorFactoryOptions)
    }


    function ConnectFunction(props) {
      const {context, forwardRef, ...wrapperProps} = props
      const contextToRead = context || defaultContext

      const {store, storeState} = useContext(contextToRead)
      const childPropsSelector = useMemo(() =>  createChildSelector(store), [store])

      const childProps = childPropsSelector(storeState, wrapperProps)

      const renderedChild = useMemo(() => {
        return <WrappedComponent {...childProps} ref={forwardRef} />
      }, [childProps, forwardRef])

      return renderedChild
    }


    // TODO We're losing the ability to add a store as a prop. Not sure there's anything we can do about that.


    let wrapperComponent = ConnectFunction

    if(forwardRef) {
      const forwarded = React.forwardRef(function (props, ref) {
        return <ConnectFunction {...props} forwardRef={ref} />
      })

      wrapperComponent = forwarded
    }

    wrapperComponent.WrappedComponent = WrappedComponent
    wrapperComponent.displayName = displayName
    wrapperComponent.propTypes = {
      context: PropTypes.object,
    }


    return hoistStatics(wrapperComponent, WrappedComponent)
  }
}

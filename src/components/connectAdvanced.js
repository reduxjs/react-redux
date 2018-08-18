import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import PropTypes from 'prop-types'
import React, { Component, PureComponent } from 'react'
import { isValidElementType } from 'react-is'

import {ReactReduxContext} from "./context"
import {storeShape} from "../utils/PropTypes"

let hotReloadingVersion = 0


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


    // the context consumer to use
    consumer = ReactReduxContext.Consumer,

    // REMOVED: the key of props/context to get the store
    storeKey = 'store',

    // REMOVED: expose the wrapped component via refs
    withRef = false,

    // additional options are passed through to the selectorFactory
    ...connectOptions
  } = {}
) {
  invariant(!withRef,
    "withRef is removed. To access the wrapped instance, use a ref on the connected component"
  )

  invariant(storeKey === 'store',
    'storeKey has been removed. To use a custom redux store for a single component, ' +
    'create a custom React context with React.createContext() and pass the Provider to react-redux\'s provider ' +
    'and the Consumer to this component as in <Provider context={context.Provider}><' +
    'ConnectedComponent consumer={context.Consumer} /></Provider>'
  )


  const version = hotReloadingVersion++


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


    const OuterBaseComponent = connectOptions.pure ? PureComponent : Component

    function createChildSelector(store) {
      return selectorFactory(store.dispatch, selectorFactoryOptions)
    }

    class ConnectInner extends Component {
      constructor(props) {
        super(props)

        this.state = {
          wrapperProps : props.wrapperProps,
          store : props.store,
          error : null,
          childPropsSelector : createChildSelector(props.store),
          childProps : {},
        }

        this.state = {
          ...this.state,
          ...ConnectInner.getChildPropsState(props, this.state)
        }
      }



      static getChildPropsState(props, state) {
        try {
          let {childPropsSelector} = state

          if(props.store !== state.store) {
            childPropsSelector = createChildSelector(props.store)
          }

          const nextProps = childPropsSelector(props.storeState, props.wrapperProps)
          if (nextProps === state.childProps) return null

          return { childProps: nextProps, store : props.store, childPropsSelector }
        } catch (error) {
          return { error }
        }
      }

      static getDerivedStateFromProps(props, state) {
        const nextChildProps = ConnectInner.getChildPropsState(props, state)

        if(nextChildProps === null) {
          return null
        }

        return {
          ...nextChildProps,
          wrapperProps : props.wrapperProps,
        }
      }

      shouldComponentUpdate(nextProps, nextState) {
        const childPropsChanged = nextState.childProps !== this.state.childProps
        const hasError = !!nextState.error

        return  childPropsChanged || hasError
      }

      render() {
        if(this.state.error) {
          throw this.state.error
        }

        return <WrappedComponent {...this.state.childProps} ref={this.props.forwardRef} />
      }
    }

    ConnectInner.propTypes = {
      wrapperProps : PropTypes.object,
      store : storeShape,
    }


    function createWrapperPropsMemoizer() {
      let result, prevProps

      return function wrapperPropsMemoizer(props) {
        if(props === prevProps) {
          return result
        }

        const {consumer, forwardRef, ...wrapperProps} = props
        result = {consumer, forwardRef, wrapperProps}

        return result
      }
    }

    class Connect extends OuterBaseComponent {
      constructor(props) {
        super(props)

        this.version = version

        this.renderInner = this.renderInner.bind(this)

        this.wrapperPropsMemoizer = createWrapperPropsMemoizer()
      }

      renderInner(providerValue) {
          const {storeState, store} = providerValue

          const {forwardRef, wrapperProps} = this.wrapperPropsMemoizer(this.props)

          return (
            <ConnectInner
              key={this.version}
              storeState={storeState}
              store={store}
              wrapperProps={wrapperProps}
              forwardRef={forwardRef}
            />
          )
      }

      render() {
        const ContextConsumer = this.props.consumer || consumer

        return (
          <ContextConsumer>
            {this.renderInner}
          </ContextConsumer>
        )
      }
    }

    Connect.WrappedComponent = WrappedComponent
    Connect.displayName = displayName
    Connect.propTypes = {
      consumer: PropTypes.object,
      forwardRef: PropTypes.oneOfType([
        PropTypes.func,
        PropTypes.object
      ])
    }

    // TODO We're losing the ability to add a store as a prop. Not sure there's anything we can do about that.




    const forwarded = React.forwardRef(function (props, ref) {
      return <Connect {...props} forwardRef={ref} />
    })

    forwarded.displayName = Connect.displayName
    forwarded.WrappedComponent = WrappedComponent
    return hoistStatics(forwarded, WrappedComponent)
  }
}

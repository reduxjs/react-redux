import hoistStatics from 'hoist-non-react-statics'
import invariant from 'invariant'
import React, { Component, PureComponent, useState, useContext, useMemo, useCallback, useEffect, useRef , useReducer} from 'react'
import { isValidElementType, isContextConsumer } from 'react-is'
import shallowEqual from "../utils/shallowEqual";

import { ReactReduxContext } from './Context'

const stringifyComponent = Comp => {
  try {
    return JSON.stringify(Comp)
  } catch (err) {
    return String(Comp)
  }
}

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

    // REMOVED: if defined, the name of the property passed to the wrapped element indicating the number of
    // calls to render. useful for watching in react devtools for unnecessary re-renders.
    renderCountProp = undefined,

    // determines whether this HOC subscribes to store changes
    shouldHandleStateChanges = true,

    // REMOVED: the key of props/context to get the store
    storeKey = 'store',

    // REMOVED: expose the wrapped component via refs
    withRef = false,

    // use React's forwardRef to expose a ref of the wrapped component
    forwardRef = false,

    // the context consumer to use
    context = ReactReduxContext,

    // additional options are passed through to the selectorFactory
    ...connectOptions
  } = {}
) {
  invariant(
    renderCountProp === undefined,
    `renderCountProp is removed. render counting is built into the latest React dev tools profiling extension`
  )

  invariant(
    !withRef,
    'withRef is removed. To access the wrapped instance, use a ref on the connected component'
  )

  const customStoreWarningMessage =
    'To use a custom Redux store for specific components,  create a custom React context with ' +
    "React.createContext(), and pass the context object to React Redux's Provider and specific components" +
    ' like:  <Provider context={MyContext}><ConnectedComponent context={MyContext} /></Provider>. ' +
    'You may also pass a {context : MyContext} option to connect'

  invariant(
    storeKey === 'store',
    'storeKey has been removed and does not do anything. ' +
      customStoreWarningMessage
  )

  const Context = context

  return function wrapWithConnect(WrappedComponent) {
    if (process.env.NODE_ENV !== 'production') {
      invariant(
        isValidElementType(WrappedComponent),
        `You must pass a component to the function returned by ` +
          `${methodName}. Instead received ${stringifyComponent(
            WrappedComponent
          )}`
      )
    }

    const wrappedComponentName =
      WrappedComponent.displayName || WrappedComponent.name || 'Component'

    const displayName = getDisplayName(wrappedComponentName)

    const selectorFactoryOptions = {
      ...connectOptions,
      getDisplayName,
      methodName,
      renderCountProp,
      shouldHandleStateChanges,
      storeKey,
      displayName,
      wrappedComponentName,
      WrappedComponent
    }

    const { pure } = connectOptions

    let OuterBaseComponent = Component

    if (pure) {
      OuterBaseComponent = PureComponent
    }

    function makeDerivedPropsSelector() {
      let lastProps
      let lastState
      let lastDerivedProps
      let lastStore
      let lastSelectorFactoryOptions
      let sourceSelector

      return function selectDerivedProps(
        state,
        props,
        store,
        selectorFactoryOptions
      ) {
        if (pure && lastProps === props && lastState === state) {
          return lastDerivedProps
        }

        if (
          store !== lastStore ||
          lastSelectorFactoryOptions !== selectorFactoryOptions
        ) {
          lastStore = store
          lastSelectorFactoryOptions = selectorFactoryOptions
          sourceSelector = selectorFactory(
            store.dispatch,
            selectorFactoryOptions
          )
        }

        lastProps = props
        lastState = state

        const nextProps = sourceSelector(state, props)

        lastDerivedProps = nextProps
        return lastDerivedProps
      }
    }

    function makeChildElementSelector() {
      let lastChildProps, lastForwardRef, lastChildElement, lastComponent

      return function selectChildElement(
        WrappedComponent,
        childProps,
        forwardRef
      ) {
        if (
          childProps !== lastChildProps ||
          forwardRef !== lastForwardRef ||
          lastComponent !== WrappedComponent
        ) {
          lastChildProps = childProps
          lastForwardRef = forwardRef
          lastComponent = WrappedComponent
          lastChildElement = (
            <WrappedComponent {...childProps} ref={forwardRef} />
          )
        }

        return lastChildElement
      }
    }
/*
    class Connect extends OuterBaseComponent {
      constructor(props) {
        super(props)
        invariant(
          forwardRef ? !props.wrapperProps[storeKey] : !props[storeKey],
          'Passing redux store in props has been removed and does not do anything. ' +
            customStoreWarningMessage
        )
        this.selectDerivedProps = makeDerivedPropsSelector()
        this.selectChildElement = makeChildElementSelector()
        this.indirectRenderWrappedComponent = this.indirectRenderWrappedComponent.bind(
          this
        )
      }

      indirectRenderWrappedComponent(value) {
        // calling renderWrappedComponent on prototype from indirectRenderWrappedComponent bound to `this`
        return this.renderWrappedComponent(value)
      }

      renderWrappedComponent(value) {
        invariant(
          value,
          `Could not find "store" in the context of ` +
            `"${displayName}". Either wrap the root component in a <Provider>, ` +
            `or pass a custom React context provider to <Provider> and the corresponding ` +
            `React context consumer to ${displayName} in connect options.`
        )
        const { storeState, store } = value

        let wrapperProps = this.props
        let forwardedRef

        if (forwardRef) {
          wrapperProps = this.props.wrapperProps
          forwardedRef = this.props.forwardedRef
        }

        let derivedProps = this.selectDerivedProps(
          storeState,
          wrapperProps,
          store,
          selectorFactoryOptions
        )

        return this.selectChildElement(
          WrappedComponent,
          derivedProps,
          forwardedRef
        )
      }

      render() {
        const ContextToUse =
          this.props.context &&
          this.props.context.Consumer &&
          isContextConsumer(<this.props.context.Consumer />)
            ? this.props.context
            : Context

        return (
          <ContextToUse.Consumer>
            {this.indirectRenderWrappedComponent}
          </ContextToUse.Consumer>
        )
      }
    }
    */

    function createChildSelector(store) {
      return selectorFactory(store.dispatch, selectorFactoryOptions)
    }

    const usePureOnlyMemo = pure ? useMemo : (x => x())

    let renderCount = 0

    function storeStateUpdatesReducer(state, action) {
      const [prevStoreState, updateCount = 0] = state;
      return [action.payload, updateCount + 1]
    }

    function ConnectFunction(props) {
      const [context, forwardedRef, wrapperProps] = useMemo(() => {
        const {context, forwardedRef, ...wrapperProps} = props;
        return [context, forwardedRef, wrapperProps];
      }, [props])
      //const {context, forwardedRef, ...wrapperProps} = props

      console.log("ConnectFunction rerendering: ", Connect.displayName)

      const ContextToUse = useMemo(() => {
        return props.context &&
          props.context.Consumer &&
          isContextConsumer(<props.context.Consumer />)
            ? props.context
            : Context
      }, [props.context, Context])

      const contextValue = useContext(ContextToUse)

      invariant(
        props.store || contextValue,
        `Could not find "store" in the context of ` +
        `"${displayName}". Either wrap the root component in a <Provider>, ` +
        `or pass a custom React context provider to <Provider> and the corresponding ` +
        `React context consumer to ${displayName} in connect options.`
      )

      renderCount += 1

      const store = props.store || contextValue.store;
      const subscribe = props.store ? props.store.subscribe : contextValue.subscribe

      //store.renderCount = renderCount
      //subscribe.renderCount = renderCount

      const childPropsSelector = useMemo(() =>  {
        console.log("createChildSelector running")
        return createChildSelector(store)
      }, [store])

      //const [previousStoreState, setStoreState] = useState(store.getState())
      const [ [previousStoreState, storeUpdateCount], dispatch] = useReducer(storeStateUpdatesReducer, [store.getState()])

      //const [childProps, setChildProps] = useState(() => childPropsSelector(store.getState(), wrapperProps))

      const lastChildProps = useRef();
      const lastWrapperProps = useRef(wrapperProps);
      const childPropsFromStoreUpdate = useRef();
      //const previousStoreState = useRef(store.getState());

      //const actualChildProps = childPropsSelector(previousStoreState.current, wrapperProps)
      const actualChildProps = usePureOnlyMemo(() => {
        if(childPropsFromStoreUpdate.current) {
          return childPropsFromStoreUpdate.current;
        }

        return childPropsSelector(previousStoreState, wrapperProps)
      }, [previousStoreState, wrapperProps]);

      useEffect(() => {
        lastWrapperProps.current = wrapperProps
        lastChildProps.current = actualChildProps
        childPropsFromStoreUpdate.current = null;
      })

      //console.log({store, subscribe, childPropsSelector})

      useEffect(() => {
        let didUnsubscribe = false;

        const checkForUpdates = () => {
          if (didUnsubscribe) {
            // Don't run stale listeners.
            // Redux doesn't guarantee unsubscriptions happen until next dispatch.
            return;
          }

          const latestStoreState = store.getState();


          const newChildProps = childPropsSelector(latestStoreState, lastWrapperProps.current);

          //previousStoreState.current = latestStoreState;

          if(newChildProps !== lastChildProps.current) {
            //setChildProps(newChildProps);
            console.log("Store state update caused child props change: ", Connect.displayName, newChildProps)
            //setStoreState(latestStoreState)
            dispatch({type : "STORE_UPDATED", payload : latestStoreState})
            lastChildProps.current = newChildProps;
            childPropsFromStoreUpdate.current = newChildProps
          }


          //updateChildProps()

          /*
          if(latestStoreState !== previousStoreState) {


            //setStoreState(latestStoreState)
          }
          */
        };

        // Pull data from the store after first render in case the store has
        // changed since we began.
        checkForUpdates();

        //console.log("Subscribing for component type: ", Connect.displayName)
        const unsubscribe = subscribe(checkForUpdates)

        const unsubscribeWrapper = () => {
          didUnsubscribe = true
          unsubscribe();
        }

        return unsubscribeWrapper;

      }, [store, subscribe, childPropsSelector])



      //let actualChildProps = childProps;



      const renderedChild = useMemo(() => {
        return <WrappedComponent {...actualChildProps} ref={forwardedRef} />
      }, [WrappedComponent, actualChildProps, forwardedRef])

      return renderedChild
    }

    const Connect = ConnectFunction;

    Connect.WrappedComponent = WrappedComponent
    Connect.displayName = displayName

    if (forwardRef) {
      const forwarded = React.forwardRef(function forwardConnectRef(
        props,
        ref
      ) {
        return <Connect wrapperProps={props} forwardedRef={ref} />
      })

      forwarded.displayName = displayName
      forwarded.WrappedComponent = WrappedComponent
      return hoistStatics(forwarded, WrappedComponent)
    }

    return hoistStatics(Connect, WrappedComponent)
  }
}

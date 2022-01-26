import React, { useMemo } from 'react'
import PropTypes from 'prop-types'
import { ReactReduxContext } from './Context'
import Subscription from '../utils/Subscription'
import { useIsomorphicLayoutEffect } from '../utils/useIsomorphicLayoutEffect'

function Provider({ store, context, children }) {
  /* 将{
        store,
        subscription,
       }
      作为Provider的value透传下去
  */
  const contextValue = useMemo(() => {
    const subscription = new Subscription(store)
    subscription.__type = 'root'
    subscription.onStateChange = subscription.notifyNestedSubs
    return {
      store,
      subscription,
    }
  }, [store])

  // 获取store的state作为上一次state
  const previousState = useMemo(() => store.getState(), [store])

  // useIsomorphicLayoutEffect是一个facade，在server环境是useEffect，在浏览器环境是useLayoutEffect。
  // 首次mount或者store发生变化时触发：
  // subscription订阅
  useIsomorphicLayoutEffect(() => {
    const { subscription } = contextValue
    subscription.trySubscribe()

    // 如果store的state变了，则触发一次更新订阅
    if (previousState !== store.getState()) {
      subscription.notifyNestedSubs()
    }
    return () => {
      subscription.tryUnsubscribe()
      subscription.onStateChange = null
    }
  }, [contextValue, previousState])

  const Context = context || ReactReduxContext

  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}

if (process.env.NODE_ENV !== 'production') {
  Provider.propTypes = {
    store: PropTypes.shape({
      subscribe: PropTypes.func.isRequired,
      dispatch: PropTypes.func.isRequired,
      getState: PropTypes.func.isRequired,
    }),
    context: PropTypes.object,
    children: PropTypes.any,
  }
}

export default Provider

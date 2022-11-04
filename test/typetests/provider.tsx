/* eslint-disable @typescript-eslint/no-unused-vars */

import React from 'react'
import { Provider } from '../../src'
import { Store } from 'redux'

declare const store: Store<{ foo: string }>

function App() {
  return (
    <Provider
      store={store}
      // @ts-expect-error
      serverState={'oops'}
    >
      foo
    </Provider>
  )
}

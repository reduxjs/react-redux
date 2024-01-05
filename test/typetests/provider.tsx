/* eslint-disable @typescript-eslint/no-unused-vars */

import React from 'react'
import type { Store } from 'redux'
import { Provider } from '../../src'

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

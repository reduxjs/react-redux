import type { Store } from 'redux'
import { Provider } from '../../src'

declare const store: Store<{ foo: string }>

describe('type tests', () => {
  test('Provider', () => {
    expectTypeOf(Provider)
      .parameter(0)
      .not.toMatchTypeOf({ store, serverState: 'oops', children: 'foo' })

    const App = () => {
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
  })
})

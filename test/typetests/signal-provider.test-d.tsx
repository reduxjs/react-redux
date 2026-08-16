import type { Action, Store, UnknownAction } from 'redux'
import { SignalProvider } from '../../src/signals'

type FooAction = Action<'foo'>

declare const store: Store<{ foo: string }>
declare const fooStore: Store<{ foo: string }, FooAction>

describe('type tests', () => {
  test('SignalProvider rejects the same bad props as stock Provider', () => {
    expectTypeOf(SignalProvider)
      .parameter(0)
      .not.toMatchTypeOf({ store, serverState: 'oops', children: 'foo' })

    const App = () => {
      return (
        <SignalProvider
          store={store}
          // @ts-expect-error
          serverState={'oops'}
        >
          foo
        </SignalProvider>
      )
    }
  })

  test('SignalProvider generic order matches stock Provider (<A, S>)', () => {
    const Explicit = () => {
      return (
        <SignalProvider<FooAction, { foo: string }> store={fooStore}>
          foo
        </SignalProvider>
      )
    }

    const WrongOrder = () => {
      return (
        // @ts-expect-error state type is the second parameter, not the first
        <SignalProvider<{ foo: string }, UnknownAction> store={fooStore}>
          foo
        </SignalProvider>
      )
    }
  })
})

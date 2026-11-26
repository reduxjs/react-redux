import { createRoot } from 'react-dom/client'
import { Provider, connect, useDispatch, useSelector } from 'react-redux'
import { createStore } from 'redux'

// A stock React-Redux app: Provider, hooks, and connect, all from the main
// entry point. It never touches SignalProvider or useSignalSelector, so a
// correct build must not contain any of the signals implementation.

interface State {
  count: number
}

function reducer(state: State = { count: 0 }, action: { type: string }) {
  return action.type === 'increment' ? { count: state.count + 1 } : state
}

const store = createStore(reducer)

function Counter() {
  const count = useSelector((s: State) => s.count)
  const dispatch = useDispatch()
  return (
    <button onClick={() => dispatch({ type: 'increment' })}>{count}</button>
  )
}

const ConnectedLabel = connect((s: State) => ({ count: s.count }))(
  ({ count }: { count: number }) => <span>{count}</span>,
)

createRoot(document.getElementById('root')!).render(
  <Provider store={store}>
    <Counter />
    <ConnectedLabel />
  </Provider>,
)

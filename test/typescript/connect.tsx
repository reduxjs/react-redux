import * as React from 'react'
import { Dispatch, Reducer, createStore } from 'redux'
import { Provider, connect } from '../..'

type State = Todo[]

interface Todo {
  id: number
  text: string
  completed: boolean
}

type Action =
  | { type: 'ADD_TODO'; text: string }
  | { type: 'DELETE_TODO'; id: number }
  | { type: 'EDIT_TODO'; id: number; text: string }
  | { type: 'COMPLETE_TODO'; id: number }
  | { type: 'COMPLETE_ALL' }
  | { type: 'CLEAR_COMPLETED' }

const initialState = [
  {
    text: 'Use Redux',
    completed: false,
    id: 0
  }
]

const reducer = (state: State = initialState, action: Action) => {
  switch (action.type) {
    case 'ADD_TODO':
      return [
        ...state,
        {
          id: state.reduce((maxId, todo) => Math.max(todo.id, maxId), -1) + 1,
          completed: false,
          text: action.text,
        }
      ]

    case 'DELETE_TODO':
      return state.filter(todo =>
        todo.id !== action.id
      )

    case 'EDIT_TODO':
      return state.map(todo =>
        todo.id === action.id ?
          { ...todo, text: action.text } :
          todo
      )

    case 'COMPLETE_TODO':
      return state.map(todo =>
        todo.id === action.id ?
          { ...todo, completed: !todo.completed } :
          todo
      )

    case 'COMPLETE_ALL':
      const areAllMarked = state.every(todo => todo.completed)
      return state.map(todo => ({
        ...todo,
        completed: !areAllMarked
      }))

    case 'CLEAR_COMPLETED':
      return state.filter(todo => todo.completed === false)

    default:
      return state
  }
}

const store = createStore(reducer)

interface AppProps extends State {
  dispatch: Dispatch<Action>
}

const App = (props: AppProps) => <div />

const ConnectedApp = connect(
  (state: State) => state,
  (dispatch: Dispatch<Action>) => ({ dispatch }),
)(App)

const providedApp = (
  <Provider store={store}>
    <ConnectedApp />
  </Provider>
)

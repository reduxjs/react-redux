/**
 * Reselect interop. Runs against both implementations via the
 * `react-redux` alias in vitest.config.mts.
 *
 * The interesting interaction is in signals mode: `weakMapMemoize`
 * (Reselect 5's default) caches on the state argument's identity, and
 * the signals implementation passes a tracking proxy as that argument.
 * The proxy for a given state object is cached and reused, so when the
 * hook re-runs a memoized selector with an unchanged state, Reselect
 * short-circuits WITHOUT touching any state properties. Dependency
 * tracking must survive those cache-hit runs — a hook must never end up
 * with an empty dependency set just because one of its evaluations was
 * a memoization hit.
 */
import { configureStore } from '@reduxjs/toolkit'
import * as rtl from '@testing-library/react'
import React from 'react'
import { Provider, useSelector } from 'react-redux'
import { createSelector, lruMemoize, weakMapMemoize } from 'reselect'
import { afterEach, describe, expect, it } from 'vitest'

interface Todo {
  id: number
  text: string
  completed: boolean
}

interface RootState {
  todos: Todo[]
  counter: { value: number }
  filter: { showCompleted: boolean }
}

const initialTodos: Todo[] = [
  { id: 1, text: 'write tests', completed: false },
  { id: 2, text: 'review code', completed: true },
]

const makeStore = () =>
  configureStore({
    reducer: {
      todos: (state: Todo[] = initialTodos, action: any) => {
        switch (action.type) {
          case 'toggle':
            return state.map((t) =>
              t.id === action.id ? { ...t, completed: !t.completed } : t,
            )
          case 'add':
            return [
              ...state,
              { id: action.id, text: action.text, completed: false },
            ]
          case 'editText':
            return state.map((t) =>
              t.id === action.id ? { ...t, text: action.text } : t,
            )
          default:
            return state
        }
      },
      counter: (state: { value: number } = { value: 0 }, action: any) =>
        action.type === 'increment' ? { value: state.value + 1 } : state,
      filter: (state = { showCompleted: true }, action: any) =>
        action.type === 'setFilter' ? { showCompleted: action.payload } : state,
    },
  })

afterEach(() => {
  rtl.cleanup()
})

describe('createSelector with the default weakMapMemoize', () => {
  it('re-renders on relevant changes and skips irrelevant ones', () => {
    const store = makeStore()

    const selectCompletedCount = createSelector(
      [(s: RootState) => s.todos],
      (todos) => todos.filter((t) => t.completed).length,
    )

    let renderCount = 0
    function CompletedCount() {
      renderCount++
      const count = useSelector(selectCompletedCount)
      return <div data-testid="count">{count}</div>
    }

    const { getByTestId } = rtl.render(
      <Provider store={store}>
        <CompletedCount />
      </Provider>,
    )
    expect(getByTestId('count').textContent).toBe('1')
    expect(renderCount).toBe(1)

    // Irrelevant slice: no re-render.
    rtl.act(() => {
      store.dispatch({ type: 'increment' })
    })
    expect(renderCount).toBe(1)

    // Relevant slice: exactly one re-render with the new derived value.
    rtl.act(() => {
      store.dispatch({ type: 'toggle', id: 1 })
    })
    expect(getByTestId('count').textContent).toBe('2')
    expect(renderCount).toBe(2)
  })

  it('does not recompute the result function for unrelated dispatches', () => {
    const store = makeStore()

    let resultRuns = 0
    const selectTodoTexts = createSelector(
      [(s: RootState) => s.todos],
      (todos) => {
        resultRuns++
        return todos.map((t) => t.text)
      },
    )

    function Texts() {
      const texts = useSelector(selectTodoTexts)
      return <div data-testid="texts">{texts.join(',')}</div>
    }

    const { getByTestId } = rtl.render(
      <Provider store={store}>
        <Texts />
      </Provider>,
    )
    expect(getByTestId('texts').textContent).toBe('write tests,review code')

    const runsAfterMount = resultRuns
    expect(runsAfterMount).toBe(1)

    // The counter slice is not an input; the todos array reference is
    // unchanged, so the result function must not run again no matter
    // how many times the wrapper selector itself is evaluated.
    rtl.act(() => {
      store.dispatch({ type: 'increment' })
    })
    rtl.act(() => {
      store.dispatch({ type: 'increment' })
    })
    expect(resultRuns).toBe(runsAfterMount)

    rtl.act(() => {
      store.dispatch({ type: 'add', id: 3, text: 'ship it' })
    })
    expect(getByTestId('texts').textContent).toBe(
      'write tests,review code,ship it',
    )
    expect(resultRuns).toBe(runsAfterMount + 1)
  })

  it('keeps delivering updates after memoization cache hits', () => {
    // A memoization hit skips the selector body entirely — no state
    // properties are touched on that evaluation. If the implementation
    // rebuilt its dependency set from such a run, the hook would go
    // deaf. Force extra evaluations with unchanged state (parent
    // re-renders), then prove a relevant dispatch still lands.
    const store = makeStore()

    const selectFirstTodoText = createSelector(
      [(s: RootState) => s.todos],
      (todos) => todos[0].text,
    )

    function Text() {
      const text = useSelector(selectFirstTodoText)
      return <div data-testid="text">{text}</div>
    }

    function App({ tick }: { tick: number }) {
      return (
        <Provider store={store}>
          <div data-testid="tick">{tick}</div>
          <Text />
        </Provider>
      )
    }

    const { getByTestId, rerender } = rtl.render(<App tick={0} />)
    expect(getByTestId('text').textContent).toBe('write tests')

    // Same store state, new renders: every selector evaluation here is
    // a weakMapMemoize cache hit.
    rerender(<App tick={1} />)
    rerender(<App tick={2} />)
    expect(getByTestId('text').textContent).toBe('write tests')

    rtl.act(() => {
      store.dispatch({ type: 'toggle', id: 1 })
    })
    // toggle replaces the array and the todo object but keeps `text`;
    // the derived value is unchanged.
    expect(getByTestId('text').textContent).toBe('write tests')

    // A real change to the derived value must still come through — this
    // is the assertion that fails if cache-hit evaluations wiped the
    // hook's dependency tracking.
    rtl.act(() => {
      store.dispatch({ type: 'editText', id: 1, text: 'ship it' })
    })
    expect(getByTestId('text').textContent).toBe('ship it')
  })

  it('returns a stable derived object reference across components', () => {
    const store = makeStore()

    const selectVisibleTodos = createSelector(
      [(s: RootState) => s.todos, (s: RootState) => s.filter.showCompleted],
      (todos, showCompleted) =>
        showCompleted ? todos : todos.filter((t) => !t.completed),
    )

    const seenA: Todo[][] = []
    const seenB: Todo[][] = []

    function ListA() {
      seenA.push(useSelector(selectVisibleTodos))
      return null
    }
    function ListB() {
      seenB.push(useSelector(selectVisibleTodos))
      return null
    }

    rtl.render(
      <Provider store={store}>
        <ListA />
        <ListB />
      </Provider>,
    )

    // Both components got the same object from the shared memoized
    // selector, not two structurally-equal copies.
    expect(seenA.at(-1)).toBe(seenB.at(-1))

    rtl.act(() => {
      store.dispatch({ type: 'setFilter', payload: false })
    })
    expect(seenA.at(-1)).toEqual([initialTodos[0]])
    expect(seenA.at(-1)).toBe(seenB.at(-1))
  })

  it('re-renders exactly once when a derived object changes, with shared inputs', () => {
    const store = makeStore()

    const selectIncomplete = createSelector(
      [(s: RootState) => s.todos],
      (todos) => todos.filter((t) => !t.completed),
    )

    let renderCount = 0
    const results: Todo[][] = []
    function Incomplete() {
      renderCount++
      const todos = useSelector(selectIncomplete)
      results.push(todos)
      return <div data-testid="incomplete">{todos.length}</div>
    }

    const { getByTestId } = rtl.render(
      <Provider store={store}>
        <Incomplete />
      </Provider>,
    )
    expect(getByTestId('incomplete').textContent).toBe('1')
    expect(renderCount).toBe(1)

    rtl.act(() => {
      store.dispatch({ type: 'toggle', id: 2 })
    })
    expect(getByTestId('incomplete').textContent).toBe('2')
    expect(renderCount).toBe(2)
    expect(results.at(-1)).not.toBe(results[0])
  })
})

describe('createSelector with lruMemoize', () => {
  it('behaves the same as weakMapMemoize for a single subscriber', () => {
    const store = makeStore()

    let resultRuns = 0
    const selectCounterDouble = createSelector(
      [(s: RootState) => s.counter.value],
      (value) => {
        resultRuns++
        return value * 2
      },
      {
        memoize: lruMemoize,
        argsMemoize: lruMemoize,
        // Reselect's own dev-mode identity check calls the result
        // function one extra time on the first invocation; disable it
        // so the run counts below stay exact.
        devModeChecks: { identityFunctionCheck: 'never' },
      },
    )

    let renderCount = 0
    function Double() {
      renderCount++
      const doubled = useSelector(selectCounterDouble)
      return <div data-testid="double">{doubled}</div>
    }

    const { getByTestId } = rtl.render(
      <Provider store={store}>
        <Double />
      </Provider>,
    )
    expect(getByTestId('double').textContent).toBe('0')
    expect(resultRuns).toBe(1)

    rtl.act(() => {
      store.dispatch({ type: 'toggle', id: 1 })
    })
    expect(renderCount).toBe(1)
    expect(resultRuns).toBe(1)

    rtl.act(() => {
      store.dispatch({ type: 'increment' })
    })
    expect(getByTestId('double').textContent).toBe('2')
    expect(renderCount).toBe(2)
    expect(resultRuns).toBe(2)
  })
})

describe('layered memoized selectors', () => {
  it('a selector composed from other memoized selectors updates correctly', () => {
    const store = makeStore()

    const selectTodos = (s: RootState) => s.todos
    const selectCompleted = createSelector([selectTodos], (todos) =>
      todos.filter((t) => t.completed),
    )
    const selectCompletedCount = createSelector(
      [selectCompleted],
      (completed) => completed.length,
    )
    const selectSummary = createSelector(
      [selectTodos, selectCompletedCount],
      (all, completedCount) => `${completedCount}/${all.length}`,
    )

    let renderCount = 0
    function Summary() {
      renderCount++
      const summary = useSelector(selectSummary)
      return <div data-testid="summary">{summary}</div>
    }

    const { getByTestId } = rtl.render(
      <Provider store={store}>
        <Summary />
      </Provider>,
    )
    expect(getByTestId('summary').textContent).toBe('1/2')
    expect(renderCount).toBe(1)

    rtl.act(() => {
      store.dispatch({ type: 'increment' })
    })
    expect(renderCount).toBe(1)

    rtl.act(() => {
      store.dispatch({ type: 'toggle', id: 1 })
    })
    expect(getByTestId('summary').textContent).toBe('2/2')
    expect(renderCount).toBe(2)

    rtl.act(() => {
      store.dispatch({ type: 'add', id: 3, text: 'third' })
    })
    expect(getByTestId('summary').textContent).toBe('2/3')
    expect(renderCount).toBe(3)
  })

  it('an explicitly weakMapMemoize-configured selector works with per-item lookups', () => {
    const store = makeStore()

    const selectTodoById = createSelector(
      [(s: RootState) => s.todos, (_s: RootState, id: number) => id],
      (todos, id) => todos.find((t) => t.id === id),
      { memoize: weakMapMemoize, argsMemoize: weakMapMemoize },
    )

    function TodoText({ id }: { id: number }) {
      const todo = useSelector((s: RootState) => selectTodoById(s, id))
      return <div data-testid={`todo-${id}`}>{todo?.text}</div>
    }

    const { getByTestId } = rtl.render(
      <Provider store={store}>
        <TodoText id={1} />
        <TodoText id={2} />
      </Provider>,
    )
    expect(getByTestId('todo-1').textContent).toBe('write tests')
    expect(getByTestId('todo-2').textContent).toBe('review code')

    rtl.act(() => {
      store.dispatch({ type: 'toggle', id: 1 })
    })
    expect(getByTestId('todo-1').textContent).toBe('write tests')
    expect(getByTestId('todo-2').textContent).toBe('review code')
  })
})

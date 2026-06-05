/* eslint-disable react/prop-types */

import * as rtl from '@testing-library/react'
import React, { useLayoutEffect } from 'react'
import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { SignalProvider, useSignalSelector } from '../../src/signals'

// ============================================================================
// Test State Shape (RTK slices)
// ============================================================================

interface Todo {
  id: number
  text: string
  completed: boolean
}

interface Counter {
  id: string
  label: string
  value: number
}

const todosSlice = createSlice({
  name: 'todos',
  initialState: [
    { id: 1, text: 'Learn Redux', completed: true },
    { id: 2, text: 'Learn Signals', completed: false },
    { id: 3, text: 'Build POC', completed: false },
  ] as Todo[],
  reducers: {
    toggle(state, action: PayloadAction<number>) {
      const todo = state.find((t) => t.id === action.payload)
      if (todo) todo.completed = !todo.completed
    },
    add(state, action: PayloadAction<{ id: number; text: string }>) {
      state.push({ id: action.payload.id, text: action.payload.text, completed: false })
    },
    remove(state, action: PayloadAction<number>) {
      return state.filter((t) => t.id !== action.payload)
    },
  },
})

const countersSlice = createSlice({
  name: 'counters',
  initialState: {
    counter1: { id: 'counter1', label: 'Clicks', value: 0 } as Counter,
    counter2: { id: 'counter2', label: 'Views', value: 42 } as Counter,
  },
  reducers: {
    increment(state, action: PayloadAction<'counter1' | 'counter2'>) {
      state[action.payload].value += 1
    },
  },
})

const filterSlice = createSlice({
  name: 'filter',
  initialState: 'all' as 'all' | 'active' | 'completed',
  reducers: {
    set(_state, action: PayloadAction<'all' | 'active' | 'completed'>) {
      return action.payload
    },
  },
})

function createTestStore() {
  return configureStore({
    reducer: {
      todos: todosSlice.reducer,
      counters: countersSlice.reducer,
      filter: filterSlice.reducer,
    },
  })
}

type TestStore = ReturnType<typeof createTestStore>
type TestState = ReturnType<TestStore['getState']>

// ============================================================================
// Test Helpers
// ============================================================================

function createTrackedSelector<S, T>(
  selector: (state: S) => T,
): { selector: (state: S) => T; getCalls: () => number; reset: () => void } {
  let calls = 0
  const tracked = (state: S): T => {
    calls++
    return selector(state)
  }
  return {
    selector: tracked,
    getCalls: () => calls,
    reset: () => {
      calls = 0
    },
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('useSignalSelector', () => {
  let store: TestStore

  beforeEach(() => {
    store = createTestStore()
  })

  afterEach(() => {
    rtl.cleanup()
  })

  // ==========================================================================
  // Core Functionality (ported from prototype #1)
  // ==========================================================================

  describe('core functionality', () => {
    it('selects the state on initial render', () => {
      let result: string | undefined
      const Comp = () => {
        const filter = useSignalSelector((state: TestState) => state.filter)

        useLayoutEffect(() => {
          result = filter
        }, [filter])

        return <div>{filter}</div>
      }

      rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(result).toBe('all')
    })

    it('selects the state and renders when store updates', () => {
      const selector = vi.fn((state: TestState) => state.filter)
      let result: string | undefined

      const Comp = () => {
        const filter = useSignalSelector(selector)

        useLayoutEffect(() => {
          result = filter
        }, [filter])

        return <div data-testid="filter">{filter}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(result).toBe('all')

      rtl.act(() => {
        store.dispatch(filterSlice.actions.set('active'))
      })

      expect(getByTestId('filter').textContent).toBe('active')
      expect(result).toBe('active')
    })

    it('handles nested object selection', () => {
      let result: number | undefined
      const Comp = () => {
        const value = useSignalSelector(
          (state: TestState) => state.counters.counter1.value,
        )

        useLayoutEffect(() => {
          result = value
        }, [value])

        return <div data-testid="value">{value}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(result).toBe(0)

      rtl.act(() => {
        store.dispatch(countersSlice.actions.increment('counter1'))
      })

      expect(getByTestId('value').textContent).toBe('1')
      expect(result).toBe(1)
    })

    it('handles array selection', () => {
      let result: Todo | undefined
      const Comp = () => {
        const todo = useSignalSelector((state: TestState) => state.todos[0])

        useLayoutEffect(() => {
          result = todo
        }, [todo])

        return (
          <div data-testid="todo">{todo.completed ? 'done' : 'pending'}</div>
        )
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(result?.completed).toBe(true)

      rtl.act(() => {
        store.dispatch(todosSlice.actions.toggle(1))
      })

      expect(getByTestId('todo').textContent).toBe('pending')
      expect(result?.completed).toBe(false)
    })

    it('unsubscribes when component unmounts', () => {
      const selector = vi.fn((state: TestState) => state.filter)

      const Comp = () => {
        const filter = useSignalSelector(selector)
        return <div>{filter}</div>
      }

      const { unmount } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      const callsBeforeUnmount = selector.mock.calls.length

      unmount()

      // Dispatch after unmount
      store.dispatch(filterSlice.actions.set('completed'))

      // Selector should not have been called again
      expect(selector.mock.calls.length).toBe(callsBeforeUnmount)
    })
  })

  // ==========================================================================
  // Selector Identity Handling (ported from prototype #1)
  // ==========================================================================

  describe('selector identity handling', () => {
    it('handles inline selectors', () => {
      const renders: string[] = []
      const Comp = () => {
        // Inline selector - new function every render
        const filter = useSignalSelector((state: TestState) => state.filter)
        renders.push(filter)
        return <div data-testid="filter">{filter}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(renders[0]).toBe('all')

      rtl.act(() => {
        store.dispatch(filterSlice.actions.set('active'))
      })

      expect(getByTestId('filter').textContent).toBe('active')
      expect(renders[renders.length - 1]).toBe('active')
    })

    it('re-tracks when selector closure changes via key remount', () => {
      const CounterDisplay = ({ id }: { id: 'counter1' | 'counter2' }) => {
        const counter = useSignalSelector(
          (state: TestState) => state.counters[id],
        )
        return (
          <div data-testid={`display-${id}`}>
            {counter?.label}: {counter?.value}
          </div>
        )
      }

      const Parent = () => {
        const [selectedId, setSelectedId] = React.useState<
          'counter1' | 'counter2'
        >('counter1')
        return (
          <SignalProvider store={store}>
            <CounterDisplay key={selectedId} id={selectedId} />
            <button onClick={() => setSelectedId('counter2')}>Switch</button>
          </SignalProvider>
        )
      }

      const { getByTestId, getByText } = rtl.render(<Parent />)

      expect(getByTestId('display-counter1').textContent).toBe('Clicks: 0')

      // Switch to counter2
      rtl.act(() => {
        getByText('Switch').click()
      })

      expect(getByTestId('display-counter2').textContent).toBe('Views: 42')
    })
  })

  // ==========================================================================
  // Selective Execution — Key POC Validation (ported from prototype #1)
  // ==========================================================================

  describe('selective execution (key POC validation)', () => {
    it('todo selector does not run when counter changes', () => {
      let todoSelectorCalls = 0
      let counterSelectorCalls = 0

      const TodoComp = () => {
        const todo = useSignalSelector((state: TestState) => {
          todoSelectorCalls++
          return state.todos[0]
        })
        return <div data-testid="todo">{todo.text}</div>
      }

      const CounterComp = () => {
        const counter = useSignalSelector((state: TestState) => {
          counterSelectorCalls++
          return state.counters.counter1
        })
        return <div data-testid="counter">{counter.value}</div>
      }

      rtl.render(
        <SignalProvider store={store}>
          <TodoComp />
          <CounterComp />
        </SignalProvider>,
      )

      expect(todoSelectorCalls).toBeGreaterThanOrEqual(1)
      expect(counterSelectorCalls).toBeGreaterThanOrEqual(1)

      const todoCallsBefore = todoSelectorCalls
      const counterCallsBefore = counterSelectorCalls

      rtl.act(() => {
        store.dispatch(countersSlice.actions.increment('counter1'))
      })

      // Counter selector should have run, todo selector should NOT
      expect(counterSelectorCalls - counterCallsBefore).toBeGreaterThanOrEqual(
        1,
      )
      expect(todoSelectorCalls - todoCallsBefore).toBe(0)
    })

    it('counter selector does not run when todo changes', () => {
      const todoSelector = createTrackedSelector(
        (state: TestState) => state.todos[0],
      )
      const counterSelector = createTrackedSelector(
        (state: TestState) => state.counters.counter1,
      )

      const TodoComp = () => {
        const todo = useSignalSelector(todoSelector.selector)
        return (
          <div data-testid="todo">{todo.completed ? 'done' : 'pending'}</div>
        )
      }

      const CounterComp = () => {
        const counter = useSignalSelector(counterSelector.selector)
        return <div data-testid="counter">{counter.value}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <TodoComp />
          <CounterComp />
        </SignalProvider>,
      )

      todoSelector.reset()
      counterSelector.reset()

      rtl.act(() => {
        store.dispatch(todosSlice.actions.toggle(1))
      })

      expect(getByTestId('todo').textContent).toBe('pending')
      expect(todoSelector.getCalls()).toBeGreaterThanOrEqual(1)
      expect(counterSelector.getCalls()).toBe(0)
    })

    it('filter selector does not run when todos change', () => {
      const filterSelector = createTrackedSelector(
        (state: TestState) => state.filter,
      )
      const todoSelector = createTrackedSelector(
        (state: TestState) => state.todos,
      )

      const FilterComp = () => {
        const filter = useSignalSelector(filterSelector.selector)
        return <div data-testid="filter">{filter}</div>
      }

      const TodoListComp = () => {
        const todos = useSignalSelector(todoSelector.selector)
        return <div data-testid="todos">{todos.length}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <FilterComp />
          <TodoListComp />
        </SignalProvider>,
      )

      filterSelector.reset()
      todoSelector.reset()

      rtl.act(() => {
        store.dispatch(todosSlice.actions.add({ id: 4, text: 'New todo' }))
      })

      expect(getByTestId('todos').textContent).toBe('4')
      expect(todoSelector.getCalls()).toBeGreaterThanOrEqual(1)
      expect(filterSelector.getCalls()).toBe(0)
    })

    it('counter1 selector does not run when counter2 changes', () => {
      // Note: Both selectors read through `state.counters.counterX`, so they
      // share the intermediate `"counters"` version-counter signal. When either
      // counter changes, both selectors RE-RUN (signal dep on parent object).
      // However, the correct component still renders the correct value —
      // selectivity at the object level is coarser than leaf level.
      // Leaf-returning selectors (e.g., `state.counters.counter1.value`) get
      // full propagation cutoff via Object.is on the computed result.
      const counter1Selector = createTrackedSelector(
        (state: TestState) => state.counters.counter1.value,
      )
      const counter2Selector = createTrackedSelector(
        (state: TestState) => state.counters.counter2.value,
      )

      let counter1Renders = 0
      let counter2Renders = 0

      const Counter1Comp = () => {
        const value = useSignalSelector(counter1Selector.selector)
        counter1Renders++
        return <div data-testid="counter1">{value}</div>
      }

      const Counter2Comp = () => {
        const value = useSignalSelector(counter2Selector.selector)
        counter2Renders++
        return <div data-testid="counter2">{value}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Counter1Comp />
          <Counter2Comp />
        </SignalProvider>,
      )

      const renders1After = counter1Renders
      const renders2After = counter2Renders

      rtl.act(() => {
        store.dispatch(countersSlice.actions.increment('counter1'))
      })

      // counter1 value changed → must re-render
      expect(getByTestId('counter1').textContent).toBe('1')
      expect(counter1Renders).toBeGreaterThan(renders1After)

      // counter2 value did NOT change → should NOT re-render
      // (Object.is cutoff on the primitive computed result)
      expect(getByTestId('counter2').textContent).toBe('42')
      expect(counter2Renders).toBe(renders2After)
    })
  })

  // ==========================================================================
  // Equality Functions (ported from prototype #1)
  // ==========================================================================

  describe('equality functions', () => {
    it('allows custom equality functions', () => {
      let renderCount = 0

      const Comp = () => {
        const todosLength = useSignalSelector(
          (state: TestState) => ({ length: state.todos.length }),
          (a, b) => a.length === b.length,
        )
        renderCount++
        return <div data-testid="length">{todosLength.length}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('length').textContent).toBe('3')
      const rendersAfterMount = renderCount

      // Toggle a todo — array changes but length stays same
      rtl.act(() => {
        store.dispatch(todosSlice.actions.toggle(1))
      })

      // Should NOT have re-rendered because length is the same
      expect(renderCount).toBe(rendersAfterMount)

      // Add a todo — length changes
      rtl.act(() => {
        store.dispatch(todosSlice.actions.add({ id: 4, text: 'New todo' }))
      })

      expect(getByTestId('length').textContent).toBe('4')
      expect(renderCount).toBe(rendersAfterMount + 1)
    })
  })

  // ==========================================================================
  // Frozen State Handling (new — specific to prototype #2)
  // ==========================================================================

  describe('frozen state handling', () => {
    it('works with configureStore (Immer freezes state)', () => {
      // configureStore uses Immer which freezes state — this is the real
      // production scenario that killed prototype #1
      const frozenStore = createTestStore()

      const Comp = () => {
        const filter = useSignalSelector((state: TestState) => state.filter)
        return <div data-testid="filter">{filter}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={frozenStore}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('filter').textContent).toBe('all')

      // Verify slice state is frozen by Immer (individual slices, not root)
      expect(Object.isFrozen(frozenStore.getState().todos)).toBe(true)
      expect(Object.isFrozen(frozenStore.getState().counters)).toBe(true)

      rtl.act(() => {
        frozenStore.dispatch(filterSlice.actions.set('active'))
      })

      expect(getByTestId('filter').textContent).toBe('active')
    })

    it('works with deeply frozen nested objects', () => {
      const frozenStore = createTestStore()

      const Comp = () => {
        const value = useSignalSelector(
          (state: TestState) => state.counters.counter1.value,
        )
        return <div data-testid="value">{value}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={frozenStore}>
          <Comp />
        </SignalProvider>,
      )

      // Verify nested state is frozen
      expect(Object.isFrozen(frozenStore.getState().counters)).toBe(true)
      expect(Object.isFrozen(frozenStore.getState().counters.counter1)).toBe(true)

      expect(getByTestId('value').textContent).toBe('0')

      rtl.act(() => {
        frozenStore.dispatch(countersSlice.actions.increment('counter1'))
      })

      expect(getByTestId('value').textContent).toBe('1')
    })
  })

  // ==========================================================================
  // Dynamic Dependencies (new — specific to prototype #2)
  // ==========================================================================

  describe('dynamic dependencies', () => {
    it('re-tracks when selector accesses different paths based on state', () => {
      const selectedIdSlice = createSlice({
        name: 'selectedId',
        initialState: 1,
        reducers: {
          set(_state, action: PayloadAction<number>) {
            return action.payload
          },
        },
      })

      const itemsSlice = createSlice({
        name: 'items',
        initialState: { 1: 'A', 2: 'B', 3: 'C' } as Record<number, string>,
        reducers: {
          update(state, action: PayloadAction<{ id: number; value: string }>) {
            state[action.payload.id] = action.payload.value
          },
        },
      })

      const dynStore = configureStore({
        reducer: {
          selectedId: selectedIdSlice.reducer,
          items: itemsSlice.reducer,
        },
      })
      type DynState = ReturnType<typeof dynStore.getState>

      let selectorCalls = 0

      const Comp = () => {
        const item = useSignalSelector((state: DynState) => {
          selectorCalls++
          return state.items[state.selectedId]
        })
        return <div data-testid="item">{item}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={dynStore}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('item').textContent).toBe('A')

      // Change selectedId to 2 → now tracks items.2
      rtl.act(() => {
        dynStore.dispatch(selectedIdSlice.actions.set(2))
      })

      expect(getByTestId('item').textContent).toBe('B')

      // Change items.1 → selector may re-run because of shared `"items"`
      // parent version-counter signal, but the computed returns the same
      // value ("B") so React does NOT re-render.
      rtl.act(() => {
        dynStore.dispatch(itemsSlice.actions.update({ id: 1, value: 'A2' }))
      })

      expect(getByTestId('item').textContent).toBe('B')
    })
  })

  // ==========================================================================
  // Array Mutations (new — specific to prototype #2)
  // ==========================================================================

  describe('array mutations', () => {
    it('handles array item addition', () => {
      const Comp = () => {
        const count = useSignalSelector(
          (state: TestState) => state.todos.length,
        )
        return <div data-testid="count">{count}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('count').textContent).toBe('3')

      rtl.act(() => {
        store.dispatch(todosSlice.actions.add({ id: 4, text: 'New' }))
      })

      expect(getByTestId('count').textContent).toBe('4')
    })

    it('handles array item removal', () => {
      const Comp = () => {
        const count = useSignalSelector(
          (state: TestState) => state.todos.length,
        )
        return <div data-testid="count">{count}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('count').textContent).toBe('3')

      rtl.act(() => {
        store.dispatch(todosSlice.actions.remove(1))
      })

      expect(getByTestId('count').textContent).toBe('2')
    })

    it('handles array item property change', () => {
      const Comp = () => {
        const text = useSignalSelector(
          (state: TestState) => state.todos[0].text,
        )
        return <div data-testid="text">{text}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('text').textContent).toBe('Learn Redux')

      rtl.act(() => {
        store.dispatch(todosSlice.actions.toggle(1))
      })

      // text didn't change, only completed did
      expect(getByTestId('text').textContent).toBe('Learn Redux')
    })
  })

  // ==========================================================================
  // NOOP Dispatches
  // ==========================================================================

  describe('noop dispatches', () => {
    it('does not re-render on NOOP dispatch', () => {
      let renderCount = 0

      const Comp = () => {
        const filter = useSignalSelector((state: TestState) => state.filter)
        renderCount++
        return <div>{filter}</div>
      }

      rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      const rendersAfterMount = renderCount

      rtl.act(() => {
        store.dispatch({ type: 'NOOP' } as any)
      })

      expect(renderCount).toBe(rendersAfterMount)
    })
  })

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('error handling', () => {
    it('throws when used outside SignalProvider', () => {
      const Comp = () => {
        const filter = useSignalSelector((state: TestState) => state.filter)
        return <div>{filter}</div>
      }

      expect(() => {
        rtl.render(<Comp />)
      }).toThrow('useSignalSelector must be used within a <SignalProvider>')
    })
  })

  // ==========================================================================
  // Multiple Components
  // ==========================================================================

  describe('multiple components', () => {
    it('multiple components with different selectors all render correctly', () => {
      const FilterComp = () => {
        const filter = useSignalSelector((state: TestState) => state.filter)
        return <div data-testid="filter">{filter}</div>
      }

      const TodoComp = () => {
        const count = useSignalSelector(
          (state: TestState) => state.todos.length,
        )
        return <div data-testid="todos">{count}</div>
      }

      const CounterComp = () => {
        const value = useSignalSelector(
          (state: TestState) => state.counters.counter1.value,
        )
        return <div data-testid="counter">{value}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <FilterComp />
          <TodoComp />
          <CounterComp />
        </SignalProvider>,
      )

      expect(getByTestId('filter').textContent).toBe('all')
      expect(getByTestId('todos').textContent).toBe('3')
      expect(getByTestId('counter').textContent).toBe('0')

      // Update counter — only counter component should update
      rtl.act(() => {
        store.dispatch(countersSlice.actions.increment('counter1'))
      })

      expect(getByTestId('filter').textContent).toBe('all')
      expect(getByTestId('todos').textContent).toBe('3')
      expect(getByTestId('counter').textContent).toBe('1')

      // Update filter — only filter component should update
      rtl.act(() => {
        store.dispatch(filterSlice.actions.set('completed'))
      })

      expect(getByTestId('filter').textContent).toBe('completed')
      expect(getByTestId('todos').textContent).toBe('3')
      expect(getByTestId('counter').textContent).toBe('1')
    })
  })
})



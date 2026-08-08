/* eslint-disable react/prop-types */

import * as rtl from '@testing-library/react'
import React, { useLayoutEffect } from 'react'
import {
  configureStore,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit'
import { SignalProvider, useSignalSelector } from '../../src/signals'

// ============================================================================
// Test: Object Identity Comparison in Selectors
//
// Investigates whether selectors relying on object identity (===, Object.is)
// are correctly tracked by our path-signal tracking proxy architecture.
//
// ROOT CAUSE OF FAILURES:
// When the tracking proxy's `get` trap encounters an object value, it calls
// `registry.ensurePrefix(pathKey)` — which registers the path in the prefix
// index but does NOT create a signal or establish a reactive dependency.
// Only primitive leaf values call `registry.getOrCreate(pathKey, value).get()`
// which creates a signal and reads it (establishing dep via alien-signals).
//
// When a selector does `state.a === state.b` (both objects), the get trap
// fires for both reads, but since both are objects, only ensurePrefix is
// called. The selector's computed ends up with ZERO signal dependencies.
// It never re-runs, regardless of state changes.
//
// ADDITIONAL ISSUE: Array.includes() override
// The `includes` override calls `target[m](...args)` on the raw frozen array,
// but the search argument is a proxy (e.g., `state.selectedItem`). Since
// `proxy !== rawObject`, `includes` always returns false for object elements.
//
// CORRECTLY WORKING:
// - Proxy cache ensures same underlying object → same proxy instance, so
//   `state.draft === state.published` returns the correct boolean initially
// - Selectors that access primitive properties of objects work fine
// - `useSignalSelector` terminal proxy detection works when selector returns
//   an object (proxy), but doesn't help when selector returns a boolean
// ============================================================================

// ============================================================================
// Store Setup
// ============================================================================

interface Item {
  id: number
  name: string
}

interface NestedObj {
  label: string
}

interface IdentityTestState {
  items: Item[]
  selectedItem: Item | null
  draft: Record<string, unknown> | null
  published: Record<string, unknown> | null
  current: Record<string, unknown>
  saved: Record<string, unknown>
  listA: Item[]
  setB: number[] // IDs in set B
  // Additional fields for edge case tests
  objA: NestedObj
  objB: NestedObj
  deep: { nested: { target: NestedObj } }
  maybeNull: NestedObj | null
  siblingPrimitive: number
}

const initialItems: Item[] = [
  { id: 1, name: 'Alpha' },
  { id: 2, name: 'Beta' },
  { id: 3, name: 'Gamma' },
]

const sharedObj = { title: 'shared', version: 1 }
const sharedNested: NestedObj = { label: 'shared-nested' }

const identitySlice = createSlice({
  name: 'identity',
  initialState: {
    items: initialItems,
    selectedItem: initialItems[0], // same ref as items[0]
    draft: sharedObj,
    published: sharedObj, // same ref as draft
    current: { x: 1 } as Record<string, unknown>,
    saved: { x: 1 } as Record<string, unknown>, // different ref, same value
    listA: initialItems,
    setB: [1, 3], // IDs of items in set B
    objA: sharedNested,
    objB: sharedNested, // same ref as objA
    deep: { nested: { target: sharedNested } },
    maybeNull: sharedNested as NestedObj | null,
    siblingPrimitive: 0,
  } as IdentityTestState,
  reducers: {
    selectItem(state, action: PayloadAction<number>) {
      state.selectedItem = state.items[action.payload] ?? null
    },
    clearSelection(state) {
      state.selectedItem = null
    },
    publishDraft(state) {
      // Make draft and published point to the same new object
      const newObj = { title: 'updated', version: 2 }
      state.draft = newObj
      state.published = newObj
    },
    divergeDraftFromPublished(state) {
      // Make draft differ from published
      state.draft = { title: 'draft-v2', version: 3 }
      // published stays at its current value
    },
    syncCurrentToSaved(state) {
      // Make current and saved point to the same ref
      // In Immer, both get new refs but with same content
      state.saved = { ...state.current }
    },
    mutateCurrent(state) {
      state.current = { x: 999 }
    },
    addToSetB(state, action: PayloadAction<number>) {
      state.setB.push(action.payload)
    },
    removeFromSetB(state, action: PayloadAction<number>) {
      state.setB = state.setB.filter((id) => id !== action.payload)
    },
    updateItemName(
      state,
      action: PayloadAction<{ index: number; name: string }>,
    ) {
      state.items[action.payload.index].name = action.payload.name
    },
    replaceItems(state, action: PayloadAction<Item[]>) {
      state.items = action.payload
      // selectedItem is now stale (points to old array's item)
    },
    // Edge case reducers
    setObjA(state, action: PayloadAction<NestedObj>) {
      state.objA = action.payload
    },
    setObjB(state, action: PayloadAction<NestedObj>) {
      state.objB = action.payload
    },
    setDeepTarget(state, action: PayloadAction<NestedObj>) {
      state.deep.nested.target = action.payload
    },
    setMaybeNull(state, action: PayloadAction<NestedObj | null>) {
      state.maybeNull = action.payload
    },
    bumpSiblingPrimitive(state) {
      state.siblingPrimitive += 1
    },
  },
})

function createIdentityStore() {
  return configureStore({
    reducer: {
      identity: identitySlice.reducer,
    },
  })
}

type IdentityStore = ReturnType<typeof createIdentityStore>
type RootState = ReturnType<IdentityStore['getState']>

// ============================================================================
// Tests
// ============================================================================

describe('object identity comparison in selectors', () => {
  let store: IdentityStore

  beforeEach(() => {
    store = createIdentityStore()
  })

  afterEach(() => {
    rtl.cleanup()
  })

  // ==========================================================================
  // Pattern 1: selectedItem === items[i]
  //
  // A selector reads state.selectedItem and state.items[i] and compares them.
  // The proxy's get trap fires for both reads. The question is whether the
  // dependency tracking is sufficient to re-run when selectedItem changes
  // to point to a different object.
  // ==========================================================================

  describe('Pattern 1: selectedItem === items[i]', () => {
    it('detects when selectedItem is the same ref as items[0]', () => {
      const Comp = () => {
        const isSelected = useSignalSelector(
          (state: RootState) =>
            state.identity.selectedItem === state.identity.items[0],
        )
        return <div data-testid="result">{String(isSelected)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      // Initially selectedItem is items[0] (same ref in initialState)
      expect(getByTestId('result').textContent).toBe('true')
    })

    // KNOWN FAILURE: selector reads two objects (selectedItem, items[0]) but
    // never accesses a primitive property on either. The tracking proxy only
    // calls ensurePrefix for objects — no signal dependency is created.
    // The computed has zero reactive sources and never re-runs.
    it('updates when selectedItem changes to a different item', () => {
      let selectorCalls = 0

      const Comp = () => {
        const isSelected = useSignalSelector((state: RootState) => {
          selectorCalls++
          return state.identity.selectedItem === state.identity.items[0]
        })
        return <div data-testid="result">{String(isSelected)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('true')
      const callsAfterMount = selectorCalls

      // Change selection to items[1] — selectedItem now differs from items[0]
      rtl.act(() => {
        store.dispatch(identitySlice.actions.selectItem(1))
      })

      // The selector MUST re-run and return false
      expect(getByTestId('result').textContent).toBe('false')
      expect(selectorCalls).toBeGreaterThan(callsAfterMount)
    })

    // KNOWN FAILURE: same root cause — selectedItem changes from an object
    // proxy to null, but no signal was tracking the selectedItem path.
    it('updates when selectedItem becomes null', () => {
      const Comp = () => {
        const isSelected = useSignalSelector(
          (state: RootState) =>
            state.identity.selectedItem === state.identity.items[0],
        )
        return <div data-testid="result">{String(isSelected)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('true')

      rtl.act(() => {
        store.dispatch(identitySlice.actions.clearSelection())
      })

      expect(getByTestId('result').textContent).toBe('false')
    })

    it('updates when items array is replaced (selected item becomes stale)', () => {
      const Comp = () => {
        const isSelected = useSignalSelector(
          (state: RootState) =>
            state.identity.selectedItem === state.identity.items[0],
        )
        return <div data-testid="result">{String(isSelected)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('true')

      // Replace items array entirely — selectedItem still points to old item
      rtl.act(() => {
        store.dispatch(
          identitySlice.actions.replaceItems([
            { id: 10, name: 'New Alpha' },
            { id: 20, name: 'New Beta' },
          ]),
        )
      })

      // selectedItem is the old {id:1, name:'Alpha'}, items[0] is now {id:10, name:'New Alpha'}
      // These are different refs → should be false
      expect(getByTestId('result').textContent).toBe('false')
    })
  })

  // ==========================================================================
  // Pattern 2: draft === published (cross-slice identity)
  //
  // Two state branches might point to the same object. Selector checks
  // if they are identical.
  // ==========================================================================

  describe('Pattern 2: draft === published', () => {
    it('detects when draft and published are the same ref', () => {
      const Comp = () => {
        const isSynced = useSignalSelector(
          (state: RootState) =>
            state.identity.draft === state.identity.published,
        )
        return <div data-testid="result">{String(isSynced)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      // Initially draft and published are the same object ref
      expect(getByTestId('result').textContent).toBe('true')
    })

    // KNOWN FAILURE: draft and published are both objects. The selector
    // compares their identity but never reads any primitive property.
    // Zero signal deps → computed never re-runs.
    it('updates when draft diverges from published', () => {
      const Comp = () => {
        const isSynced = useSignalSelector(
          (state: RootState) =>
            state.identity.draft === state.identity.published,
        )
        return <div data-testid="result">{String(isSynced)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('true')

      rtl.act(() => {
        store.dispatch(identitySlice.actions.divergeDraftFromPublished())
      })

      expect(getByTestId('result').textContent).toBe('false')
    })

    it('stays true when both draft and published are updated to same new ref', () => {
      const Comp = () => {
        const isSynced = useSignalSelector(
          (state: RootState) =>
            state.identity.draft === state.identity.published,
        )
        return <div data-testid="result">{String(isSynced)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('true')

      // Both draft and published get set to the same new object
      rtl.act(() => {
        store.dispatch(identitySlice.actions.publishDraft())
      })

      // After Immer, these will be different refs (Immer creates new objects)
      // but the selector should still reflect the actual state
      const state = store.getState()
      const expectedResult = state.identity.draft === state.identity.published
      expect(getByTestId('result').textContent).toBe(String(expectedResult))
    })
  })

  // ==========================================================================
  // Pattern 3: current !== saved (boolean from identity comparison)
  //
  // Selector returns a boolean based on whether two objects are the same ref.
  // This is the "has unsaved changes" pattern.
  // ==========================================================================

  describe('Pattern 3: current !== saved (unsaved changes detection)', () => {
    it('returns true when current and saved are different refs', () => {
      const Comp = () => {
        const hasChanges = useSignalSelector(
          (state: RootState) =>
            state.identity.current !== state.identity.saved,
        )
        return <div data-testid="result">{String(hasChanges)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      // Initially current and saved are different objects (even though same values)
      expect(getByTestId('result').textContent).toBe('true')
    })

    // KNOWN FAILURE: selector reads current and saved (objects), compares
    // identity, returns boolean. No signal deps created for object-only reads.
    // The selector never re-runs even when current is replaced.
    it('updates when current is mutated', () => {
      let selectorCalls = 0

      const Comp = () => {
        const hasChanges = useSignalSelector((state: RootState) => {
          selectorCalls++
          return state.identity.current !== state.identity.saved
        })
        return <div data-testid="result">{String(hasChanges)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('true')
      const callsAfterMount = selectorCalls

      // Mutate current — it was already !== saved, stays that way
      // But selector should still re-run because current's ref changed
      rtl.act(() => {
        store.dispatch(identitySlice.actions.mutateCurrent())
      })

      // Result is still true, but selector should have re-run due to
      // the version counter on identity.current changing
      expect(getByTestId('result').textContent).toBe('true')
      // We expect the selector to have been re-evaluated
      expect(selectorCalls).toBeGreaterThan(callsAfterMount)
    })
  })

  // ==========================================================================
  // Pattern 4: Reading object ref without accessing properties
  //
  // The selector reads an object but only uses it for identity comparison,
  // never accessing any of its properties. Does the proxy still track this?
  // ==========================================================================

  describe('Pattern 4: object ref read without property access', () => {
    it('tracks object ref changes via proxy version counter', () => {
      // This selector reads state.identity.current (an object) but doesn't
      // access any of its properties. It just checks if the ref exists.
      const Comp = () => {
        const hasCurrent = useSignalSelector(
          (state: RootState) => state.identity.current != null,
        )
        return <div data-testid="result">{String(hasCurrent)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('true')
    })

    it('selector re-runs when object ref changes even without property access', () => {
      let selectorCalls = 0

      // This is the tricky case: the selector reads two object refs and
      // compares them, but never accesses any property inside either object.
      // The proxy's get trap fires to return the child proxy, but
      // ensurePrefix is called (NOT getOrCreate). No signal dependency is
      // established for intermediate objects.
      //
      // HOWEVER: useSignalSelector checks if the result is a proxy and
      // explicitly reads its signal. But here the result is a boolean,
      // not a proxy. So we rely on intermediate version counters.
      const Comp = () => {
        const isSame = useSignalSelector((state: RootState) => {
          selectorCalls++
          // Read two object refs — get trap fires for each
          const current = state.identity.current
          const saved = state.identity.saved
          // Compare identity — no property access on either
          return current === saved
        })
        return <div data-testid="result">{String(isSame)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      // Initially different refs
      expect(getByTestId('result').textContent).toBe('false')
      const callsAfterMount = selectorCalls

      // Mutate current to a new object — still !== saved
      rtl.act(() => {
        store.dispatch(identitySlice.actions.mutateCurrent())
      })

      // The result is still false (different refs), so even if selector
      // re-runs, the component may not re-render.
      // The key question: does the selector re-run at all?
      expect(getByTestId('result').textContent).toBe('false')
    })

    it('detects identity change when result flips from false to true', () => {
      // Start with current !== saved, then sync them.
      // This is the critical test: if no deps are tracked for the object
      // reads, the selector won't re-run and the UI stays stale.
      const Comp = () => {
        const isSame = useSignalSelector((state: RootState) => {
          const current = state.identity.current
          const saved = state.identity.saved
          return current === saved
        })
        return <div data-testid="result">{String(isSame)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('false')

      // Sync saved to match current
      rtl.act(() => {
        store.dispatch(identitySlice.actions.syncCurrentToSaved())
      })

      // After Immer, saved gets a new object with same content as current.
      // But Immer creates a new ref for saved, so current !== saved still.
      // Let's check what the store actually has:
      const state = store.getState()
      const expected = state.identity.current === state.identity.saved
      expect(getByTestId('result').textContent).toBe(String(expected))
    })
  })

  // ==========================================================================
  // Pattern 5: Array.includes / Set.has with object identity
  //
  // Selectors that use methods relying on identity comparison internally.
  // ==========================================================================

  describe('Pattern 5: identity-based collection methods', () => {
    it('tracks when using manual identity check across arrays', () => {
      // Selector: find items from listA whose id is in setB
      const Comp = () => {
        const matchingItems = useSignalSelector((state: RootState) => {
          const setBIds = new Set(state.identity.setB)
          return state.identity.listA.filter((item) => setBIds.has(item.id))
        })
        return (
          <div data-testid="result">
            {matchingItems.map((i) => i.name).join(',')}
          </div>
        )
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      // setB has ids [1, 3], so Alpha and Gamma match
      expect(getByTestId('result').textContent).toBe('Alpha,Gamma')

      // Add id 2 to setB
      rtl.act(() => {
        store.dispatch(identitySlice.actions.addToSetB(2))
      })

      expect(getByTestId('result').textContent).toBe('Alpha,Beta,Gamma')
    })

    it('updates when setB changes to exclude an item', () => {
      const Comp = () => {
        const matchingItems = useSignalSelector((state: RootState) => {
          const setBIds = new Set(state.identity.setB)
          return state.identity.listA.filter((item) => setBIds.has(item.id))
        })
        return (
          <div data-testid="result">
            {matchingItems.map((i) => i.name).join(',')}
          </div>
        )
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('Alpha,Gamma')

      // Remove id 1 from setB
      rtl.act(() => {
        store.dispatch(identitySlice.actions.removeFromSetB(1))
      })

      expect(getByTestId('result').textContent).toBe('Gamma')
    })

    // KNOWN FAILURE (different root cause): Array.includes override calls
    // `target[m](...args)` on the RAW frozen array, but the search argument
    // `state.identity.selectedItem` is a PROXY. Since proxy !== rawObject,
    // includes always returns false for object elements.
    // This is a bug in arrayMethodOverrides.ts — the search arg should be
    // unwrapped to its raw target before passing to the native method.
    it('selector using Array.includes with object identity', () => {
      // This test creates a scenario where Array.includes is used with
      // object references. Array.includes uses ===.
      const Comp = () => {
        const isFirstItemSelected = useSignalSelector((state: RootState) => {
          // This is subtle: state.identity.items is a proxy, and
          // state.identity.selectedItem is also a proxy.
          // Array.includes on a proxy array checks if the proxy of
          // selectedItem is in the proxy array.
          return state.identity.items.includes(state.identity.selectedItem as Item)
        })
        return <div data-testid="result">{String(isFirstItemSelected)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      // selectedItem is items[0], and items includes it
      expect(getByTestId('result').textContent).toBe('true')

      // Clear selection — null is not in items
      rtl.act(() => {
        store.dispatch(identitySlice.actions.clearSelection())
      })

      expect(getByTestId('result').textContent).toBe('false')
    })
  })

  // ==========================================================================
  // Pattern 6: Selective re-execution verification
  //
  // The key concern: does the selector re-run when it SHOULD but no
  // property-level signals changed? This tests whether our version
  // counters on intermediate objects are sufficient.
  // ==========================================================================

  describe('Pattern 6: selective re-execution with identity selectors', () => {
    it('identity selector re-runs when unrelated slice changes do NOT trigger it', () => {
      let identitySelectorCalls = 0
      let unrelatedSelectorCalls = 0

      const IdentityComp = () => {
        const isSame = useSignalSelector((state: RootState) => {
          identitySelectorCalls++
          return state.identity.draft === state.identity.published
        })
        return <div data-testid="identity">{String(isSame)}</div>
      }

      // A second component reading something entirely different
      const UnrelatedComp = () => {
        const name = useSignalSelector((state: RootState) => {
          unrelatedSelectorCalls++
          return state.identity.items[0].name
        })
        return <div data-testid="unrelated">{name}</div>
      }

      rtl.render(
        <SignalProvider store={store}>
          <IdentityComp />
          <UnrelatedComp />
        </SignalProvider>,
      )

      const identityCallsAfterMount = identitySelectorCalls
      const unrelatedCallsAfterMount = unrelatedSelectorCalls

      // Update items[0].name — only the unrelated selector should re-run
      rtl.act(() => {
        store.dispatch(
          identitySlice.actions.updateItemName({ index: 0, name: 'AlphaV2' }),
        )
      })

      expect(unrelatedSelectorCalls).toBeGreaterThan(unrelatedCallsAfterMount)
      // Identity selector should NOT re-run — draft/published didn't change
      // (The exact behavior depends on whether identity.draft and identity.published
      // share parent object version signals that fire for ANY identity.* change)
      // This is informational — we record whether it ran or not
      const identityRan = identitySelectorCalls > identityCallsAfterMount

      // Whether or not it re-ran, the result should be correct
      expect(
        document.querySelector('[data-testid="identity"]')!.textContent,
      ).toBe('true')

      // Log for analysis
      console.log(
        `Identity selector re-ran on unrelated change: ${identityRan}`,
      )
    })

    // KNOWN FAILURE: same root cause as all identity comparison failures.
    // The selector reads draft and published (objects), no signal deps.
    it('identity selector DOES re-run when relevant ref changes', () => {
      let selectorCalls = 0

      const Comp = () => {
        const isSame = useSignalSelector((state: RootState) => {
          selectorCalls++
          return state.identity.draft === state.identity.published
        })
        return <div data-testid="result">{String(isSame)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('true')
      const callsAfterMount = selectorCalls

      // Diverge draft from published — selector MUST re-run and return false
      rtl.act(() => {
        store.dispatch(identitySlice.actions.divergeDraftFromPublished())
      })

      expect(selectorCalls).toBeGreaterThan(callsAfterMount)
      expect(getByTestId('result').textContent).toBe('false')
    })
  })

  // ==========================================================================
  // Pattern 7: Proxy identity consistency
  //
  // Verify that when two state paths point to the same underlying object,
  // the proxy cache returns the same proxy, making === work correctly
  // THROUGH the proxy layer.
  // ==========================================================================

  describe('Pattern 7: proxy identity preservation', () => {
    it('same underlying object produces same proxy via cache', () => {
      // This is fundamental: if state.draft and state.published point to
      // the same object, do their proxies compare as === ?
      let proxyDraft: unknown
      let proxyPublished: unknown

      const Comp = () => {
        const result = useSignalSelector((state: RootState) => {
          proxyDraft = state.identity.draft
          proxyPublished = state.identity.published
          return state.identity.draft === state.identity.published
        })
        return <div data-testid="result">{String(result)}</div>
      }

      rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      // Verify the proxies are actually the same object
      expect(proxyDraft).toBe(proxyPublished)
    })

    it('different underlying objects produce different proxies', () => {
      let proxyCurrent: unknown
      let proxySaved: unknown

      const Comp = () => {
        const result = useSignalSelector((state: RootState) => {
          proxyCurrent = state.identity.current
          proxySaved = state.identity.saved
          return state.identity.current === state.identity.saved
        })
        return <div data-testid="result">{String(result)}</div>
      }

      rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      // current and saved are different objects with same values
      expect(proxyCurrent).not.toBe(proxySaved)
    })
  })

  // ==========================================================================
  // Pattern 8: Immer structural sharing edge case
  //
  // When Immer updates one field but leaves another untouched,
  // the untouched field keeps its reference. Test that identity
  // comparisons reflect this correctly.
  // ==========================================================================

  describe('Pattern 8: Immer structural sharing with identity', () => {
    it('reflects Immer structural sharing in identity comparisons', () => {
      // After dispatching divergeDraftFromPublished, draft changes but
      // published keeps its old ref. selectedItem should still be items[0].
      const results: boolean[] = []

      const Comp = () => {
        const selectedIsFirst = useSignalSelector((state: RootState) => {
          return state.identity.selectedItem === state.identity.items[0]
        })
        results.push(selectedIsFirst)
        return <div data-testid="result">{String(selectedIsFirst)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('true')

      // Dispatch something that doesn't affect items or selectedItem
      rtl.act(() => {
        store.dispatch(identitySlice.actions.divergeDraftFromPublished())
      })

      // selectedItem and items[0] should still be the same ref
      // (Immer structural sharing preserves them)
      const state = store.getState()
      expect(state.identity.selectedItem).toBe(state.identity.items[0])

      // The UI should still show true
      expect(getByTestId('result').textContent).toBe('true')
    })
  })

  // ==========================================================================
  // Pattern 9: Workarounds — identity comparison WITH property access
  //
  // These tests show that adding a primitive property access alongside
  // the identity comparison makes the selector correctly reactive.
  // This is the natural workaround for real-world selectors.
  // ==========================================================================

  describe('Pattern 9: workaround — identity comparison with property access', () => {
    it('identity selector works when also reading a primitive property', () => {
      // This is the realistic pattern: compare identity BUT ALSO read
      // a property (like id or name) from the objects.
      const Comp = () => {
        const isSelected = useSignalSelector((state: RootState) => {
          // Reading .id creates a signal dependency on selectedItem.id
          // and items.{id:1}.id — these signals fire when the refs change
          const selId = state.identity.selectedItem?.id
          const firstId = state.identity.items[0]?.id
          return selId === firstId
        })
        return <div data-testid="result">{String(isSelected)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('true')

      // Change selection to items[1]
      rtl.act(() => {
        store.dispatch(identitySlice.actions.selectItem(1))
      })

      // Now selectedItem.id is 2, items[0].id is still 1 → false
      expect(getByTestId('result').textContent).toBe('false')
    })

    it('identity selector works when reading any leaf from compared objects', () => {
      // Comparing draft and published identity, but also reading .title
      const Comp = () => {
        const result = useSignalSelector((state: RootState) => {
          // Read a primitive from each to establish signal deps
          const draftTitle = (state.identity.draft as Record<string, unknown>)
            ?.title
          const pubTitle = (
            state.identity.published as Record<string, unknown>
          )?.title
          return draftTitle === pubTitle
        })
        return <div data-testid="result">{String(result)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('true')

      // Diverge draft
      rtl.act(() => {
        store.dispatch(identitySlice.actions.divergeDraftFromPublished())
      })

      expect(getByTestId('result').textContent).toBe('false')
    })
  })

  // ==========================================================================
  // Pattern 10: indexOf/lastIndexOf with proxy arguments
  //
  // Same root cause as includes: the override calls the raw array method
  // with a proxy argument, which can't match raw objects.
  // ==========================================================================

  describe('Pattern 10: indexOf/lastIndexOf with object args', () => {
    it('indexOf returns correct index for proxy-wrapped object', () => {
      const Comp = () => {
        const idx = useSignalSelector((state: RootState) => {
          return state.identity.items.indexOf(
            state.identity.selectedItem as Item,
          )
        })
        return <div data-testid="result">{String(idx)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      // selectedItem is items[0], so indexOf should return 0
      expect(getByTestId('result').textContent).toBe('0')
    })
  })

  // ==========================================================================
  // Pattern 11: Null/undefined identity transitions
  //
  // Object goes from non-null to null and back. Tests that the transition
  // between object and null is tracked (type changes at a path).
  // ==========================================================================

  describe('Pattern 11: null identity transitions', () => {
    it('tracks object → null transition', () => {
      const Comp = () => {
        const isNull = useSignalSelector(
          (state: RootState) => state.identity.maybeNull === null,
        )
        return <div data-testid="result">{String(isNull)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      // Initially maybeNull is sharedNested (not null)
      expect(getByTestId('result').textContent).toBe('false')

      rtl.act(() => {
        store.dispatch(identitySlice.actions.setMaybeNull(null))
      })

      expect(getByTestId('result').textContent).toBe('true')
    })

    it('tracks null → object transition', () => {
      // Start by setting to null
      store.dispatch(identitySlice.actions.setMaybeNull(null))

      const Comp = () => {
        const isNull = useSignalSelector(
          (state: RootState) => state.identity.maybeNull === null,
        )
        return <div data-testid="result">{String(isNull)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('true')

      rtl.act(() => {
        store.dispatch(
          identitySlice.actions.setMaybeNull({ label: 'restored' }),
        )
      })

      expect(getByTestId('result').textContent).toBe('false')
    })

    it('tracks object → null → different object', () => {
      let selectorCalls = 0

      const Comp = () => {
        const label = useSignalSelector((state: RootState) => {
          selectorCalls++
          const obj = state.identity.maybeNull
          return obj === null ? 'none' : 'exists'
        })
        return <div data-testid="result">{label}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('exists')

      rtl.act(() => {
        store.dispatch(identitySlice.actions.setMaybeNull(null))
      })
      expect(getByTestId('result').textContent).toBe('none')

      rtl.act(() => {
        store.dispatch(
          identitySlice.actions.setMaybeNull({ label: 'new-obj' }),
        )
      })
      expect(getByTestId('result').textContent).toBe('exists')
    })
  })

  // ==========================================================================
  // Pattern 12: Nested leaf object (deep traversal, identity at leaf)
  //
  // state.deep.nested.target used for identity. Three levels of intermediate
  // traversal, leaf object at the end.
  // ==========================================================================

  describe('Pattern 12: nested leaf object identity', () => {
    it('tracks identity change on deeply nested object', () => {
      const Comp = () => {
        const isSame = useSignalSelector(
          (state: RootState) =>
            state.identity.deep.nested.target === state.identity.objA,
        )
        return <div data-testid="result">{String(isSame)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      // Initially deep.nested.target and objA are both sharedNested
      expect(getByTestId('result').textContent).toBe('true')

      // Change deep.nested.target to a different object
      rtl.act(() => {
        store.dispatch(
          identitySlice.actions.setDeepTarget({ label: 'different' }),
        )
      })

      expect(getByTestId('result').textContent).toBe('false')
    })

    it('tracks when deeply nested object becomes same ref as sibling', () => {
      // First diverge them
      store.dispatch(
        identitySlice.actions.setObjA({ label: 'diverged' }),
      )

      const Comp = () => {
        const isSame = useSignalSelector(
          (state: RootState) =>
            state.identity.deep.nested.target === state.identity.objA,
        )
        return <div data-testid="result">{String(isSame)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('false')

      // Set deep.nested.target to a new object with same content as objA
      // (Immer will make them different refs)
      rtl.act(() => {
        store.dispatch(
          identitySlice.actions.setDeepTarget({ label: 'diverged' }),
        )
      })

      // After Immer, these are different refs even with same content
      const state = store.getState()
      const expected =
        state.identity.deep.nested.target === state.identity.objA
      expect(getByTestId('result').textContent).toBe(String(expected))
    })
  })

  // ==========================================================================
  // Pattern 13: Multiple leaf objects from same parent
  //
  // state.objA === state.objB where both are siblings under identity.
  // Tests that leaf detection works when both leaves share a parent.
  // ==========================================================================

  describe('Pattern 13: sibling leaf objects', () => {
    it('tracks identity between sibling objects', () => {
      const Comp = () => {
        const isSame = useSignalSelector(
          (state: RootState) =>
            state.identity.objA === state.identity.objB,
        )
        return <div data-testid="result">{String(isSame)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      // Initially both are sharedNested
      expect(getByTestId('result').textContent).toBe('true')

      // Diverge objA
      rtl.act(() => {
        store.dispatch(
          identitySlice.actions.setObjA({ label: 'changed' }),
        )
      })

      expect(getByTestId('result').textContent).toBe('false')
    })

    it('tracks when siblings converge to same ref', () => {
      // Diverge first
      store.dispatch(
        identitySlice.actions.setObjA({ label: 'different' }),
      )

      const Comp = () => {
        const isSame = useSignalSelector(
          (state: RootState) =>
            state.identity.objA === state.identity.objB,
        )
        return <div data-testid="result">{String(isSame)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('false')

      // Change objB to match objA's content (Immer creates new refs)
      rtl.act(() => {
        store.dispatch(
          identitySlice.actions.setObjB({ label: 'different' }),
        )
      })

      const state = store.getState()
      const expected = state.identity.objA === state.identity.objB
      expect(getByTestId('result').textContent).toBe(String(expected))
    })
  })

  // ==========================================================================
  // Pattern 14: Parent version signal false-positive suppression
  //
  // Sibling primitive changes → parent version signal fires → selector
  // re-runs → returns same result → equality check suppresses re-render.
  // Verifies the "benign false positive" trade-off of parent version signals.
  // ==========================================================================

  describe('Pattern 14: false-positive suppression via equality check', () => {
    it('does not re-render when sibling changes but selector result is stable', () => {
      let renderCount = 0

      const Comp = () => {
        renderCount++
        const isSame = useSignalSelector(
          (state: RootState) =>
            state.identity.objA === state.identity.objB,
        )
        return <div data-testid="result">{String(isSame)}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('true')
      const rendersAfterMount = renderCount

      // Change siblingPrimitive — shares the identity parent with objA/objB.
      // This fires the identity parent version signal. The selector re-runs
      // but objA === objB is still true. Equality check suppresses re-render.
      rtl.act(() => {
        store.dispatch(identitySlice.actions.bumpSiblingPrimitive())
      })

      // Result should still be true, and render count should not increase
      expect(getByTestId('result').textContent).toBe('true')
      expect(renderCount).toBe(rendersAfterMount)
    })
  })

  // ==========================================================================
  // Pattern 15: Conditional property access based on identity
  //
  // Selector first checks identity, then conditionally reads properties.
  // On first run it may only read objects (leaf detection needed).
  // On re-run after state change, it reads different paths.
  // ==========================================================================

  describe('Pattern 15: conditional property access after identity check', () => {
    it('handles selector that conditionally reads properties', () => {
      const Comp = () => {
        const result = useSignalSelector((state: RootState) => {
          if (state.identity.objA === state.identity.objB) {
            // Same ref — just return the label
            return state.identity.objA.label
          }
          // Different refs — return comparison string
          return `${state.identity.objA.label} vs ${state.identity.objB.label}`
        })
        return <div data-testid="result">{result}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      // Initially same ref → returns label
      expect(getByTestId('result').textContent).toBe('shared-nested')

      // Diverge objA — different refs now
      rtl.act(() => {
        store.dispatch(
          identitySlice.actions.setObjA({ label: 'alpha' }),
        )
      })

      expect(getByTestId('result').textContent).toBe('alpha vs shared-nested')
    })

    it('handles short-circuit: reads only one side when first is null', () => {
      // Set maybeNull to null first
      store.dispatch(identitySlice.actions.setMaybeNull(null))

      const Comp = () => {
        const result = useSignalSelector((state: RootState) => {
          // Short circuit: if maybeNull is null, don't read objA
          if (state.identity.maybeNull === null) {
            return 'no-object'
          }
          return state.identity.maybeNull === state.identity.objA
            ? 'same'
            : 'different'
        })
        return <div data-testid="result">{result}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('no-object')

      // Restore maybeNull — now it's a different ref from objA
      rtl.act(() => {
        store.dispatch(
          identitySlice.actions.setMaybeNull({ label: 'restored' }),
        )
      })

      expect(getByTestId('result').textContent).toBe('different')
    })
  })

  // ==========================================================================
  // Pattern 16: Returning a leaf object (terminal proxy check)
  //
  // Selector returns an object directly (not a boolean from comparison).
  // The terminal proxy check in useSignalSelector should handle this.
  // ==========================================================================

  describe('Pattern 16: selector returning leaf object', () => {
    it('re-runs when returned object ref changes', () => {
      let selectorCalls = 0

      const Comp = () => {
        const obj = useSignalSelector((state: RootState) => {
          selectorCalls++
          return state.identity.objA
        })
        return <div data-testid="result">{(obj as NestedObj).label}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('shared-nested')
      const callsAfterMount = selectorCalls

      rtl.act(() => {
        store.dispatch(
          identitySlice.actions.setObjA({ label: 'updated' }),
        )
      })

      expect(getByTestId('result').textContent).toBe('updated')
      expect(selectorCalls).toBeGreaterThan(callsAfterMount)
    })
  })

  // ==========================================================================
  // Pattern 17: Mixed identity + primitive in same selector
  //
  // Selector reads both object identity and primitive properties.
  // Tests that leaf object detection and parent version signals
  // work together without interference.
  // ==========================================================================

  describe('Pattern 17: mixed identity and primitive reads', () => {
    it('tracks both identity and primitive changes', () => {
      const Comp = () => {
        const result = useSignalSelector((state: RootState) => {
          const isSame =
            state.identity.draft === state.identity.published
          const count = state.identity.siblingPrimitive
          return `${isSame}-${count}`
        })
        return <div data-testid="result">{result}</div>
      }

      const { getByTestId } = rtl.render(
        <SignalProvider store={store}>
          <Comp />
        </SignalProvider>,
      )

      expect(getByTestId('result').textContent).toBe('true-0')

      // Change primitive
      rtl.act(() => {
        store.dispatch(identitySlice.actions.bumpSiblingPrimitive())
      })
      expect(getByTestId('result').textContent).toBe('true-1')

      // Change identity
      rtl.act(() => {
        store.dispatch(identitySlice.actions.divergeDraftFromPublished())
      })
      expect(getByTestId('result').textContent).toBe('false-1')
    })
  })
})

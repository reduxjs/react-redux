import { describe, expect, it } from 'vitest'
import * as rtl from '@testing-library/react'
import React from 'react'
import {
  combineReducers,
  configureStore,
  createSlice,
  type PayloadAction,
} from '@reduxjs/toolkit'
import { SignalProvider, useSignalSelector, shallowEqual } from '../../src/signals'

// Mirrors the multi-selector-component benchmark: 4 selectors per card, over
// slices where several actions change a segment WITHOUT changing the field the
// card reads (loginCount≠role, preferences unread, scrollPosition≠sidebar/tab).
// After warmup those actions must cause ZERO extra renders. This pins down the
// steady-state over-fire the medians showed (lazy-coarse renders ~+5% here).

function makeStore() {
  const auth = createSlice({
    name: 'auth',
    initialState: { role: 'user', loginCount: 0 },
    reducers: { incrementLoginCount: (s) => void s.loginCount++ },
  })
  const preferences = createSlice({
    name: 'preferences',
    initialState: { updatedAt: 0 },
    reducers: { touch: (s) => void (s.updatedAt = s.updatedAt + 1) },
  })
  const notifications = createSlice({
    name: 'notifications',
    initialState: { unreadCount: 0, totalCount: 0 },
    reducers: {
      incrementUnread: (s) => {
        s.unreadCount++
        s.totalCount++
      },
    },
  })
  const data = createSlice({
    name: 'data',
    initialState: {
      items: { 0: { id: 0, value: 0 }, 1: { id: 1, value: 0 } } as Record<
        number,
        { id: number; value: number }
      >,
      lastUpdated: 0,
    },
    reducers: {
      updateItem: (s, a: PayloadAction<number>) => {
        s.items[a.payload].value++
        s.lastUpdated++
      },
    },
  })
  const ui = createSlice({
    name: 'ui',
    initialState: { sidebarOpen: true, activeTab: 'dashboard', scrollPosition: 0 },
    reducers: { updateScrollPosition: (s) => void (s.scrollPosition++) },
  })

  const store = configureStore({
    reducer: combineReducers({
      auth: auth.reducer,
      preferences: preferences.reducer,
      notifications: notifications.reducer,
      data: data.reducer,
      ui: ui.reducer,
    }),
  })
  return {
    store,
    ...auth.actions,
    ...preferences.actions,
    ...notifications.actions,
    ...data.actions,
    ...ui.actions,
  }
}

type RootState = ReturnType<ReturnType<typeof makeStore>['store']['getState']>

let renders = 0
const selRole = (s: RootState) => s.auth.role
const selUnread = (s: RootState) => s.notifications.unreadCount
const selItem = (s: RootState) => s.data.items[0]
const selUi = (s: RootState) => ({
  sidebar: s.ui.sidebarOpen,
  tab: s.ui.activeTab,
})

function Card() {
  renders++
  useSignalSelector(selRole)
  useSignalSelector(selUnread)
  useSignalSelector(selItem)
  useSignalSelector(selUi, shallowEqual)
  return null
}

describe('multi-selector steady-state over-fire', () => {
  it('actions that change a read segment but not the read field cause 0 re-renders after warmup', () => {
    const s = makeStore()
    rtl.render(
      <SignalProvider store={s.store}>
        <Card />
      </SignalProvider>,
    )

    // Warm up: touch every segment once so all hooks build their deep graph.
    rtl.act(() => {
      s.store.dispatch(s.incrementLoginCount()) // auth
      s.store.dispatch(s.touch()) // preferences
      s.store.dispatch(s.incrementUnread()) // notifications
      s.store.dispatch(s.updateItem(0)) // data
      s.store.dispatch(s.updateScrollPosition()) // ui
    })

    const measure = (label: string, fn: () => void) => {
      const before = renders
      rtl.act(fn)
      return { label, delta: renders - before }
    }

    const results = [
      measure('loginCount (auth, not role)', () => {
        s.store.dispatch(s.incrementLoginCount())
      }),
      measure('touch (preferences, unread)', () => {
        s.store.dispatch(s.touch())
      }),
      measure('scrollPosition (ui, not sidebar/tab)', () => {
        s.store.dispatch(s.updateScrollPosition())
      }),
      measure('updateItem(1) (data, other item)', () => {
        s.store.dispatch(s.updateItem(1))
      }),
    ]

    for (const r of results) {
      expect(r.delta, r.label).toBe(0)
    }
  })
})

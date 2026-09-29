/**
 * RTK Query opting into the signal hooks per API via
 * `reactHooksModule({ hooks: { useSelector, useDispatch, useStore } })`.
 *
 * `useSelector` here comes from the aliased `react-redux` entry, so the
 * same file runs against stock `useSelector` (default) and
 * `useSignalSelector` (`TEST_IMPL=signals`). Render counts are asserted
 * exactly and must match in both modes. Registry assertions only run in
 * signals mode.
 *
 * `useDispatch`/`useStore` are the stock hooks in BOTH modes: the point
 * of the per-API opt-in is that only the selector hook changes.
 */
import * as rtl from '@testing-library/react'
import React from 'react'
import { combineReducers, configureStore, createSlice } from '@reduxjs/toolkit'
import type { BaseQueryFn } from '@reduxjs/toolkit/query/react'
import {
  buildCreateApi,
  coreModule,
  reactHooksModule,
} from '@reduxjs/toolkit/query/react'
import { Provider, useSelector } from 'react-redux'
import { useDispatch, useStore } from '../../src/index'
import { unwrap } from '../../src/signals/trackingProxy'
import { useSignalContext } from '../../src/signals/context'
import type {
  PathSignalRegistry,
  RegistryStats,
} from '../../src/signals/pathSignalRegistry'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const IS_SIGNALS = process.env.TEST_IMPL === 'signals'

interface Post {
  id: number
  title: string
  body: string
}

interface User {
  id: number
  name: string
}

interface Request {
  url: string
  method: string
  body?: unknown
}

function makeServer() {
  const posts = new Map<number, Post>([
    [1, { id: 1, title: 'first', body: 'b1' }],
    [2, { id: 2, title: 'second', body: 'b2' }],
    [3, { id: 3, title: 'third', body: 'b3' }],
  ])
  const users = new Map<number, User>([[7, { id: 7, name: 'ann' }]])
  const requests: Request[] = []
  let gate: Promise<void> | null = null
  let openGate: (() => void) | null = null

  const baseQuery: BaseQueryFn<Request, unknown, { status: number }> = async (
    req,
  ) => {
    requests.push(req)
    await Promise.resolve()
    if (gate) await gate
    const [, resource, rawId] = req.url.split('/')
    if (resource === 'posts') {
      if (rawId === undefined) {
        return { data: Array.from(posts.values()) }
      }
      const id = Number(rawId)
      const post = posts.get(id)
      if (!post) return { error: { status: 404 } }
      if (req.method === 'PATCH') {
        const next = { ...post, ...(req.body as Partial<Post>) }
        posts.set(id, next)
        return { data: next }
      }
      return { data: post }
    }
    if (resource === 'users') {
      const user = users.get(Number(rawId))
      return user ? { data: user } : { error: { status: 404 } }
    }
    return { error: { status: 404 } }
  }

  function pause() {
    gate = new Promise<void>((resolve) => {
      openGate = resolve
    })
  }
  function resume() {
    openGate?.()
    gate = null
    openGate = null
  }
  function resumeOnce() {
    const release = openGate
    pause()
    release?.()
  }

  return { posts, users, requests, baseQuery, pause, resume, resumeOnce }
}

function makeApi(baseQuery: BaseQueryFn<Request, unknown, { status: number }>) {
  const createApi = buildCreateApi(
    coreModule(),
    reactHooksModule({ hooks: { useDispatch, useSelector, useStore } }),
  )

  return createApi({
    reducerPath: 'api',
    baseQuery,
    tagTypes: ['Post'],
    endpoints: (build) => ({
      getPosts: build.query<Post[], void>({
        query: () => ({ url: '/posts', method: 'GET' }),
        providesTags: (result) =>
          result
            ? [
                { type: 'Post', id: 'LIST' },
                ...result.map((p) => ({ type: 'Post' as const, id: p.id })),
              ]
            : [{ type: 'Post', id: 'LIST' }],
      }),
      getPost: build.query<Post, number>({
        query: (id) => ({ url: `/posts/${id}`, method: 'GET' }),
        providesTags: (_r, _e, id) => [{ type: 'Post', id }],
      }),
      getUser: build.query<User, number>({
        query: (id) => ({ url: `/users/${id}`, method: 'GET' }),
      }),
      updatePost: build.mutation<Post, { id: number; title: string }>({
        query: ({ id, ...body }) => ({
          url: `/posts/${id}`,
          method: 'PATCH',
          body,
        }),
        invalidatesTags: (_r, _e, { id }) => [{ type: 'Post', id }],
      }),
    }),
  })
}

type Api = ReturnType<typeof makeApi>

const counterSlice = createSlice({
  name: 'counter',
  initialState: { value: 0 },
  reducers: {
    increment(state) {
      state.value += 1
    },
  },
})

function makeStore(api: Api) {
  return configureStore({
    reducer: combineReducers({
      [api.reducerPath]: api.reducer,
      counter: counterSlice.reducer,
    }),
    middleware: (gDM) => gDM().concat(api.middleware),
  })
}

type AppStore = ReturnType<typeof makeStore>

const EMPTY_STATS: RegistryStats = {
  signals: 0,
  prefixCounts: 0,
  prefixOnlyPaths: 0,
  childIndex: 0,
  arrayMetas: 0,
  columnsByArray: 0,
  structuresByArray: 0,
  segmentSubs: 0,
}

let capturedRegistry: PathSignalRegistry | null = null

function CaptureRegistry() {
  capturedRegistry = useSignalContext().registry
  return null
}

function requireRegistry(): PathSignalRegistry {
  if (capturedRegistry === null) throw new Error('registry not captured')
  return capturedRegistry
}

const renders: Record<string, number> = {}
function countRender(name: string) {
  renders[name] = (renders[name] ?? 0) + 1
}

let server: ReturnType<typeof makeServer>
let api: Api
let store: AppStore

beforeEach(() => {
  server = makeServer()
  api = makeApi(server.baseQuery)
  store = makeStore(api)
  capturedRegistry = null
  for (const key of Object.keys(renders)) delete renders[key]
})

afterEach(() => {
  rtl.cleanup()
  vi.restoreAllMocks()
})

function Root({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      {IS_SIGNALS ? <CaptureRegistry /> : null}
      {children}
    </Provider>
  )
}

function PostTitle({ id, skip = false }: { id: number; skip?: boolean }) {
  countRender(`post${id}`)
  const { data, isLoading, isFetching, isUninitialized } =
    api.endpoints.getPost.useQuery(id, { skip })
  return (
    <div data-testid={`post${id}`}>
      {isUninitialized
        ? 'uninitialized'
        : isLoading
          ? 'loading'
          : `${data?.title ?? ''}${isFetching ? ' (refetching)' : ''}`}
    </div>
  )
}

function UserName({ id }: { id: number }) {
  countRender(`user${id}`)
  const { data, isLoading } = api.endpoints.getUser.useQuery(id)
  return (
    <div data-testid={`user${id}`}>{isLoading ? 'loading' : data?.name}</div>
  )
}

function PostTitleFromList({ id }: { id: number }) {
  countRender(`list${id}`)
  const { title, isLoading } = api.endpoints.getPosts.useQuery(undefined, {
    selectFromResult: ({ data, isLoading }) => ({
      title: data?.find((p) => p.id === id)?.title,
      isLoading,
    }),
  })
  return <div data-testid={`list${id}`}>{isLoading ? 'loading' : title}</div>
}

function Counter() {
  countRender('counter')
  const value = useSelector(
    (s: ReturnType<AppStore['getState']>) => s.counter.value,
  )
  return <div data-testid="counter">{value}</div>
}

// configureStore's autoBatch enhancer defers subscriber notification for
// RTKQ's fulfilled/patched actions to a requestAnimationFrame tick, so a
// plain act() returns before the store notifies. Wait past two frames.
async function settle() {
  await rtl.act(async () => {
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    )
  })
}

async function dispatchAndSettle(dispatch: () => unknown) {
  await rtl.act(async () => {
    dispatch()
  })
  await settle()
}

describe('RTK Query with reactHooksModule({ hooks: { useSelector } })', () => {
  it('fetches on mount and re-renders once per phase (pending, fulfilled)', async () => {
    server.pause()
    rtl.render(
      <Root>
        <PostTitle id={1} />
      </Root>,
    )
    // Mount, then the pending entry (dispatched from the subscription
    // effect inside render's act) replaces the synthetic "uninitialized
    // shown as pending" result: same flags, but requestId/startedTimeStamp
    // appear, so shallowEqual sees a change.
    expect(rtl.screen.getByTestId('post1').textContent).toBe('loading')
    expect(renders.post1).toBe(2)

    await settle()
    expect(renders.post1).toBe(2)

    server.resume()
    await settle()
    expect(rtl.screen.getByTestId('post1').textContent).toBe('first')
    expect(renders.post1).toBe(3)
    expect(server.requests).toHaveLength(1)
  })

  it('hands the component raw cache data, not a tracking proxy, with stable identity', async () => {
    const seen: Array<Post | undefined> = []
    function Capture() {
      const { data } = api.endpoints.getPost.useQuery(1)
      seen.push(data)
      return null
    }
    const { rerender } = rtl.render(
      <Root>
        <Capture />
      </Root>,
    )
    await settle()
    const first = seen.at(-1)
    expect(first).toEqual({ id: 1, title: 'first', body: 'b1' })

    const raw = api.endpoints.getPost.select(1)(store.getState()).data
    expect(first).toBe(raw)
    expect(unwrap(first)).toBe(first)

    // A parent-driven re-render hands back the same reference
    rerender(
      <Root>
        <Capture />
      </Root>,
    )
    expect(seen.at(-1)).toBe(first)
  })

  it('returns a stable result object across unrelated store updates', async () => {
    const results: unknown[] = []
    function Capture() {
      const result = api.endpoints.getPost.useQuery(1)
      results.push(result)
      return null
    }
    rtl.render(
      <Root>
        <Capture />
      </Root>,
    )
    await settle()
    const settled = results.at(-1)
    const count = results.length

    await dispatchAndSettle(() =>
      store.dispatch(counterSlice.actions.increment()),
    )
    await dispatchAndSettle(() =>
      store.dispatch(
        api.util.updateQueryData('getUser', 7, () => ({ id: 7, name: 'x' })),
      ),
    )
    expect(results.length).toBe(count)
    expect(results.at(-1)).toBe(settled)
  })

  describe('selectFromResult', () => {
    it('re-renders only the subscriber whose picked element changed', async () => {
      rtl.render(
        <Root>
          <PostTitleFromList id={1} />
          <PostTitleFromList id={2} />
        </Root>,
      )
      await settle()
      expect(rtl.screen.getByTestId('list1').textContent).toBe('first')
      expect(rtl.screen.getByTestId('list2').textContent).toBe('second')
      expect(server.requests).toHaveLength(1)
      expect(renders.list1).toBe(3)
      expect(renders.list2).toBe(3)

      await dispatchAndSettle(() =>
        store.dispatch(
          api.util.updateQueryData('getPosts', undefined, (draft) => {
            const p = draft.find((p) => p.id === 2)
            if (p) p.title = 'second!'
          }),
        ),
      )

      expect(rtl.screen.getByTestId('list1').textContent).toBe('first')
      expect(rtl.screen.getByTestId('list2').textContent).toBe('second!')
      expect(renders.list1).toBe(3)
      expect(renders.list2).toBe(4)
    })

    it('does not re-render when a field the selector did not pick changes', async () => {
      function BodyOnly() {
        countRender('body')
        const { body } = api.endpoints.getPost.useQuery(1, {
          selectFromResult: ({ data }) => ({ body: data?.body }),
        })
        return <div data-testid="body">{body}</div>
      }
      rtl.render(
        <Root>
          <BodyOnly />
        </Root>,
      )
      await settle()
      expect(rtl.screen.getByTestId('body').textContent).toBe('b1')
      const before = renders.body

      await dispatchAndSettle(() =>
        store.dispatch(
          api.util.updateQueryData('getPost', 1, (draft) => {
            draft.title = 'retitled'
          }),
        ),
      )
      expect(renders.body).toBe(before)

      await dispatchAndSettle(() =>
        store.dispatch(
          api.util.updateQueryData('getPost', 1, (draft) => {
            draft.body = 'b1!'
          }),
        ),
      )
      expect(rtl.screen.getByTestId('body').textContent).toBe('b1!')
      expect(renders.body).toBe(before + 1)
    })

    it('accepts a selector that spreads and destructures the result', async () => {
      let received: Record<string, unknown> = {}
      function Spread() {
        countRender('spread')
        const result = api.endpoints.getPost.useQuery(1, {
          selectFromResult: ({ data, ...rest }) => ({
            ...rest,
            title: data?.title,
            hasBody: data !== undefined && 'body' in data,
          }),
        })
        received = result
        return <div data-testid="spread">{result.title}</div>
      }
      rtl.render(
        <Root>
          <Spread />
        </Root>,
      )
      await settle()
      expect(rtl.screen.getByTestId('spread').textContent).toBe('first')
      expect(received.hasBody).toBe(true)
      expect(received.isSuccess).toBe(true)
      expect('data' in received).toBe(false)
      const before = renders.spread

      await dispatchAndSettle(() =>
        store.dispatch(counterSlice.actions.increment()),
      )
      expect(renders.spread).toBe(before)
    })

    it('works with a stable selector defined outside the component', async () => {
      const selectTitle = ({
        data,
        isFetching,
      }: {
        data?: Post
        isFetching: boolean
      }) => ({ title: data?.title, isFetching })

      function Stable() {
        countRender('stable')
        const { title } = api.endpoints.getPost.useQuery(1, {
          selectFromResult: selectTitle,
        })
        return <div data-testid="stable">{title}</div>
      }
      rtl.render(
        <Root>
          <Stable />
        </Root>,
      )
      await settle()
      expect(rtl.screen.getByTestId('stable').textContent).toBe('first')
      expect(renders.stable).toBe(3)
    })
  })

  // While a new arg loads, RTKQ feeds the previous default result back into
  // its selector as `lastResult` and keeps showing that result's `data`.
  // With selectFromResult, that previous default result is captured inside
  // the selector run, so under signals its `data` is the tracking proxy
  // from an earlier evaluation. These check it never reaches the component
  // and that behavior matches stock.
  describe('arg change with selectFromResult', () => {
    const seen: Array<Post | undefined> = []
    const pickPost = ({
      data,
      isFetching,
    }: {
      data?: Post
      isFetching: boolean
    }) => ({ post: data, isFetching })

    function Picker({ id, stable }: { id: number; stable: boolean }) {
      countRender('picker')
      const { post, isFetching } = api.endpoints.getPost.useQuery(id, {
        selectFromResult: stable
          ? pickPost
          : ({ data, isFetching }) => ({ post: data, isFetching }),
      })
      seen.push(post)
      return (
        <div data-testid="picker">
          {post?.title ?? ''}
          {isFetching ? ' (fetching)' : ''}
        </div>
      )
    }

    // mount, pending, fulfilled | new arg, its pending | fulfilled, back to 1
    const PICKER_RENDERS = { before: 3, whileLoading: 5, final: 7 }

    const rawPost = (id: number) =>
      api.endpoints.getPost.select(id)(store.getState()).data

    beforeEach(() => {
      seen.length = 0
    })

    describe.each([
      ['inline', false],
      ['stable', true],
    ])('%s selector', (_name, stable) => {
      it('keeps the previous raw data while the new arg loads, then switches', async () => {
        const { rerender } = rtl.render(
          <Root>
            <Picker id={1} stable={stable} />
          </Root>,
        )
        await settle()
        expect(rtl.screen.getByTestId('picker').textContent).toBe('first')
        const post1 = rawPost(1)
        expect(seen.at(-1)).toBe(post1)
        const before = renders.picker

        server.pause()
        rerender(
          <Root>
            <Picker id={2} stable={stable} />
          </Root>,
        )
        await settle()
        expect(rtl.screen.getByTestId('picker').textContent).toBe(
          'first (fetching)',
        )
        expect(seen.at(-1)).toBe(post1)
        expect(unwrap(seen.at(-1))).toBe(seen.at(-1))
        const whileLoading = renders.picker

        server.resume()
        await settle()
        expect(rtl.screen.getByTestId('picker').textContent).toBe('second')
        expect(seen.at(-1)).toBe(rawPost(2))
        expect(unwrap(seen.at(-1))).toBe(seen.at(-1))
        expect(renders.picker).toBe(whileLoading + 1)

        // Back to the cached arg: immediate, no request, raw data
        rerender(
          <Root>
            <Picker id={1} stable={stable} />
          </Root>,
        )
        await settle()
        expect(rtl.screen.getByTestId('picker').textContent).toBe('first')
        expect(seen.at(-1)).toBe(post1)
        expect(server.requests).toHaveLength(2)
        expect({ before, whileLoading, final: renders.picker }).toEqual(
          PICKER_RENDERS,
        )
      })

      it('ignores patches to the previous entry while the new arg loads', async () => {
        const { rerender } = rtl.render(
          <Root>
            <Picker id={1} stable={stable} />
          </Root>,
        )
        await settle()
        server.pause()
        rerender(
          <Root>
            <Picker id={2} stable={stable} />
          </Root>,
        )
        await settle()
        const post1 = seen.at(-1)
        const whileLoading = renders.picker

        // The shown data is the previous result object, not a live read of
        // entry 1, so patching entry 1 changes nothing on screen.
        await dispatchAndSettle(() =>
          store.dispatch(
            api.util.updateQueryData('getPost', 1, (draft) => {
              draft.title = 'patched'
            }),
          ),
        )
        expect(rtl.screen.getByTestId('picker').textContent).toBe(
          'first (fetching)',
        )
        expect(seen.at(-1)).toBe(post1)
        expect(renders.picker).toBe(whileLoading)

        server.resume()
        await settle()
        expect(rtl.screen.getByTestId('picker').textContent).toBe('second')
      })
    })
  })

  it('runs a mutation, invalidates, and refetches the dependent query', async () => {
    let trigger: ((arg: { id: number; title: string }) => unknown) | null = null
    function Editor() {
      countRender('editor')
      const [update, { isUninitialized, isLoading, isSuccess, data }] =
        api.endpoints.updatePost.useMutation()
      trigger = update
      return (
        <div data-testid="editor">
          {isUninitialized
            ? 'idle'
            : isLoading
              ? 'saving'
              : isSuccess
                ? `saved:${data.title}`
                : 'error'}
        </div>
      )
    }

    rtl.render(
      <Root>
        <PostTitle id={1} />
        <PostTitle id={2} />
        <Editor />
      </Root>,
    )
    await settle()
    expect(rtl.screen.getByTestId('post1').textContent).toBe('first')
    expect(rtl.screen.getByTestId('post2').textContent).toBe('second')
    expect(rtl.screen.getByTestId('editor').textContent).toBe('idle')
    expect(renders.editor).toBe(1)
    const post1Before = renders.post1
    const post2Before = renders.post2

    server.pause()
    await rtl.act(async () => {
      trigger!({ id: 1, title: 'renamed' })
    })
    await settle()
    expect(rtl.screen.getByTestId('editor').textContent).toBe('saving')
    expect(renders.editor).toBe(2)

    // Release the PATCH; the invalidation refetch of post 1 is gated again
    server.resumeOnce()
    await settle()
    expect(rtl.screen.getByTestId('editor').textContent).toBe('saved:renamed')
    expect(renders.editor).toBe(3)
    expect(rtl.screen.getByTestId('post1').textContent).toBe(
      'first (refetching)',
    )
    expect(renders.post1).toBe(post1Before + 1)

    server.resume()
    await settle()
    expect(rtl.screen.getByTestId('post1').textContent).toBe('renamed')
    expect(renders.post1).toBe(post1Before + 2)
    expect(rtl.screen.getByTestId('post2').textContent).toBe('second')
    expect(renders.post2).toBe(post2Before)
    expect(server.requests.map((r) => `${r.method} ${r.url}`)).toEqual([
      'GET /posts/1',
      'GET /posts/2',
      'PATCH /posts/1',
      'GET /posts/1',
    ])
  })

  it('shares one cache entry between two subscribers', async () => {
    function Second() {
      countRender('second')
      const { data } = api.endpoints.getPost.useQuery(1)
      return <div data-testid="second">{data?.title}</div>
    }
    rtl.render(
      <Root>
        <PostTitle id={1} />
        <Second />
      </Root>,
    )
    await settle()
    expect(rtl.screen.getByTestId('post1').textContent).toBe('first')
    expect(rtl.screen.getByTestId('second').textContent).toBe('first')
    expect(server.requests).toHaveLength(1)
    expect(renders.post1).toBe(3)
    expect(renders.second).toBe(3)

    await dispatchAndSettle(() =>
      store.dispatch(
        api.util.updateQueryData('getPost', 1, (draft) => {
          draft.title = 'patched'
        }),
      ),
    )
    expect(rtl.screen.getByTestId('post1').textContent).toBe('patched')
    expect(rtl.screen.getByTestId('second').textContent).toBe('patched')
    expect(renders.post1).toBe(4)
    expect(renders.second).toBe(4)
  })

  it('does not request while skipped, then fetches once skip is lifted', async () => {
    const { rerender } = rtl.render(
      <Root>
        <PostTitle id={3} skip />
      </Root>,
    )
    expect(rtl.screen.getByTestId('post3').textContent).toBe('uninitialized')
    await settle()
    expect(server.requests).toHaveLength(0)
    expect(renders.post3).toBe(1)

    server.pause()
    rerender(
      <Root>
        <PostTitle id={3} />
      </Root>,
    )
    // `queryThunk.pending` is autoBatched, so its store notification is
    // deferred to a frame. The pending phase still renders inside
    // `rerender`: React's post-commit snapshot check reads the current
    // store state directly.
    expect(rtl.screen.getByTestId('post3').textContent).toBe('loading')
    expect(renders.post3).toBe(3)
    expect(server.requests).toHaveLength(1)
    await settle()
    expect(renders.post3).toBe(3)

    server.resume()
    await settle()
    expect(rtl.screen.getByTestId('post3').textContent).toBe('third')
    expect(renders.post3).toBe(4)
  })

  it('only re-renders the component whose cache entry changed', async () => {
    rtl.render(
      <Root>
        <PostTitle id={1} />
        <UserName id={7} />
        <Counter />
      </Root>,
    )
    await settle()
    expect(rtl.screen.getByTestId('post1').textContent).toBe('first')
    expect(rtl.screen.getByTestId('user7').textContent).toBe('ann')
    const post1 = renders.post1
    const user7 = renders.user7
    const counter = renders.counter

    await dispatchAndSettle(() =>
      store.dispatch(
        api.util.updateQueryData('getUser', 7, (draft) => {
          draft.name = 'bob'
        }),
      ),
    )
    expect(rtl.screen.getByTestId('user7').textContent).toBe('bob')
    expect(renders.user7).toBe(user7 + 1)
    expect(renders.post1).toBe(post1)
    expect(renders.counter).toBe(counter)

    await dispatchAndSettle(() =>
      store.dispatch(counterSlice.actions.increment()),
    )
    expect(renders.counter).toBe(counter + 1)
    expect(renders.post1).toBe(post1)
    expect(renders.user7).toBe(user7 + 1)
  })

  it('re-renders for the refetching and fulfilled phases of a same-value refetch', async () => {
    rtl.render(
      <Root>
        <PostTitle id={1} />
      </Root>,
    )
    await settle()
    expect(rtl.screen.getByTestId('post1').textContent).toBe('first')
    const before = renders.post1

    server.pause()
    await rtl.act(async () => {
      store.dispatch(api.endpoints.getPost.initiate(1, { forceRefetch: true }))
    })
    await settle()
    expect(rtl.screen.getByTestId('post1').textContent).toBe(
      'first (refetching)',
    )
    expect(renders.post1).toBe(before + 1)

    server.resume()
    await settle()
    expect(rtl.screen.getByTestId('post1').textContent).toBe('first')
    expect(renders.post1).toBe(before + 2)
    expect(server.requests).toHaveLength(2)
  })

  it.runIf(IS_SIGNALS)(
    'releases every path signal and coarse subscriber on unmount',
    async () => {
      const { unmount } = rtl.render(
        <Root>
          <PostTitle id={1} />
          <UserName id={7} />
          <PostTitleFromList id={2} />
        </Root>,
      )
      const registry = requireRegistry()
      await settle()
      expect(rtl.screen.getByTestId('post1').textContent).toBe('first')
      expect(rtl.screen.getByTestId('user7').textContent).toBe('ann')
      expect(rtl.screen.getByTestId('list2').textContent).toBe('second')
      const live = registry.debugStats()
      expect(live.signals).toBeGreaterThan(0)

      unmount()

      const after = registry.debugStats()
      // Array metadata is retained by design (see registryLeak.spec.tsx)
      expect({ ...after, arrayMetas: 0 }).toEqual(EMPTY_STATS)
    },
  )

  it.runIf(IS_SIGNALS)(
    'tracks only the queried cache entries, not the whole queries map',
    async () => {
      rtl.render(
        <Root>
          <PostTitle id={1} />
          <UserName id={7} />
        </Root>,
      )
      const registry = requireRegistry()
      await settle()
      expect(rtl.screen.getByTestId('post1').textContent).toBe('first')
      expect(rtl.screen.getByTestId('user7').textContent).toBe('ann')
      const paths = registry.debugPaths()
      expect(paths.some((p) => p.startsWith('api.queries.'))).toBe(true)
      expect(paths).not.toContain('api.queries')
      expect(paths).not.toContain('api')
      expect(paths.some((p) => p.startsWith('api.subscriptions'))).toBe(false)
      expect(paths.some((p) => p.startsWith('api.provided'))).toBe(false)
    },
  )
})

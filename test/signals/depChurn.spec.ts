import { describe, it, expect } from 'vitest'
import { createSelector } from 'reselect'
import { alienEngine } from '../../src/signals/engine'
import { createPathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import type { PathSignalRegistry } from '../../src/signals/pathSignalRegistry'
import {
  createTrackingProxy,
  getProxyPath,
} from '../../src/signals/trackingProxy'
import type { LeafObjectTracker } from '../../src/signals/trackingProxy'
import { reconcileState } from '../../src/signals/diff'

// Regression guard for dependency churn with memoized collection selectors.
//
// Several hooks share `selectAllComments` (RTK entity-adapter `selectAll`
// shape: `ids.map(id => entities[id])`). Whichever hook happens to run the
// map on a Reselect cache miss is the only one that reads the elements. If
// that read registered one signal per element, the next time that hook
// re-ran for an unrelated reason it would get a cache hit, read no elements,
// and alien-signals would drop every element dependency — releasing all of
// them from the registry — only for the next comments change to recreate
// them all. With 1000 comments and a dispatch every 25 ms that teardown and
// rebuild dominated the derived-selectors benchmark.
//
// A mapped collection is a read of the whole container, so the dependency
// belongs on the container (`comments.entities`), which every hook holds
// stably.

interface Comment {
  id: number
  postId: number
  text: string
}
interface Post {
  id: number
  score: number
}
interface State {
  posts: { ids: number[]; entities: Record<number, Post> }
  comments: { ids: number[]; entities: Record<number, Comment> }
}

const NUM_POSTS = 5
const NUM_COMMENTS = 50
const NUM_HOOKS = 6

function makeState(): State {
  const posts: State['posts'] = { ids: [], entities: {} }
  const comments: State['comments'] = { ids: [], entities: {} }
  for (let i = 1; i <= NUM_POSTS; i++) {
    posts.ids.push(i)
    posts.entities[i] = { id: i, score: 0 }
  }
  for (let i = 1; i <= NUM_COMMENTS; i++) {
    comments.ids.push(i)
    comments.entities[i] = { id: i, postId: (i % NUM_POSTS) + 1, text: 'c' + i }
  }
  return { posts, comments }
}

function addComment(state: State, postId: number): State {
  const id = state.comments.ids.length + 1
  return {
    ...state,
    comments: {
      ids: [...state.comments.ids, id],
      entities: {
        ...state.comments.entities,
        [id]: { id, postId, text: 'c' + id },
      },
    },
  }
}

function updateScore(state: State, postId: number, score: number): State {
  return {
    ...state,
    posts: {
      ...state.posts,
      entities: {
        ...state.posts.entities,
        [postId]: { ...state.posts.entities[postId], score },
      },
    },
  }
}

function expectedCommentCount(state: State, postId: number): number {
  return Object.values(state.comments.entities).filter(
    (c) => c.postId === postId,
  ).length
}

const selectAllComments = createSelector(
  [(s: State) => s.comments.ids, (s: State) => s.comments.entities],
  (ids, entities) => ids.map((id) => entities[id]),
)
const selectPostById = (s: State, postId: number) => s.posts.entities[postId]

const selectPostWithComments = createSelector(
  [(s: State, postId: number) => selectPostById(s, postId), selectAllComments],
  (post, comments) => ({
    ...post,
    commentCount: comments.filter((c) => c.postId === post.id).length,
  }),
)

// Mirrors useSignalSelector's deep tier: a computed with leaf-object tracking
// plus an effect subscribed to it, so that dropping the last subscriber of a
// path signal releases it from the registry.
function mountHook<R>(
  getState: () => State,
  selector: (s: State) => R,
  registry: PathSignalRegistry,
) {
  let evals = 0
  let last: R | undefined
  const scope = alienEngine.createScope()
  scope.run(() => {
    const computed = alienEngine.computed(() => {
      evals++
      const leafTracker: LeafObjectTracker = {
        accessedObjects: new Map(),
        traversedPaths: new Set(),
      }
      const proxy = createTrackingProxy(
        getState(),
        '',
        registry,
        registry.proxyCache,
        leafTracker,
      )
      const result = selector(proxy as State)
      const proxyPath = getProxyPath(result)
      if (proxyPath !== undefined) registry.getOrCreate(proxyPath, result).get()
      for (const [objPath, rawValue] of leafTracker.accessedObjects) {
        if (!leafTracker.traversedPaths.has(objPath) && objPath !== '') {
          registry.getOrCreate(objPath, rawValue).get()
        }
      }
      return result
    })
    alienEngine.effect(() => {
      last = computed.get()
    })
  })
  return {
    getEvals: () => evals,
    getLast: () => last,
    stop: () => scope.stop(),
  }
}

// Records which path signals the registry creates and releases.
function instrument(registry: PathSignalRegistry) {
  let created: string[] = []
  let released: string[] = []
  const origGetOrCreate = registry.getOrCreate
  const origRelease = registry.release
  registry.getOrCreate = (path, value) => {
    if (!registry.has(path)) created.push(path)
    return origGetOrCreate(path, value)
  }
  registry.release = (path, node) => {
    released.push(path)
    return origRelease(path, node)
  }
  return {
    drain() {
      const snapshot = { created, released }
      created = []
      released = []
      return snapshot
    },
  }
}

const isElementPath = (p: string) => /^comments\.entities\.\d+/.test(p)

describe('dependency churn with memoized collection selectors', () => {
  it('keeps element signals stable when a shared selectAll is memoized', () => {
    const registry = createPathSignalRegistry(alienEngine)
    const recorder = instrument(registry)
    let state = makeState()
    const getState = () => state

    const hookPostIds = Array.from(
      { length: NUM_HOOKS },
      (_, i) => (i % NUM_POSTS) + 1,
    )
    const hooks = hookPostIds.map((postId) =>
      mountHook(
        getState,
        (s) => selectPostWithComments(s, postId).commentCount,
        registry,
      ),
    )

    const mount = recorder.drain()
    expect(mount.created.filter(isElementPath)).toEqual([])
    expect(registry.has('comments.entities')).toBe(true)
    expect(registry.has('comments.ids')).toBe(true)

    const dispatch = (next: State) => {
      const prev = state
      state = next
      const before = hooks.map((h) => h.getEvals())
      reconcileState(prev, next, registry, alienEngine)
      const evalDeltas = hooks.map((h, i) => h.getEvals() - before[i])
      const { created, released } = recorder.drain()
      hooks.forEach((h, i) => {
        expect(h.getLast()).toBe(expectedCommentCount(state, hookPostIds[i]))
      })
      return { evalDeltas, created, released }
    }

    const commentsChanged = () => hooks.map(() => 1)
    const onlyPost = (postId: number) =>
      hookPostIds.map((id) => (id === postId ? 1 : 0))

    const steps = [
      { next: () => addComment(state, 1), evals: commentsChanged() },
      { next: () => addComment(state, 2), evals: commentsChanged() },
      { next: () => updateScore(state, 3, 10), evals: onlyPost(3) },
      { next: () => addComment(state, 3), evals: commentsChanged() },
      { next: () => updateScore(state, 1, 20), evals: onlyPost(1) },
      { next: () => addComment(state, 4), evals: commentsChanged() },
      { next: () => addComment(state, 5), evals: commentsChanged() },
    ]

    for (const step of steps) {
      const { evalDeltas, created, released } = dispatch(step.next())
      expect(evalDeltas).toEqual(step.evals)
      expect(created.filter(isElementPath)).toEqual([])
      expect(released.filter(isElementPath)).toEqual([])
    }

    hooks.forEach((h) => h.stop())
  })
})

/**
 * Shared model for the randomized differential tests: generators for
 * immutable state, state transitions and selectors, a reference evaluator,
 * and the comparison used as the oracle.
 *
 * Selectors are data (an `Expr` tree), not closures, so a failing case can
 * be printed as readable code (`show`) and replayed by seed.
 */
import fc from 'fast-check'
import { createSelector } from 'reselect'
import { getProxyTarget } from '../../../src/signals/proxyIdentity'

export type Value =
  | null
  | undefined
  | boolean
  | number
  | string
  | Value[]
  | { [key: string]: Value }

type Key = string | number
type Prim = null | boolean | number | string

export const isObj = (v: unknown): v is object =>
  typeof v === 'object' && v !== null

const isRecord = (v: unknown): v is Record<string, unknown> =>
  isObj(v) && !Array.isArray(v)

// ---------------------------------------------------------------- state

const ROOT_KEYS = ['a', 'b', 'c'] as const
const OBJ_KEYS = ['id', 'name', 'v', 'k'] as const
const ELEM_KEYS = ['name', 'v', 'k'] as const

const leafArb: fc.Arbitrary<Value> = fc.oneof(
  fc.integer({ min: 0, max: 3 }),
  fc.constantFrom('x', 'y'),
  fc.constant(null),
  fc.constant(undefined),
  fc.boolean(),
)

const valueArbs = fc.letrec<{
  value: Value
  obj: Value
  arr: Value
  keyed: Value
}>((tie) => ({
  value: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    leafArb,
    tie('obj'),
    tie('arr'),
    tie('keyed'),
  ),
  obj: fc
    .array(fc.tuple(fc.constantFrom(...OBJ_KEYS), tie('value')), {
      maxLength: 3,
    })
    .map((entries) => Object.fromEntries(entries) as Value),
  arr: fc.array(tie('value'), { maxLength: 4 }),
  // Arrays of objects carrying an `id` or `key` field, mostly with unique
  // keys. Plain `obj` values also carry `id` sometimes, which produces
  // arrays with missing and duplicate keys.
  keyed: fc
    .tuple(
      fc.constantFrom('id', 'key'),
      fc.array(
        fc.tuple(
          fc.integer({ min: 1, max: 6 }),
          fc.array(fc.tuple(fc.constantFrom(...ELEM_KEYS), tie('value')), {
            maxLength: 2,
          }),
        ),
        { maxLength: 4 },
      ),
      process.env.SIGNALS_FUZZ_KNOWN_BUGS
        ? fc.constantFrom(true, true, true, false)
        : fc.constant(true),
    )
    .map(([keyField, items, unique]) => {
      const seen = new Set<number>()
      const out: Value[] = []
      for (const [keyValue, body] of items) {
        if (unique && seen.has(keyValue)) continue
        seen.add(keyValue)
        out.push({ [keyField]: keyValue, ...Object.fromEntries(body) })
      }
      return out
    }),
}))

export const valueArb = valueArbs.value

export type State = { [key: string]: Value }

export const stateArb: fc.Arbitrary<State> = fc
  .tuple(
    fc.option(valueArb, { nil: undefined, freq: 5 }),
    fc.option(valueArb, { nil: undefined, freq: 5 }),
    fc.option(valueArb, { nil: undefined, freq: 5 }),
  )
  .map(([a, b, c]) => {
    const s: State = {}
    if (a !== undefined) s.a = a
    if (b !== undefined) s.b = b
    if (c !== undefined) s.c = c
    return deepFreeze(clone(s) as State)
  })

/** Rebuilds a value with ordinary prototypes and fresh references, so
 *  freezing never touches generator output. */
export function clone(v: Value): Value {
  if (Array.isArray(v)) return v.map(clone)
  if (isObj(v)) {
    return Object.fromEntries(
      Object.entries(v).map(([k, x]) => [k, clone(x as Value)]),
    )
  }
  return v
}

export function deepFreeze<T>(v: T): T {
  if (isObj(v) && !Object.isFrozen(v)) {
    Object.freeze(v)
    for (const k of Object.keys(v)) {
      deepFreeze((v as Record<string, unknown>)[k])
    }
  }
  return v
}

export function collectStateNodes(state: unknown): WeakSet<object> {
  const nodes = new WeakSet<object>()
  const visit = (v: unknown) => {
    if (!isObj(v) || nodes.has(v)) return
    nodes.add(v)
    for (const k of Object.keys(v)) {
      visit((v as Record<string, unknown>)[k])
    }
  }
  visit(state)
  return nodes
}

/**
 * True when `state` holds an object that was the root of an earlier state.
 * The old root's tracking proxy keeps path '' and its reads land on root
 * paths, so updates to those copies are missed (see
 * differentialRepros.spec.tsx). Always false with SIGNALS_FUZZ_KNOWN_BUGS.
 */
export function reusesOldRoot(
  state: unknown,
  previousRoots: WeakSet<object>,
): boolean {
  if (process.env.SIGNALS_FUZZ_KNOWN_BUGS || !isObj(state)) return false
  const visited = new WeakSet<object>()
  const visit = (v: unknown): boolean => {
    if (!isObj(v) || visited.has(v)) return false
    if (previousRoots.has(v)) return true
    visited.add(v)
    return Object.keys(v).some((k) => visit((v as Record<string, unknown>)[k]))
  }
  return Object.keys(state).some((k) =>
    visit((state as Record<string, unknown>)[k]),
  )
}

const keyOf = (el: unknown, field: string): string | number | undefined => {
  if (!isObj(el)) return undefined
  const kv = (el as Record<string, unknown>)[field]
  return typeof kv === 'string' || typeof kv === 'number' ? kv : undefined
}

/** The first of `id`/`key` that some element has a usable value for. */
const keyFieldOf = (arr: readonly unknown[]): string | undefined =>
  ['id', 'key'].find((f) => arr.some((el) => keyOf(el, f) !== undefined))


/**
 * Names other known bugs a dispatch from `prev` to `next` would hit (see
 * differentialRepros.spec.tsx):
 * - 'movedArray': an array element of an unkeyed array keeps its reference
 *   but moves to another index. Its cached proxy keeps the old path, so
 *   later changes at the new index can be missed.
 * - 'undefinedRootKey': a new root key holds undefined; `'k' in state`
 *   misses it.
 * Always undefined with SIGNALS_FUZZ_KNOWN_BUGS.
 */
export function knownMoveOrRootBug(
  prev: unknown,
  next: unknown,
): 'movedArray' | 'undefinedRootKey' | undefined {
  if (process.env.SIGNALS_FUZZ_KNOWN_BUGS || !isObj(prev) || !isObj(next)) {
    return undefined
  }
  const pr = prev as Record<string, unknown>
  const nr = next as Record<string, unknown>
  if (Object.keys(nr).some((k) => nr[k] === undefined && !(k in pr))) {
    return 'undefinedRootKey'
  }
  const visit = (p: unknown, n: unknown): boolean => {
    if (!isObj(p) || !isObj(n) || p === n) return false
    if (
      Array.isArray(p) &&
      Array.isArray(n) &&
      keyFieldOf(p) === undefined &&
      keyFieldOf(n) === undefined &&
      p.some((el, i) => Array.isArray(el) && n.includes(el) && n[i] !== el)
    ) {
      return true
    }
    const po = p as Record<string, unknown>
    const no = n as Record<string, unknown>
    return Object.keys(no).some((k) => visit(po[k], no[k]))
  }
  return visit(prev, next) ? 'movedArray' : undefined
}

/**
 * True when some array holds two objects with the same `id` or `key` value.
 * Duplicate keys in a keyed array can hide updates (see
 * differentialRepros.spec.tsx), so runs stop checking once a state has them,
 * unless SIGNALS_FUZZ_KNOWN_BUGS=1.
 */
export function hasDuplicateKeys(state: unknown): boolean {
  if (process.env.SIGNALS_FUZZ_KNOWN_BUGS) return false
  const visited = new WeakSet<object>()
  const visit = (v: unknown): boolean => {
    if (!isObj(v) || visited.has(v)) return false
    visited.add(v)
    if (Array.isArray(v)) {
      for (const field of ['id', 'key']) {
        const seen = new Set<unknown>()
        for (const el of v) {
          if (!isObj(el)) continue
          const kv = (el as Record<string, unknown>)[field]
          if (typeof kv !== 'string' && typeof kv !== 'number') continue
          if (seen.has(kv)) return true
          seen.add(kv)
        }
      }
    }
    return Object.keys(v).some((k) => visit((v as Record<string, unknown>)[k]))
  }
  return visit(state)
}

// ---------------------------------------------------------------- transitions

/** A path is a list of child picks, resolved against the current state at
 *  apply time (pick modulo child count), so any action applies to any
 *  state and shrinking keeps actions meaningful. */
type PickPath = number[]

export type Action =
  | { t: 'set'; path: PickPath; value: Value }
  | { t: 'setKey'; path: PickPath; key: string; value: Value }
  | { t: 'remove'; path: PickPath; pick: number }
  | { t: 'insert'; path: PickPath; at: number; value: Value }
  | { t: 'move'; path: PickPath; from: number; to: number }
  | { t: 'truncate'; path: PickPath; n: number }
  | { t: 'rekey'; path: PickPath; pick: number; id: number }
  | { t: 'clone'; path: PickPath }
  | { t: 'alias'; from: PickPath; to: PickPath }
  | { t: 'noop' }
  | { t: 'touch' }

const pathArb = fc.array(fc.nat({ max: 7 }), { maxLength: 4 })
const pickArb = fc.nat({ max: 7 })

export const actionArb: fc.Arbitrary<Action> = fc.oneof(
  { arbitrary: fc.record({ t: fc.constant('set' as const), path: pathArb, value: valueArb }), weight: 4 },
  { arbitrary: fc.record({ t: fc.constant('setKey' as const), path: pathArb, key: fc.constantFrom(...ROOT_KEYS, ...OBJ_KEYS), value: valueArb }), weight: 2 },
  { arbitrary: fc.record({ t: fc.constant('remove' as const), path: pathArb, pick: pickArb }), weight: 2 },
  { arbitrary: fc.record({ t: fc.constant('insert' as const), path: pathArb, at: pickArb, value: valueArb }), weight: 2 },
  { arbitrary: fc.record({ t: fc.constant('move' as const), path: pathArb, from: pickArb, to: pickArb }), weight: 1 },
  { arbitrary: fc.record({ t: fc.constant('truncate' as const), path: pathArb, n: fc.nat({ max: 4 }) }), weight: 1 },
  { arbitrary: fc.record({ t: fc.constant('rekey' as const), path: pathArb, pick: pickArb, id: fc.integer({ min: 1, max: 9 }) }), weight: 1 },
  { arbitrary: fc.record({ t: fc.constant('clone' as const), path: pathArb }), weight: 1 },
  { arbitrary: fc.record({ t: fc.constant('alias' as const), from: pathArb, to: pathArb }), weight: 1 },
  { arbitrary: fc.constant({ t: 'noop' as const }), weight: 1 },
  { arbitrary: fc.constant({ t: 'touch' as const }), weight: 1 },
)

function childKeys(node: unknown): Key[] {
  if (Array.isArray(node)) return node.map((_, i) => i)
  if (isObj(node)) return Object.keys(node)
  return []
}

function getIn(root: unknown, keys: Key[]): unknown {
  let node = root
  for (const k of keys) node = (node as Record<Key, unknown>)[k]
  return node
}

function resolve(root: unknown, path: PickPath): Key[] {
  const keys: Key[] = []
  let node = root
  for (const p of path) {
    const ks = childKeys(node)
    if (ks.length === 0) break
    const k = ks[p % ks.length]
    keys.push(k)
    node = (node as Record<Key, unknown>)[k]
  }
  return keys
}

/** Keys of the deepest container on the resolved path. */
function resolveContainer(root: unknown, path: PickPath): Key[] {
  const keys = resolve(root, path)
  while (keys.length > 0 && !isObj(getIn(root, keys))) keys.pop()
  return keys
}

function updateIn(node: unknown, keys: Key[], fn: (v: unknown) => unknown): unknown {
  if (keys.length === 0) return fn(node)
  const [k, ...rest] = keys
  if (Array.isArray(node)) {
    const copy = node.slice()
    copy[k as number] = updateIn(node[k as number], rest, fn)
    return copy
  }
  const rec = node as Record<string, unknown>
  return { ...rec, [k]: updateIn(rec[k], rest, fn) }
}

const shallowCopy = (v: unknown): unknown =>
  Array.isArray(v) ? v.slice() : isRecord(v) ? { ...v } : v

function applyToContainer(c: unknown, action: Action, isRoot: boolean): unknown {
  const fresh = (v: Value) => clone(v)
  if (Array.isArray(c)) {
    const len = c.length
    switch (action.t) {
      case 'setKey': {
        const copy = c.slice()
        copy[len ? action.key.length % len : 0] = fresh(action.value)
        return copy
      }
      case 'remove': {
        if (!len) return c.slice()
        const copy = c.slice()
        copy.splice(action.pick % len, 1)
        return copy
      }
      case 'insert': {
        const copy = c.slice()
        copy.splice(action.at % (len + 1), 0, fresh(action.value))
        return copy
      }
      case 'move': {
        if (!len) return c.slice()
        const copy = c.slice()
        const [item] = copy.splice(action.from % len, 1)
        copy.splice(action.to % len, 0, item)
        return copy
      }
      case 'truncate':
        return c.slice(0, action.n)
      case 'rekey': {
        if (!len) return c.slice()
        const i = action.pick % len
        const el = c[i]
        const copy = c.slice()
        if (isRecord(el)) {
          const field = 'key' in el && !('id' in el) ? 'key' : 'id'
          copy[i] = { ...el, [field]: action.id }
        }
        return copy
      }
    }
    return c.slice()
  }
  const rec = c as Record<string, unknown>
  const keys = Object.keys(rec)
  switch (action.t) {
    case 'setKey': {
      const key = isRoot
        ? ROOT_KEYS[action.key.length % ROOT_KEYS.length]
        : action.key
      return { ...rec, [key]: fresh(action.value) }
    }
    case 'remove': {
      if (!keys.length) return { ...rec }
      const { [keys[action.pick % keys.length]]: _removed, ...rest } = rec
      return rest
    }
    case 'insert': {
      const pool = isRoot ? ROOT_KEYS : OBJ_KEYS
      return { ...rec, [pool[action.at % pool.length]]: fresh(action.value) }
    }
    case 'move': {
      // Same entries in a rotated key order. A pure reorder is a known
      // miss for key enumeration (see differentialRepros.spec.tsx); set
      // SIGNALS_FUZZ_KNOWN_BUGS=1 to generate it.
      if (!keys.length || !process.env.SIGNALS_FUZZ_KNOWN_BUGS) {
        return { ...rec }
      }
      const r = action.from % keys.length
      const order = [...keys.slice(r), ...keys.slice(0, r)]
      return Object.fromEntries(order.map((k) => [k, rec[k]]))
    }
    case 'truncate':
      return Object.fromEntries(keys.slice(0, action.n).map((k) => [k, rec[k]]))
  }
  return { ...rec }
}

const rootKeyFor = (path: PickPath) => ROOT_KEYS[(path[0] ?? 0) % ROOT_KEYS.length]

export function applyAction(state: State, action: Action): State {
  let next: unknown
  switch (action.t) {
    case 'noop':
      return state
    case 'touch':
      next = { ...state }
      break
    case 'set': {
      const keys = resolve(state, action.path)
      if (keys.length === 0) keys.push(rootKeyFor(action.path))
      next = updateIn(state, keys, () => clone(action.value))
      break
    }
    case 'clone': {
      const keys = resolve(state, action.path)
      next = updateIn(state, keys, (v) => clone(v as Value))
      break
    }
    case 'alias': {
      const source = getIn(state, resolve(state, action.from))
      const keys = resolve(state, action.to)
      if (keys.length === 0) keys.push(rootKeyFor(action.to))
      next =
        keys.length === 1 && !isObj(source) && source === undefined
          ? state
          : updateIn(state, keys, () => source)
      break
    }
    default: {
      const keys = resolveContainer(state, action.path)
      next = updateIn(state, keys, (c) =>
        applyToContainer(c, action, keys.length === 0),
      )
    }
  }
  // The root stays a plain object: only container ops reach it, and those
  // keep objects as objects.
  return deepFreeze(isRecord(next) ? (next as State) : (shallowCopy(state) as State))
}

// ---------------------------------------------------------------- selectors

type Unary =
  | 'len'
  | 'keys'
  | 'values'
  | 'entries'
  | 'spreadObj'
  | 'spreadArr'
  | 'forIn'
  | 'json'
  | 'isFrozen'
  | 'isExtensible'
  | 'isArray'
  | 'hasOwn'
type Callback = 'map' | 'filter' | 'find' | 'findLast' | 'findIndex' | 'some' | 'every'

export type Expr =
  | { t: 'here' }
  | { t: 'get'; of: Expr; key: Key }
  | { t: Unary; of: Expr }
  | { t: Callback; of: Expr; fn: Expr }
  | { t: 'slice'; of: Expr; start: number; end: number }
  | { t: 'includes' | 'indexOf'; of: Expr; value: Prim }
  | { t: 'in'; of: Expr; key: Key }
  | { t: 'eq'; of: Expr; value: Prim }
  | { t: 'cond'; test: Expr; yes: Expr; no: Expr }
  | { t: 'pair'; a: Expr; b: Expr }

const primArb: fc.Arbitrary<Prim> = fc.oneof(
  fc.integer({ min: 0, max: 3 }),
  fc.constantFrom('x', 'y'),
  fc.constant(null),
  fc.boolean(),
)
const keyArb: fc.Arbitrary<Key> = fc.oneof(
  fc.constantFrom<Key>(...ROOT_KEYS, ...OBJ_KEYS, 'key'),
  fc.integer({ min: 0, max: 3 }),
)

const exprArbs = fc.letrec<{
  expr: Expr
  get: Expr
  unary: Expr
  callback: Expr
  other: Expr
}>((tie) => ({
  expr: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    { arbitrary: fc.constant<Expr>({ t: 'here' }), weight: 2 },
    { arbitrary: tie('get'), weight: 6 },
    { arbitrary: tie('unary'), weight: 2 },
    { arbitrary: tie('callback'), weight: 2 },
    { arbitrary: tie('other'), weight: 2 },
  ),
  get: fc.record({ t: fc.constant('get' as const), of: tie('expr'), key: keyArb }),
  // isFrozen / isExtensible are evaluated but not generated: state proxies
  // report their extensible shell, a documented difference (reflection
  // spec). Set SIGNALS_FUZZ_REFLECT=1 to include them.
  unary: fc.record({
    t: fc.constantFrom<Unary>(
      'len', 'keys', 'values', 'entries', 'spreadObj', 'spreadArr', 'forIn',
      'json', 'isArray', 'hasOwn',
      ...(process.env.SIGNALS_FUZZ_REFLECT ? (['isFrozen', 'isExtensible'] as const) : []),
    ),
    of: tie('expr'),
  }),
  callback: fc.record({
    t: fc.constantFrom<Callback>('map', 'filter', 'find', 'findLast', 'findIndex', 'some', 'every'),
    of: tie('expr'),
    fn: tie('expr'),
  }),
  other: fc.oneof(
    fc.record({ t: fc.constant('slice' as const), of: tie('expr'), start: fc.integer({ min: -2, max: 3 }), end: fc.integer({ min: -2, max: 4 }) }),
    fc.record({ t: fc.constantFrom('includes' as const, 'indexOf' as const), of: tie('expr'), value: primArb }),
    fc.record({ t: fc.constant('in' as const), of: tie('expr'), key: keyArb }),
    fc.record({ t: fc.constant('eq' as const), of: tie('expr'), value: primArb }),
    fc.record({ t: fc.constant('cond' as const), test: tie('expr'), yes: tie('expr'), no: tie('expr') }),
    fc.record({ t: fc.constant('pair' as const), a: tie('expr'), b: tie('expr') }),
  ),
}))

export const exprArb = exprArbs.expr

/** What a hook is given: a plain selector, or a Reselect wrapper around
 *  one. `memoRoot` takes the whole state as its only input, so its
 *  argument cache keys on the (proxied) root. */
export type SelectorSpec =
  | { kind: 'plain'; expr: Expr }
  | { kind: 'memo'; a: Expr; b: Expr }
  | { kind: 'memoRoot'; expr: Expr }

export const selectorSpecArb: fc.Arbitrary<SelectorSpec> = fc.oneof(
  { arbitrary: fc.record({ kind: fc.constant('plain' as const), expr: exprArb }), weight: 4 },
  { arbitrary: fc.record({ kind: fc.constant('memo' as const), a: exprArb, b: exprArb }), weight: 1 },
  { arbitrary: fc.record({ kind: fc.constant('memoRoot' as const), expr: exprArb }), weight: 1 },
)

const truthy = (v: unknown) => Boolean(v)

// Inside array-method callbacks, signals hands the callback a recorder
// proxy that is not an array, so `Array.isArray` and `JSON.stringify` see an
// object (a known bug, see differentialRepros.spec.tsx). Unless
// SIGNALS_FUZZ_KNOWN_BUGS=1, the model checks arrays by shape there and
// skips JSON so the fuzzer can find other problems.
const avoidKnownBugs = !process.env.SIGNALS_FUZZ_KNOWN_BUGS
let callbackDepth = 0

const isArr = (o: unknown): o is readonly unknown[] =>
  callbackDepth > 0 && avoidKnownBugs
    ? isObj(o) && typeof (o as { length?: unknown }).length === 'number'
    : Array.isArray(o)

function inCallback<T>(fn: () => T): T {
  callbackDepth++
  try {
    return fn()
  } finally {
    callbackDepth--
  }
}

export function evalExpr(e: Expr, here: unknown): unknown {
  switch (e.t) {
    case 'here':
      return here
    case 'get': {
      const o = evalExpr(e.of, here)
      return isObj(o) ? (o as Record<Key, unknown>)[e.key] : undefined
    }
    case 'pair':
      return [evalExpr(e.a, here), evalExpr(e.b, here)]
    case 'cond':
      return truthy(evalExpr(e.test, here))
        ? evalExpr(e.yes, here)
        : evalExpr(e.no, here)
    case 'eq':
      return evalExpr(e.of, here) === e.value
    case 'in': {
      const o = evalExpr(e.of, here)
      return isObj(o) ? e.key in o : undefined
    }
  }
  const o = evalExpr(e.of, here)
  switch (e.t) {
    case 'json':
      return callbackDepth > 0 && avoidKnownBugs && isObj(o)
        ? 'object'
        : JSON.stringify(o)
    case 'isArray':
      return isArr(o)
  }
  if (!isObj(o)) return undefined
  switch (e.t) {
    case 'keys':
      return Object.keys(o)
    case 'values':
      return Object.values(o)
    case 'entries':
      return Object.entries(o)
    case 'spreadObj':
      return { ...o }
    case 'forIn': {
      const out: string[] = []
      for (const k in o) out.push(k)
      return out
    }
    case 'isFrozen':
      return Object.isFrozen(o)
    case 'isExtensible':
      return Object.isExtensible(o)
    case 'hasOwn':
      return Object.prototype.hasOwnProperty.call(o, 'id')
  }
  if (!isArr(o)) return undefined
  const arr = o
  const each = inCallback
  switch (e.t) {
    case 'len':
      return arr.length
    case 'spreadArr':
      return [...arr]
    case 'slice':
      return arr.slice(e.start, e.end)
    case 'includes':
      return arr.includes(e.value)
    case 'indexOf':
      return arr.indexOf(e.value)
    case 'map':
      return arr.map((el) => each(() => evalExpr(e.fn, el)))
    case 'filter':
      return arr.filter((el) => each(() => truthy(evalExpr(e.fn, el))))
    case 'find':
      return arr.find((el) => each(() => truthy(evalExpr(e.fn, el))))
    case 'findLast':
      return arr.findLast((el) => each(() => truthy(evalExpr(e.fn, el))))
    case 'findIndex':
      return arr.findIndex((el) => each(() => truthy(evalExpr(e.fn, el))))
    case 'some':
      return arr.some((el) => each(() => truthy(evalExpr(e.fn, el))))
    case 'every':
      return arr.every((el) => each(() => truthy(evalExpr(e.fn, el))))
  }
}

const reselectOptions = {
  devModeChecks: { inputStabilityCheck: 'never', identityFunctionCheck: 'never' },
} as const

/** Builds a fresh selector function. Call once per hook and per
 *  implementation, so Reselect caches are never shared between the stock
 *  hook (raw state) and the signal hook (tracking proxies). */
export function compile(spec: SelectorSpec): (state: unknown) => unknown {
  switch (spec.kind) {
    case 'plain':
      return (s) => evalExpr(spec.expr, s)
    case 'memo':
      // A result-function cache hit returns a result whose state objects
      // were already unwrapped, so the hook loses its dependency on them
      // (see differentialRepros.spec.tsx). Unless SIGNALS_FUZZ_KNOWN_BUGS
      // is set, the result function is not cached; argsMemoize still is.
      return createSelector(
        [(s: unknown) => evalExpr(spec.a, s), (s: unknown) => evalExpr(spec.b, s)],
        (x, y) => [x, y],
        avoidKnownBugs
          ? { ...reselectOptions, memoize: <F extends (...args: never[]) => unknown>(f: F) => f }
          : reselectOptions,
      )
    case 'memoRoot':
      return createSelector(
        [(s: unknown) => s],
        (s) => evalExpr(spec.expr, s),
        reselectOptions,
      )
  }
}

/** Reference result for a spec, computed directly on raw state. */
export function expected(spec: SelectorSpec, state: unknown): unknown {
  switch (spec.kind) {
    case 'plain':
    case 'memoRoot':
      return evalExpr(spec.expr, state)
    case 'memo':
      return [evalExpr(spec.a, state), evalExpr(spec.b, state)]
  }
}

// ---------------------------------------------------------------- printing

export function show(e: Expr, here = 's'): string {
  const of = () => show((e as { of: Expr }).of, here)
  switch (e.t) {
    case 'here':
      return here
    case 'get':
      return `${of()}?.[${JSON.stringify(e.key)}]`
    case 'pair':
      return `[${show(e.a, here)}, ${show(e.b, here)}]`
    case 'cond':
      return `(${show(e.test, here)} ? ${show(e.yes, here)} : ${show(e.no, here)})`
    case 'eq':
      return `(${of()} === ${JSON.stringify(e.value)})`
    case 'in':
      return `(${JSON.stringify(e.key)} in ${of()})`
    case 'json':
      return `JSON.stringify(${of()})`
    case 'isArray':
      return `Array.isArray(${of()})`
    case 'keys':
    case 'values':
    case 'entries':
    case 'isFrozen':
    case 'isExtensible':
      return `Object.${e.t}(${of()})`
    case 'hasOwn':
      return `Object.hasOwn(${of()}, "id")`
    case 'spreadObj':
      return `{...${of()}}`
    case 'spreadArr':
      return `[...${of()}]`
    case 'forIn':
      return `forInKeys(${of()})`
    case 'len':
      return `${of()}.length`
    case 'slice':
      return `${of()}.slice(${e.start}, ${e.end})`
    case 'includes':
    case 'indexOf':
      return `${of()}.${e.t}(${JSON.stringify(e.value)})`
    default: {
      const v = `x${here.length}`
      return `${of()}.${e.t}((${v}) => ${show(e.fn, v)})`
    }
  }
}

export function showSpec(spec: SelectorSpec): string {
  switch (spec.kind) {
    case 'plain':
      return `(s) => ${show(spec.expr)}`
    case 'memo':
      return `createSelector([(s) => ${show(spec.a)}, (s) => ${show(spec.b)}], (x, y) => [x, y])`
    case 'memoRoot':
      return `createSelector([(s) => s], (s) => ${show(spec.expr)})`
  }
}

// ---------------------------------------------------------------- oracle

const fmt = (v: unknown) => {
  try {
    return JSON.stringify(v) ?? String(v)
  } catch {
    return String(v)
  }
}

/**
 * Null when `actual` matches `expected`, else a description of the first
 * difference. Containers the selector built are compared structurally;
 * state objects inside the result must be the identical raw object (the
 * signal hook strips proxies and must hand back the current state object).
 */
export function compareResults(
  want: unknown,
  actual: unknown,
  stateNodes: WeakSet<object>,
  path = '$',
): string | null {
  if (isObj(actual) && getProxyTarget(actual) !== undefined) {
    return `${path}: tracking proxy leaked into the result`
  }
  if (Object.is(want, actual)) return null
  if (!isObj(want) || !isObj(actual)) {
    return `${path}: expected ${fmt(want)}, got ${fmt(actual)}`
  }
  if (stateNodes.has(want)) {
    return `${path}: expected the current state object ${fmt(want)}, got ${
      stateNodes.has(actual) ? 'a different state object' : 'a stale object'
    } ${fmt(actual)}`
  }
  if (Array.isArray(want) !== Array.isArray(actual)) {
    return `${path}: expected ${fmt(want)}, got ${fmt(actual)}`
  }
  const wantKeys = Object.keys(want)
  const actualKeys = Object.keys(actual)
  if (wantKeys.join('\0') !== actualKeys.join('\0')) {
    return `${path}: expected keys ${fmt(wantKeys)}, got ${fmt(actualKeys)}`
  }
  for (const k of wantKeys) {
    const diff = compareResults(
      (want as Record<string, unknown>)[k],
      (actual as Record<string, unknown>)[k],
      stateNodes,
      `${path}.${k}`,
    )
    if (diff) return diff
  }
  return null
}

/**
 * True when `result` is the root state or holds it inside containers the
 * selector built. The signal hook never re-runs for root changes in that
 * case: there is no root signal, and the hook warns in dev mode when a
 * selector returns the root. Checks skip these results.
 */
export function containsRoot(result: unknown, root: object): boolean {
  if (result === root) return true
  if (!isObj(result) || getProxyTarget(result) !== undefined) return false
  const seen = new Set<object>()
  const visit = (v: unknown): boolean => {
    if (v === root) return true
    if (!isObj(v) || seen.has(v)) return false
    seen.add(v)
    return Object.values(v).some(visit)
  }
  return visit(result)
}

// ---------------------------------------------------------------- budget

/**
 * Run settings. CI uses the defaults; local and nightly fuzzing raise the
 * count, and a failure prints the seed and path to replay it:
 *   SIGNALS_FUZZ_RUNS=5000 pnpm vitest run test/signals/differential
 *   SIGNALS_FUZZ_SEED=123 SIGNALS_FUZZ_PATH="4:2:1" pnpm vitest run ...
 */
export function fuzzParams(defaultRuns: number) {
  const env = process.env
  return {
    numRuns: env.SIGNALS_FUZZ_RUNS ? Number(env.SIGNALS_FUZZ_RUNS) : defaultRuns,
    ...(env.SIGNALS_FUZZ_SEED ? { seed: Number(env.SIGNALS_FUZZ_SEED) } : {}),
    ...(env.SIGNALS_FUZZ_PATH ? { path: env.SIGNALS_FUZZ_PATH } : {}),
  }
}

export const FUZZ_TIMEOUT = 30 * 60_000

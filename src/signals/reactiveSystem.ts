/**
 * Vendored effect layer for alien-signals.
 *
 * Adapted from `alien-signals/esm/index.mjs` (v3.2.1). The graph
 * propagation itself is NOT vendored — it stays in the upstream
 * `alien-signals/system` export, which is a first-class public entry
 * point in the package's `exports` map with its own type declarations.
 *
 * Why vendor at all: `createReactiveSystem` takes an `unwatched(node)`
 * handler that fires the moment a node loses its last subscriber. That
 * is exactly the fact `pathSignalRegistry` needs in order to release a
 * path signal when the last component watching it unmounts. Upstream's
 * `index.mjs` installs a handler whose plain-signal branch is
 * deliberately empty, and it is installed once at module scope, so the
 * information is unreachable through the published API at any price.
 *
 * Differences from upstream, all deliberate:
 *
 * - `trigger`, `isSignal`, `isComputed`, `isEffect`, `isEffectScope`,
 *   `getActiveSub` and `getBatchDepth` are dropped. Nothing in this
 *   package calls them.
 * - `effectScope` is kept. `src/` never calls it, but
 *   `SignalEngine.createScope()` is used by roughly twenty test call
 *   sites and by the reconcile benchmark engine, so removing it would
 *   mean rewriting those rather than saving meaningful code.
 * - `effectOper` and `effectScopeOper` collapse into one `stopEffect`.
 *   Upstream splits them only because the effect variant additionally
 *   runs a cleanup; a scope simply has no cleanup to run.
 * - Nodes are classes that expose `get`/`set` directly instead of
 *   `Function.prototype.bind`-ed operators. The registry can then store
 *   the node itself, which makes the `unwatched` -> `release` identity
 *   check free and removes a wrapper allocation per tracked path.
 * - `unwatched`'s plain-signal branch calls back into the owning
 *   registry (see `SignalOwner`).
 *
 * `test/signals/reactiveSystemGuard.spec.ts` asserts the shape of the
 * upstream `system` export so a breaking change there fails loudly
 * rather than silently.
 */
import { createReactiveSystem } from 'alien-signals/system'
import type { Link, ReactiveNode } from 'alien-signals/system'
import type { ReactiveComputed, ReactiveSignal } from './types'

// `ReactiveFlags` is declared as a `const enum` upstream, which cannot
// be imported under `isolatedModules`. These mirror it exactly, plus
// `HasChildEffect`, which upstream's index.mjs also defines locally.
const Mutable = 1
const Watching = 2
const RecursedCheck = 4
const Recursed = 8
const Dirty = 16
const Pending = 32
const HasChildEffect = 64

/**
 * Implemented by `pathSignalRegistry`. A signal node created with an
 * owner calls `release` when it loses its last subscriber.
 */
export interface SignalOwner {
  /**
   * Drop the registry bookkeeping for `pathKey`, but only if `node` is
   * still the signal currently registered at that path.
   *
   * The identity check matters: `prune()` can delete a signal and a
   * later `getOrCreate` can install a fresh one at the same path before
   * the old node's links are torn down. Releasing on path alone would
   * then evict a live signal.
   */
  release(pathKey: string, node: ReactiveSignal<unknown>): void
}

let cycle = 0
let runDepth = 0
let batchDepth = 0
let notifyIndex = 0
let queuedLength = 0
let activeSub: ReactiveNode | undefined
const queued: (EffectNode | undefined)[] = []

function isComputedNode(node: ReactiveNode): node is ComputedNode<unknown> {
  return 'getter' in node
}

function isSignalNode(node: ReactiveNode): node is SignalNode<unknown> {
  return 'currentValue' in node
}

const { link, unlink, propagate, checkDirty, shallowPropagate } =
  createReactiveSystem({
    update(node: ReactiveNode): boolean {
      if (isComputedNode(node)) {
        return updateComputed(node)
      }
      if (isSignalNode(node)) {
        return updateSignal(node)
      }
      node.flags = Mutable
      return true
    },

    notify(node: ReactiveNode): void {
      let effect = node as EffectNode
      let insertIndex = queuedLength
      let firstInsertedIndex = insertIndex
      do {
        queued[insertIndex++] = effect
        effect.flags &= ~Watching
        const next = effect.subs?.sub as EffectNode | undefined
        if (next === undefined || !(next.flags & Watching)) {
          break
        }
        effect = next
      } while (true)
      queuedLength = insertIndex
      while (firstInsertedIndex < --insertIndex) {
        const left = queued[firstInsertedIndex]
        queued[firstInsertedIndex++] = queued[insertIndex]
        queued[insertIndex] = left
      }
    },

    unwatched(node: ReactiveNode): void {
      if (isComputedNode(node)) {
        if (node.depsTail !== undefined) {
          node.flags = Mutable | Dirty
          disposeAllDepsInReverse(node)
        }
        return
      }
      if (isSignalNode(node)) {
        // The one behavioral addition over upstream, whose branch here
        // is empty. Runs from inside `unlink`, which itself runs during
        // effect re-runs and disposal, so `release` must not read or
        // write any signal value.
        const owner = node.ownerRegistry
        if (owner !== undefined) {
          owner.release(node.ownerPath, node)
        }
        return
      }
      stopEffect(node as EffectNode)
    },
  })

export class SignalNode<T> implements ReactiveSignal<T>, ReactiveNode {
  currentValue: T
  pendingValue: T
  subs: Link | undefined = undefined
  subsTail: Link | undefined = undefined
  flags: number = Mutable
  /** Set when the registry owns this node; drives release-on-unwatch. */
  ownerRegistry: SignalOwner | undefined
  ownerPath: string

  constructor(value: T, owner?: SignalOwner, path?: string) {
    this.currentValue = value
    this.pendingValue = value
    this.ownerRegistry = owner
    this.ownerPath = path ?? ''
  }

  get(): T {
    if (this.flags & Dirty) {
      if (updateSignal(this)) {
        const subs = this.subs
        if (subs !== undefined) {
          shallowPropagate(subs)
        }
      }
    }
    const sub = activeSub
    if (sub !== undefined) {
      link(this, sub, cycle)
    }
    return this.currentValue
  }

  set(value: T): void {
    if (this.pendingValue !== (this.pendingValue = value)) {
      this.flags = Mutable | Dirty
      const subs = this.subs
      if (subs !== undefined) {
        propagate(subs, !!runDepth)
        if (!batchDepth) {
          flush()
        }
      }
    }
  }
}

export class ComputedNode<T> implements ReactiveComputed<T>, ReactiveNode {
  value: T | undefined = undefined
  subs: Link | undefined = undefined
  subsTail: Link | undefined = undefined
  deps: Link | undefined = undefined
  depsTail: Link | undefined = undefined
  flags: number = 0
  getter: (previousValue?: T) => T

  constructor(getter: (previousValue?: T) => T) {
    this.getter = getter
  }

  get(): T {
    const flags = this.flags
    if (
      flags & Dirty ||
      (flags & Pending &&
        (checkDirty(this.deps!, this) ||
          ((this.flags = flags & ~Pending), false)))
    ) {
      if (updateComputed(this)) {
        const subs = this.subs
        if (subs !== undefined) {
          shallowPropagate(subs)
        }
      }
    } else if (!flags) {
      this.flags = Mutable | RecursedCheck
      const prevSub = setActiveSub(this)
      try {
        this.value = this.getter()
      } finally {
        activeSub = prevSub
        this.flags &= ~RecursedCheck
      }
    }
    const sub = activeSub
    if (sub !== undefined) {
      link(this, sub, cycle)
    }
    return this.value as T
  }
}

/**
 * Covers both effects and effect scopes. A scope is an effect node with
 * no `fn` and no `cleanup`: it exists only to own child effects through
 * the dep links they create against it, so that stopping it cascades
 * `unwatched` down to them.
 *
 * A scope is never queued by `notify`, which only runs for nodes
 * carrying the `Watching` flag — scopes are created `Mutable`.
 */
interface EffectNode extends ReactiveNode {
  fn?: () => void | (() => void)
  cleanup?: (() => void) | undefined
  deps: Link | undefined
  depsTail: Link | undefined
  subs: Link | undefined
  subsTail: Link | undefined
  flags: number
}

function setActiveSub(sub: ReactiveNode | undefined): ReactiveNode | undefined {
  const prevSub = activeSub
  activeSub = sub
  return prevSub
}

export function startBatch(): void {
  ++batchDepth
}

export function endBatch(): void {
  if (!--batchDepth) {
    flush()
  }
}

export function signal<T>(
  initialValue: T,
  owner?: SignalOwner,
  path?: string,
): SignalNode<T> {
  return new SignalNode(initialValue, owner, path)
}

export function computed<T>(getter: (previousValue?: T) => T): ComputedNode<T> {
  return new ComputedNode(getter)
}

export function effect(fn: () => void | (() => void)): () => void {
  const e: EffectNode = {
    fn,
    cleanup: undefined,
    subs: undefined,
    subsTail: undefined,
    deps: undefined,
    depsTail: undefined,
    flags: Watching | RecursedCheck,
  }
  const prevSub = setActiveSub(e)
  if (prevSub !== undefined) {
    link(e, prevSub, 0)
    prevSub.flags |= HasChildEffect
  }
  try {
    ++runDepth
    e.cleanup = e.fn!() ?? undefined
  } finally {
    --runDepth
    activeSub = prevSub
    e.flags &= ~RecursedCheck
  }
  return () => stopEffect(e)
}

/**
 * Run `fn` with a scope node installed as the active sub, so every
 * effect created inside links itself to that scope. Stopping the scope
 * unlinks those deps, which drops each child effect's last subscriber
 * and cascades disposal through `unwatched`.
 */
export function effectScope(fn: () => void): () => void {
  const e: EffectNode = {
    deps: undefined,
    depsTail: undefined,
    subs: undefined,
    subsTail: undefined,
    flags: Mutable,
  }
  const prevSub = setActiveSub(e)
  if (prevSub !== undefined) {
    link(e, prevSub, 0)
    prevSub.flags |= HasChildEffect
  }
  try {
    fn()
  } finally {
    activeSub = prevSub
  }
  return () => stopEffect(e)
}

/**
 * Unlink any child effects this sub created on its previous run. They
 * are re-created by the run that follows.
 */
function unlinkChildEffects(sub: ReactiveNode): void {
  let current = sub.depsTail
  while (current !== undefined) {
    const prev = current.prevDep
    const dep = current.dep
    if (!isComputedNode(dep) && !isSignalNode(dep)) {
      unlink(current, sub)
    }
    current = prev
  }
}

function updateComputed<T>(c: ComputedNode<T>): boolean {
  if (c.flags & HasChildEffect) {
    unlinkChildEffects(c)
  }
  c.depsTail = undefined
  c.flags = Mutable | RecursedCheck
  const prevSub = setActiveSub(c)
  try {
    ++cycle
    const oldValue = c.value
    return oldValue !== (c.value = c.getter(oldValue))
  } finally {
    activeSub = prevSub
    c.flags &= ~RecursedCheck
    purgeDeps(c)
  }
}

function updateSignal<T>(s: SignalNode<T>): boolean {
  s.flags = Mutable
  return s.currentValue !== (s.currentValue = s.pendingValue)
}

function run(e: EffectNode): void {
  const flags = e.flags
  if (flags & Dirty || (flags & Pending && checkDirty(e.deps!, e))) {
    if (flags & HasChildEffect) {
      unlinkChildEffects(e)
    }
    if (e.cleanup) {
      runCleanup(e)
      if (!e.flags) {
        return
      }
    }
    e.depsTail = undefined
    e.flags = Watching | RecursedCheck
    const prevSub = setActiveSub(e)
    try {
      ++cycle
      ++runDepth
      e.cleanup = e.fn!() ?? undefined
    } finally {
      --runDepth
      activeSub = prevSub
      e.flags &= ~RecursedCheck
      purgeDeps(e)
    }
  } else if (e.deps !== undefined) {
    e.flags = Watching | (flags & HasChildEffect)
  }
}

function flush(): void {
  try {
    while (notifyIndex < queuedLength) {
      const effect = queued[notifyIndex]!
      queued[notifyIndex++] = undefined
      run(effect)
    }
  } finally {
    while (notifyIndex < queuedLength) {
      const effect = queued[notifyIndex]!
      queued[notifyIndex++] = undefined
      effect.flags |= Watching | Recursed
    }
    notifyIndex = 0
    queuedLength = 0
  }
}

function runCleanup(e: EffectNode): void {
  const cleanup = e.cleanup
  e.cleanup = undefined
  const prevSub = activeSub
  activeSub = undefined
  try {
    cleanup!()
  } finally {
    activeSub = prevSub
  }
}

/**
 * Dispose an effect or an effect scope: drop its flags, unlink every
 * dep it holds (which is what cascades `unwatched` down through
 * computeds to path signals), detach it from its parent, then run its
 * cleanup if it has one.
 */
function stopEffect(e: EffectNode): void {
  e.flags = 0
  disposeAllDepsInReverse(e)
  const sub = e.subs
  if (sub !== undefined) {
    unlink(sub)
  }
  if (e.cleanup) {
    runCleanup(e)
  }
}

function disposeAllDepsInReverse(sub: ReactiveNode): void {
  let current = sub.depsTail
  while (current !== undefined) {
    const prev = current.prevDep
    unlink(current, sub)
    current = prev
  }
}

function purgeDeps(sub: ReactiveNode): void {
  const depsTail = sub.depsTail
  let dep = depsTail !== undefined ? depsTail.nextDep : sub.deps
  while (dep !== undefined) {
    dep = unlink(dep, sub)
  }
}

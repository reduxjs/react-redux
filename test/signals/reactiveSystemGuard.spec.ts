/**
 * `src/signals/reactiveSystem.ts` vendors alien-signals' effect layer on
 * top of the upstream `alien-signals/system` export. That export is a
 * first-class entry in the package's `exports` map with its own type
 * declarations, but it is still a lower-level API than most consumers
 * touch.
 *
 * These tests pin the two things the vendored layer actually depends
 * on, so a breaking change on upgrade fails here with a clear message
 * instead of surfacing as a subtle graph bug somewhere else.
 */
import { describe, expect, it } from 'vitest'
import { createReactiveSystem } from 'alien-signals/system'
import { alienEngine } from '../../src/signals/engine'
import type { SignalOwner } from '../../src/signals/reactiveSystem'
import type { ReactiveSignal } from '../../src/signals/types'

describe('alien-signals/system contract', () => {
  it('returns the five graph operations the vendored layer builds on', () => {
    const system = createReactiveSystem({
      update: () => true,
      notify: () => {},
      unwatched: () => {},
    })

    expect(typeof system.link).toBe('function')
    expect(typeof system.unlink).toBe('function')
    expect(typeof system.propagate).toBe('function')
    expect(typeof system.checkDirty).toBe('function')
    expect(typeof system.shallowPropagate).toBe('function')
  })

  it('calls unwatched when a signal loses its last subscriber', () => {
    // The whole release mechanism rests on this one callback firing.
    const released: string[] = []
    const owner: SignalOwner = {
      release(pathKey: string, _node: ReactiveSignal<unknown>): void {
        released.push(pathKey)
      },
    }

    const watched = alienEngine.signal(1, owner, 'some.path')
    const unwatchedSignal = alienEngine.signal(1, owner, 'never.read')

    const stop = alienEngine.effect(() => {
      watched.get()
    })

    expect(released).toEqual([])

    stop()
    expect(released).toEqual(['some.path'])

    // A signal that was never read has no subscriber to lose, so it
    // never reports. This is the silent-leak shape the registry has to
    // avoid: every signal it creates is read in the same evaluation.
    expect(unwatchedSignal.get()).toBe(1)
    expect(released).toEqual(['some.path'])
  })

  it('reports only after the last of several subscribers goes away', () => {
    const released: string[] = []
    const owner: SignalOwner = {
      release(pathKey: string): void {
        released.push(pathKey)
      },
    }

    const shared = alienEngine.signal(0, owner, 'shared.path')
    const stopFirst = alienEngine.effect(() => {
      shared.get()
    })
    const stopSecond = alienEngine.effect(() => {
      shared.get()
    })

    stopFirst()
    expect(released).toEqual([])

    stopSecond()
    expect(released).toEqual(['shared.path'])
  })
})

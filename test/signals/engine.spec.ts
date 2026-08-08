import { describe, it, expect, vi } from 'vitest'
import { alienEngine } from '../../src/signals/engine'

describe('SignalEngine (alien-signals)', () => {
  describe('signal', () => {
    it('reads initial value', () => {
      const s = alienEngine.signal(42)
      expect(s.get()).toBe(42)
    })

    it('writes and reads new value', () => {
      const s = alienEngine.signal(0)
      s.set(10)
      expect(s.get()).toBe(10)
    })

    it('stores different value types', () => {
      const sNum = alienEngine.signal(1)
      const sStr = alienEngine.signal('hello')
      const sBool = alienEngine.signal(true)
      const sNull = alienEngine.signal<string | null>(null)

      expect(sNum.get()).toBe(1)
      expect(sStr.get()).toBe('hello')
      expect(sBool.get()).toBe(true)
      expect(sNull.get()).toBe(null)
    })
  })

  describe('computed', () => {
    it('derives value from signal', () => {
      const s = alienEngine.signal(5)
      const c = alienEngine.computed(() => s.get() * 2)
      expect(c.get()).toBe(10)
    })

    it('updates when dependency changes', () => {
      const s = alienEngine.signal(1)
      const c = alienEngine.computed(() => s.get() + 100)
      expect(c.get()).toBe(101)
      s.set(2)
      expect(c.get()).toBe(102)
    })

    it('provides propagation cutoff (same computed value does not notify)', () => {
      const s = alienEngine.signal(5)
      const c = alienEngine.computed(() => s.get() > 3) // true for 5

      let effectCount = 0
      const scope = alienEngine.createScope()
      scope.run(() => {
        alienEngine.effect(() => {
          c.get()
          effectCount++
        })
      })
      effectCount = 0

      s.set(6) // still > 3 → computed returns true → no change
      expect(effectCount).toBe(0)

      s.set(2) // now ≤ 3 → computed returns false → change
      expect(effectCount).toBe(1)

      scope.stop()
    })

    it('chains multiple computeds', () => {
      const s = alienEngine.signal(2)
      const c1 = alienEngine.computed(() => s.get() * 3)
      const c2 = alienEngine.computed(() => c1.get() + 1)
      expect(c2.get()).toBe(7)
      s.set(4)
      expect(c2.get()).toBe(13)
    })
  })

  describe('effect', () => {
    it('runs immediately on creation (within scope)', () => {
      const effectFn = vi.fn()
      const scope = alienEngine.createScope()
      scope.run(() => {
        alienEngine.effect(effectFn)
      })
      expect(effectFn).toHaveBeenCalledTimes(1)
      scope.stop()
    })

    it('re-runs when tracked signals change', () => {
      const s = alienEngine.signal(0)
      let lastSeen = -1

      const scope = alienEngine.createScope()
      scope.run(() => {
        alienEngine.effect(() => {
          lastSeen = s.get()
        })
      })
      expect(lastSeen).toBe(0)

      s.set(5)
      expect(lastSeen).toBe(5)

      scope.stop()
    })

    it('stops running after scope is disposed', () => {
      const s = alienEngine.signal(0)
      let effectCount = 0

      const scope = alienEngine.createScope()
      scope.run(() => {
        alienEngine.effect(() => {
          s.get()
          effectCount++
        })
      })
      expect(effectCount).toBe(1)

      scope.stop()
      s.set(10)
      expect(effectCount).toBe(1) // should not have run again
    })
  })

  describe('batch', () => {
    it('coalesces multiple signal updates into one propagation', () => {
      const s1 = alienEngine.signal(0)
      const s2 = alienEngine.signal(0)
      const c = alienEngine.computed(() => s1.get() + s2.get())

      let effectCount = 0
      const scope = alienEngine.createScope()
      scope.run(() => {
        alienEngine.effect(() => {
          c.get()
          effectCount++
        })
      })
      effectCount = 0

      alienEngine.batch(() => {
        s1.set(1)
        s2.set(1)
      })

      expect(effectCount).toBe(1) // single propagation, not 2
      expect(c.get()).toBe(2)

      scope.stop()
    })

    it('handles nested batch correctly', () => {
      const s = alienEngine.signal(0)
      let effectCount = 0

      const scope = alienEngine.createScope()
      scope.run(() => {
        alienEngine.effect(() => {
          s.get()
          effectCount++
        })
      })
      effectCount = 0

      alienEngine.batch(() => {
        s.set(1)
        alienEngine.batch(() => {
          s.set(2)
        })
        s.set(3)
      })

      // Only the final value should be seen after batch
      expect(s.get()).toBe(3)
      // Effect should have run once (or a small number), not 3 times
      expect(effectCount).toBeLessThanOrEqual(1)

      scope.stop()
    })
  })

  describe('createScope', () => {
    it('returns value from run()', () => {
      const scope = alienEngine.createScope()
      const result = scope.run(() => 42)
      expect(result).toBe(42)
      scope.stop()
    })

    it('disposes all effects when stopped', () => {
      const s1 = alienEngine.signal(0)
      const s2 = alienEngine.signal(0)
      let effect1Count = 0
      let effect2Count = 0

      const scope = alienEngine.createScope()
      scope.run(() => {
        alienEngine.effect(() => {
          s1.get()
          effect1Count++
        })
        alienEngine.effect(() => {
          s2.get()
          effect2Count++
        })
      })
      expect(effect1Count).toBe(1)
      expect(effect2Count).toBe(1)

      scope.stop()
      s1.set(1)
      s2.set(1)
      expect(effect1Count).toBe(1) // not re-run
      expect(effect2Count).toBe(1) // not re-run
    })
  })
})

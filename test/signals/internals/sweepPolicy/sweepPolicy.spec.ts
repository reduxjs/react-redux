import { writeFileSync } from 'node:fs'
import {
  delayedSweepPolicy,
  fixedDelaySweepPolicy,
  sweepImmediately,
} from '../../../../src/signals/sweepPolicy'
import type { SweepPolicyFactory } from '../../../../src/signals/sweepPolicy'
import { scenarios } from './scenarios'
import { simulate } from './simulate'
import type { Metrics } from './simulate'

const policies: Record<string, SweepPolicyFactory> = {
  'sweep immediately': sweepImmediately,
  'fixed delay 16': fixedDelaySweepPolicy({ dispatches: 16 }),
  'fixed 16 + 100 ms': delayedSweepPolicy({ dispatches: 16, ms: 100 }),
  'backoff 16 x2 to 256': delayedSweepPolicy({
    dispatches: 16,
    growth: 2,
    maxDispatches: 256,
  }),
  'backoff 4 x4 to 256': delayedSweepPolicy({
    dispatches: 4,
    growth: 4,
    maxDispatches: 256,
  }),
  'backoff 16 x2 to 256 + 100 ms': delayedSweepPolicy({
    dispatches: 16,
    ms: 100,
    growth: 2,
    maxDispatches: 256,
  }),
}

/**
 * Policy -> scenario -> the limit of that policy that makes it break the
 * scenario's limits. These follow from how each policy is defined, not
 * from mistakes in the code: the policies other than the default
 * ('fixed 16 + 100 ms') are here to compare against, and each one gives up
 * something. A delayed policy forgets a swept path after one more delay,
 * so it only learns from a read that comes back within that window.
 */
const knownShortfalls: Record<string, Record<string, string>> = {
  'sweep immediately': {
    'dependency moves between components':
      'every move that waits a dispatch re-registers the collection',
    'high-rate feed': 'sweeps before any read comes back',
    'flag-dependent selector': 'sweeps before any read comes back',
    mixed: 'every move that waits a dispatch re-registers the collection',
  },
  'fixed delay 16': {
    'high-rate feed':
      'counts dispatches, so a 10-60 ms gap at 1 ms per dispatch is too long',
    'flag-dependent selector':
      'never grows its delay, so paths that come back after 17-40 dispatches are re-registered every time',
  },
  'fixed 16 + 100 ms': {
    // At 16 ms per dispatch the time floor passes before 16 dispatches do.
    'flag-dependent selector':
      'never grows its delay, so paths that come back after 17-40 dispatches are re-registered every time',
  },
  'backoff 16 x2 to 256': {
    'high-rate feed':
      'doubling from 16 takes two sweeps of each path to cover 60-dispatch gaps',
  },
  'backoff 4 x4 to 256': {
    'dependency moves between components':
      'starts at 4 dispatches and forgets after 4 more, so gaps of 12-15 re-register before a 5-8 gap teaches it',
    'high-rate feed':
      'every 10-60 dispatch gap outlasts the 4-dispatch forget window, so it never learns',
    mixed:
      'starts at 4 dispatches and forgets after 4 more, so gaps of 12-15 re-register before a 5-8 gap teaches it',
  },
}

function formatTables(
  results: Record<string, Record<string, Metrics>>,
): string {
  const out: string[] = []
  for (const [scenario, byPolicy] of Object.entries(results)) {
    const rows = Object.entries(byPolicy)
    const columns = Object.keys(rows[0][1]) as (keyof Metrics)[]
    out.push(`### ${scenario}`, '')
    out.push(`| policy | ${columns.join(' | ')} |`)
    out.push(`|---|${columns.map(() => '---:').join('|')}|`)
    for (const [policy, metrics] of rows) {
      out.push(`| ${policy} | ${columns.map((c) => metrics[c]).join(' | ')} |`)
    }
    out.push('')
  }
  return out.join('\n')
}

describe('sweep policies against usage scenarios', () => {
  const results: Record<string, Record<string, Metrics>> = {}

  for (const [policyName, factory] of Object.entries(policies)) {
    describe(policyName, () => {
      for (const scenario of scenarios) {
        const shortfall = knownShortfalls[policyName]?.[scenario.name]
        const run = shortfall === undefined ? it : it.fails
        const title =
          shortfall === undefined
            ? scenario.name
            : `${scenario.name} (known limit: ${shortfall})`
        run(title, () => {
          const metrics = simulate(factory, scenario.trace)
          ;(results[scenario.name] ??= {})[policyName] = metrics
          expect(scenario.check(metrics, scenario.trace)).toEqual([])
        })
      }
    })
  }

  // SWEEP_POLICY_TABLE=<file> writes every metric as markdown tables.
  const tableFile = process.env.SWEEP_POLICY_TABLE
  if (tableFile) {
    afterAll(() => {
      writeFileSync(tableFile, formatTables(results))
    })
  }
})

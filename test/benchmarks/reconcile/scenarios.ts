/**
 * Benchmark scenario definitions.
 * Each scenario constructs frozen state with structural sharing,
 * sets up a registry with appropriate tracked paths, and provides
 * forward/reverse state pairs for diffing.
 */
import type { PathSignalRegistry } from '../../../src/signals/pathSignalRegistry'
import { benchEngine } from './benchEngine'
import {
  createPathSignalRegistry,
  registerEntityArrayPaths,
  registerAllPaths,
  registerWideFlatPaths,
} from './registryHelper'
import {
  buildEntityShift,
  buildEntitySingleUpdate,
  buildEntityBulkUpdate,
  buildDeepNested,
  buildWideFlat,
  buildArrayReorder,
  buildArrayAppend,
} from './stateBuilders'

export interface BenchmarkScenario {
  name: string
  description: string
  forward: { prev: unknown; next: unknown }
  reverse: { prev: unknown; next: unknown }
  registry: PathSignalRegistry
  trackedPaths: number
}

function makeScenario(
  name: string,
  description: string,
  forward: { prev: unknown; next: unknown },
  reverse: { prev: unknown; next: unknown },
  setupRegistry: (registry: PathSignalRegistry, state: unknown) => void,
): BenchmarkScenario {
  const registry = createPathSignalRegistry(benchEngine)
  setupRegistry(registry, forward.prev)
  return {
    name,
    description,
    forward,
    reverse,
    registry,
    trackedPaths: registry.size(),
  }
}

export function createScenarios(): BenchmarkScenario[] {
  const entityShift = buildEntityShift(1000)
  const entitySingle = buildEntitySingleUpdate(1000)
  const entityBulk = buildEntityBulkUpdate(1000)
  const deepNested = buildDeepNested(5, 5)
  const wideFlat = buildWideFlat(500, 5)
  const arrayReorder = buildArrayReorder(100)
  const arrayAppend = buildArrayAppend(1000, 10)

  return [
    makeScenario(
      'entity-shift',
      'Remove first of 1000 entities (flat array), all shift by 1',
      entityShift.forward,
      entityShift.reverse,
      (reg, state) => registerEntityArrayPaths(state as Record<string, unknown>, 'entities', reg),
    ),
    makeScenario(
      'entity-single-update',
      'Update 1 entity name in 1000 (structural sharing)',
      entitySingle.forward,
      entitySingle.reverse,
      (reg, state) => registerEntityArrayPaths(state as Record<string, unknown>, 'entities', reg),
    ),
    makeScenario(
      'entity-bulk-update',
      'Update 10% of 1000 entities (every 10th, structural sharing)',
      entityBulk.forward,
      entityBulk.reverse,
      (reg, state) => registerEntityArrayPaths(state as Record<string, unknown>, 'entities', reg),
    ),
    makeScenario(
      'deep-nested',
      '5-level deep (breadth=5), change one leaf',
      deepNested.forward,
      deepNested.reverse,
      (reg, state) => registerAllPaths(state, '', reg),
    ),
    makeScenario(
      'wide-flat',
      '500 top-level keys (2 fields each), change 5',
      wideFlat.forward,
      wideFlat.reverse,
      (reg, state) => registerWideFlatPaths(state as Record<string, unknown>, reg),
    ),
    makeScenario(
      'array-reorder',
      'Reverse 100-element entity array',
      arrayReorder.forward,
      arrayReorder.reverse,
      (reg, state) => registerEntityArrayPaths(state as Record<string, unknown>, 'items', reg),
    ),
    makeScenario(
      'array-append',
      'Append 10 items to 1000-element array',
      arrayAppend.forward,
      arrayAppend.reverse,
      (reg, state) => registerEntityArrayPaths(state as Record<string, unknown>, 'items', reg),
    ),
  ]
}

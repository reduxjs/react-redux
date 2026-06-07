/**
 * State construction helpers for benchmark scenarios.
 * All state is deeply frozen to simulate Immer-produced Redux state.
 * Forward/reverse pairs share structure to simulate Immer's structural sharing.
 */

export function deepFreeze<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj
  Object.freeze(obj)
  if (Array.isArray(obj)) {
    for (let i = 0; i < obj.length; i++) deepFreeze(obj[i])
  } else {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      deepFreeze((obj as Record<string, unknown>)[keys[i]])
    }
  }
  return obj
}

interface Entity {
  id: string
  name: string
  email: string
  status: string
  score: number
}

function makeEntity(i: number): Entity {
  return {
    id: `entity-${i}`,
    name: `User ${i}`,
    email: `user${i}@example.com`,
    status: i % 3 === 0 ? 'active' : i % 3 === 1 ? 'inactive' : 'pending',
    score: i * 10,
  }
}

// --------------- Scenario: entity-shift ---------------
// Remove first entity from a flat array of 1000, shifting all others
export function buildEntityShift(count = 1000) {
  const entities: Entity[] = []
  for (let i = 0; i < count; i++) entities.push(makeEntity(i))
  const base = deepFreeze({ entities })

  // Remove first entity — everything shifts
  const shifted = entities.slice(1)
  const next = deepFreeze({ entities: shifted })

  // Reverse: put it back (go from shifted → base)
  return { forward: { prev: base, next }, reverse: { prev: next, next: base } }
}

// --------------- Scenario: entity-single-update ---------------
// Update one entity's name in a flat array of 1000
export function buildEntitySingleUpdate(count = 1000) {
  const entities: Entity[] = []
  for (let i = 0; i < count; i++) entities.push(makeEntity(i))
  const base = deepFreeze({ entities })

  // Structural sharing: new array with only index 500 changed
  const midIdx = Math.floor(count / 2)
  const updatedEntities = [...entities]
  updatedEntities[midIdx] = { ...entities[midIdx], name: 'UPDATED' }
  // Freeze only the new objects, reuse frozen originals at other indices
  Object.freeze(updatedEntities[midIdx])
  Object.freeze(updatedEntities)
  const next = deepFreeze({ entities: updatedEntities })

  return { forward: { prev: base, next }, reverse: { prev: next, next: base } }
}

// --------------- Scenario: entity-bulk-update ---------------
// Update 10% of entities (every 10th)
export function buildEntityBulkUpdate(count = 1000) {
  const entities: Entity[] = []
  for (let i = 0; i < count; i++) entities.push(makeEntity(i))
  const base = deepFreeze({ entities })

  const updatedEntities = [...entities]
  for (let i = 0; i < count; i += 10) {
    updatedEntities[i] = { ...entities[i], score: entities[i].score + 1 }
    Object.freeze(updatedEntities[i])
  }
  Object.freeze(updatedEntities)
  const next = deepFreeze({ entities: updatedEntities })

  return { forward: { prev: base, next }, reverse: { prev: next, next: base } }
}

// --------------- Scenario: deep-nested ---------------
// 5-level deep object, change one leaf
export function buildDeepNested(depth = 5, breadth = 5) {
  function buildLevel(d: number): Record<string, unknown> {
    const obj: Record<string, unknown> = {}
    if (d === 0) {
      for (let i = 0; i < breadth; i++) {
        obj[`leaf${i}`] = `value-${i}`
      }
    } else {
      for (let i = 0; i < breadth; i++) {
        obj[`level${i}`] = buildLevel(d - 1)
      }
    }
    return obj
  }

  const base = deepFreeze(buildLevel(depth))

  // Change one deep leaf with structural sharing along the path
  // Path: level0.level0.level0.level0.level0.leaf0
  function changeDeepLeaf(state: Record<string, unknown>, d: number): Record<string, unknown> {
    if (d === 0) {
      return { ...state, leaf0: 'CHANGED' }
    }
    return { ...state, level0: changeDeepLeaf(state.level0 as Record<string, unknown>, d - 1) }
  }

  const next = deepFreeze(changeDeepLeaf(base, depth))

  return { forward: { prev: base, next }, reverse: { prev: next, next: base } }
}

// --------------- Scenario: wide-flat ---------------
// Single object with many top-level keys, change a few
export function buildWideFlat(width = 500, changes = 5) {
  const obj: Record<string, unknown> = {}
  for (let i = 0; i < width; i++) {
    obj[`key${i}`] = { value: i, label: `item-${i}` }
  }
  const base = deepFreeze(obj)

  const next: Record<string, unknown> = { ...obj }
  const changeIndices: number[] = []
  for (let c = 0; c < changes; c++) {
    const idx = Math.floor((width / changes) * c)
    changeIndices.push(idx)
    next[`key${idx}`] = { value: idx + 1000, label: `item-${idx}-updated` }
    Object.freeze(next[`key${idx}`])
  }
  Object.freeze(next)

  return {
    forward: { prev: base, next: next as Record<string, unknown> },
    reverse: { prev: next as Record<string, unknown>, next: base },
    meta: { changeIndices },
  }
}

// --------------- Scenario: array-reorder ---------------
// Reverse the order of a 100-element array
export function buildArrayReorder(count = 100) {
  const items: Entity[] = []
  for (let i = 0; i < count; i++) items.push(makeEntity(i))
  const base = deepFreeze({ items })

  const reversed = [...items].reverse()
  Object.freeze(reversed)
  const next = deepFreeze({ items: reversed })

  return { forward: { prev: base, next }, reverse: { prev: next, next: base } }
}

// --------------- Scenario: array-append ---------------
// Append 10 items to a 1000-element array (with structural sharing for unchanged items)
export function buildArrayAppend(count = 1000, appendCount = 10) {
  const items: Entity[] = []
  for (let i = 0; i < count; i++) items.push(makeEntity(i))
  const base = deepFreeze({ items })

  const newItems = [...items]
  for (let i = 0; i < appendCount; i++) {
    newItems.push(makeEntity(count + i))
    Object.freeze(newItems[count + i])
  }
  Object.freeze(newItems)
  const next = deepFreeze({ items: newItems })

  return { forward: { prev: base, next }, reverse: { prev: next, next: base } }
}

export { COLS, ROWS, ALL_SHAPES, ACHIEVABLE, IMPOSSIBLE, mk, emb, personAt, petAt } from './shapes'
export type { Grid, Shape } from './shapes'

export { FILLS, randomFill, makeCell, n4, n8, lockedCount, getFrontier } from './cells'
export type { Fill, Cell } from './cells'

export { planBox, planEmergentBox, stepBox, snapshotGrid, createSequencer } from './simulation'
export type { Phase, Box, Sequencer, EvaluationResult } from './simulation'

export { drawPixelBlock, drawFlap, computeLayout, drawScanlines, drawBox, setTileTint } from './renderer'
export type { LayoutMetrics } from './renderer'

export { generateGrid, gridToText } from './generators'

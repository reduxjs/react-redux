/** True when the suite runs with `react-redux` aliased to the signal hooks. */
export const IS_SIGNALS = process.env.TEST_IMPL === 'signals'

/** Hook options that turn off the dev-mode selector stability check. */
export const noStabilityCheck = {
  devModeChecks: { stabilityCheck: 'never' as const },
}

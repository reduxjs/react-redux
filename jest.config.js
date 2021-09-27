const { defaults: tsjPreset } = require('ts-jest/presets')

const defaults = {
  coverageDirectory: './coverage/',
  collectCoverage: true,
  testEnvironment: 'jsdom',
  testURL: 'http://localhost',
}

const NORMAL_TEST_FOLDERS = ['components', 'hooks', 'integration', 'utils']

const tsTestFolderPath = (folderName) =>
  `<rootDir>/test/${folderName}/**/*.{ts,tsx}`

const tsStandardConfig = {
  ...defaults,
  displayName: 'ReactDOM',
  preset: 'ts-jest',
  testMatch: NORMAL_TEST_FOLDERS.map(tsTestFolderPath),
}

const rnConfig = {
  ...defaults,
  displayName: 'React Native',
  testMatch: [tsTestFolderPath('react-native')],
  preset: 'react-native',
  transform: {
    '^.+\\.js$': '<rootDir>/node_modules/react-native/jest/preprocessor.js',
    ...tsjPreset.transform,
  },
}

module.exports = {
  projects: [tsStandardConfig, rnConfig],
}

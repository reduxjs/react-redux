const { defaults: tsjPreset } = require('ts-jest/presets')

const defaults = {
  coverageDirectory: './coverage/',
  collectCoverage: true,
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

const compatEntryConfig = {
  ...tsStandardConfig,
  displayName: 'Compat',
  moduleNameMapper: {
    '^react$': 'react-17',
    '^react-dom$': 'react-dom-17',
    '^react-test-renderer$': 'react-test-renderer-17',
    '^@testing-library/react$': '@testing-library/react-12',
    '../../src/index': '<rootDir>/src/compat',
  },
}

module.exports = {
  projects: [tsStandardConfig, rnConfig, compatEntryConfig],
}

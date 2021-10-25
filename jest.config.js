const defaults = {
  coverageDirectory: './coverage/',
  collectCoverage: true,
  testURL: 'http://localhost',
}

const testFolderPath = (folderName) => `<rootDir>/test/${folderName}/**/*.js`

const NORMAL_TEST_FOLDERS = ['components', 'hooks', 'integration', 'utils']

const standardConfig = {
  ...defaults,
  displayName: 'ReactDOM',
  testEnvironment: 'jsdom',
  testMatch: NORMAL_TEST_FOLDERS.map(testFolderPath),
}

const rnConfig = {
  ...defaults,
  displayName: 'React Native',
  testMatch: [testFolderPath('react-native')],
  preset: 'react-native',
  transform: {
    '^.+\\.js$': '<rootDir>/node_modules/react-native/jest/preprocessor.js',
  },
}

module.exports = {
  projects: [standardConfig, rnConfig],
}

process.env.TS_JEST_DISABLE_VER_CHECKER = true

const NORMAL_TEST_FOLDERS = ['components', 'hooks', 'integration', 'utils']

const tsTestFolderPath = (folderName) =>
  `<rootDir>/test/${folderName}/**/*.{ts,tsx}`

const tsStandardConfig = {
  displayName: 'ReactDOM 18',
  preset: 'ts-jest',
  testMatch: NORMAL_TEST_FOLDERS.map(tsTestFolderPath),
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setupAfter.js'],
}

const rnConfig = {
  displayName: 'React Native',
  testMatch: [tsTestFolderPath('react-native')],
  preset: 'react-native',
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': [
      'babel-jest',
      { configFile: './babel.config.js' }, // <- cannot use rootDir here
    ],
  },
}

module.exports = {
  projects: [tsStandardConfig, rnConfig],
}

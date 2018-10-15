const npmRun = require('npm-run')
const LATEST_VERSION = '16.5'
const version = process.env.REACT || LATEST_VERSION

const jestConfig = {
  testURL: 'http://localhost',
  collectCoverage: true,
  coverageDirectory: `${__dirname}/coverage`,
  transform: {
    '.js$': `${__dirname}/babel-transformer.jest.js`,
  },
}

require('./install-test-deps.js')

if (version.toLowerCase() === 'all') {
  const allVersionsConfig = {
    ...jestConfig,
    rootDir: __dirname,
    // every directory has the same coverage, so we collect it only from one
    collectCoverageFrom: [`react/${LATEST_VERSION}/src/**.js`]
  }
  npmRun.execSync(`node ./node_modules/.bin/jest -c '${JSON.stringify(allVersionsConfig)}'`, { stdio: 'inherit' })
} else {
  try {
    const specificVersionConfig = {
      ...jestConfig,
      rootDir: `${__dirname}/react/${version}`,
    }
    npmRun.execSync(`cd test/react/${version} && npm test -- -c '${JSON.stringify(specificVersionConfig)}'`, { stdio: 'inherit' })
  } finally {
    npmRun.execSync('cd ../../..')
  }
}

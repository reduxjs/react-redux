const npmRun = require('npm-run')
const fs = require('fs')
const path = require('path')
const LATEST_VERSION = '16.6'
const version = process.env.REACT || LATEST_VERSION

let jestConfig = {
  testURL: 'http://localhost',
  collectCoverage: true,
  coverageDirectory: `${__dirname}/coverage`,
  transform: {
    '.js$': `${__dirname}/babel-transformer.jest.js`
  }
}

require('./install-test-deps.js')

if (version.toLowerCase() === 'all') {
  jestConfig = {
    ...jestConfig,
    rootDir: __dirname,
    // every directory has the same coverage, so we collect it only from one
    collectCoverageFrom: [`react/${LATEST_VERSION}/src/**.js`]
  }
} else {
  jestConfig = {
    ...jestConfig,
    rootDir: `${__dirname}/react/${version}`
  }
}

const configFilePath = path.join(__dirname, 'jest-config.json')

fs.writeFileSync(configFilePath, JSON.stringify(jestConfig))

const commandLine = `jest -c "${configFilePath}" ${process.argv
  .slice(2)
  .join(' ')}`

npmRun.execSync(commandLine, { stdio: 'inherit' })

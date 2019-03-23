/* eslint no-console: 0 */
'use strict'

const { readdirSync, existsSync, copyFile, mkdirSync } = require('fs')
const rimraf = require('rimraf')
const { join } = require('path')
const spawn = require('cross-spawn')
const reactVersion = process.env.REACT || '16.8'

readdirSync(join(__dirname, 'react')).forEach(version => {
  if (reactVersion.toLowerCase() !== 'all' && version !== reactVersion) {
    console.log(`skipping ${version}, ${reactVersion} was specified`)
    return
  }
  const tests = [
    join(__dirname, 'components'),
    join(__dirname, 'integration'),
    join(__dirname, 'utils')
  ]
  const srcs = [
    join(__dirname, '..', 'src', 'components'),
    join(__dirname, '..', 'src', 'connect'),
    join(__dirname, '..', 'src', 'utils')
  ]
  const dest = [
    join(__dirname, 'react', version, 'test', 'components'),
    join(__dirname, 'react', version, 'test', 'integration'),
    join(__dirname, 'react', version, 'test', 'utils')
  ]
  const srcDest = [
    join(__dirname, 'react', version, 'src', 'components'),
    join(__dirname, 'react', version, 'src', 'connect'),
    join(__dirname, 'react', version, 'src', 'utils')
  ]

  if (!existsSync(join(__dirname, 'react', version, 'test'))) {
    mkdirSync(join(__dirname, 'react', version, 'test'))
  }

  if (!existsSync(join(__dirname, 'react', version, 'src'))) {
    mkdirSync(join(__dirname, 'react', version, 'src'))
  }

  console.log('Copying test files')
  tests.forEach((dir, i) => {
    if (existsSync(dest[i])) {
      console.log('clearing old tests in ' + dest[i])
      rimraf.sync(join(dest[i], '*'))
    } else {
      mkdirSync(dest[i])
    }
    readdirSync(dir).forEach(file => {
      copyFile(join(tests[i], file), join(dest[i], file), e => {
        if (e) console.log(e)
      })
    })
  })
  console.log('Copying source files')
  srcs.forEach((dir, i) => {
    if (existsSync(srcDest[i])) {
      console.log('clearing old sources in ' + srcDest[i])
      rimraf.sync(join(srcDest[i], '*'))
    } else {
      if (!existsSync(join(__dirname, 'react', version, 'src'))) {
        mkdirSync(join(__dirname, 'react', version, 'src'))
      }
      mkdirSync(srcDest[i])
    }
    readdirSync(dir).forEach(file => {
      copyFile(join(srcs[i], file), join(srcDest[i], file), e => {
        if (e) console.log(e)
      })
    })
    copyFile(
      join(__dirname, '..', 'src', 'index.js'),
      join(__dirname, 'react', version, 'src', 'index.js'),
      e => {
        if (e) console.log(e)
      }
    )
    copyFile(
      join(__dirname, '..', 'src', 'alternate-renderers.js'),
      join(__dirname, 'react', version, 'src', 'alternate-renderers.js'),
      e => {
        if (e) console.log(e)
      }
    )
  })
  const cwd = join(__dirname, 'react', version)
  if (
    existsSync(
      join(__dirname, 'react', version, 'node_modules', 'react', 'package.json')
    )
  ) {
    console.log(`Skipping React version ${version} ... (already installed)`)
    return
  }

  console.log(`Installing React version ${version}...`)

  const installTask = spawn.sync('npm', ['install'], {
    cwd,
    stdio: 'inherit'
  })

  if (installTask.status > 0) {
    process.exit(installTask.status)
  }
})

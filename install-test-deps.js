/* eslint no-console: 0 */
'use strict';

const {readdirSync, existsSync, copyFile, mkdirSync} = require('fs');
const rimraf = require('rimraf');
const {join} = require('path');
const {spawnSync} = require('child_process');
const reactVersion = process.env.REACT

readdirSync(join(__dirname, 'test/react')).forEach(version => {
  if (version !== reactVersion) return
  const tests = [join(__dirname, 'test', 'components'), join(__dirname, 'test', 'utils')]
  const srcs = [
    join(__dirname, 'src', 'components'),
    join(__dirname, 'src', 'connect'),
    join(__dirname, 'src', 'utils'),
  ]
  const dest = [
    join(__dirname, 'test', 'react', version, 'test', 'components'),
    join(__dirname, 'test', 'react', version, 'test', 'utils'),
  ]
  const srcDest = [
    join(__dirname, 'test', 'react', version, 'src', 'components'),
    join(__dirname, 'test', 'react', version, 'src', 'connect'),
    join(__dirname, 'test', 'react', version, 'src', 'utils'),
  ]
  console.log('Copying test files')
  tests.forEach((dir, i) => {
    if (existsSync(dest[i])) {
      console.log('clearing old tests in ' + dest[i])
      rimraf.sync(join(dest[i], '*'))
    } else {
      mkdirSync(dest[i])
    }
    readdirSync(dir).forEach(file => {
      console.log(`${join(tests[i], file)} to ${join(dest[i], file)}...`)
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
      if (!existsSync(join(__dirname, 'test', 'react', version, 'src'))) {
        mkdirSync(join(__dirname, 'test', 'react', version, 'src'))
      }
      mkdirSync(srcDest[i])
    }
    readdirSync(dir).forEach(file => {
      console.log(`${join(srcs[i], file)} to ${join(srcDest[i], file)}...`)
      copyFile(join(srcs[i], file), join(srcDest[i], file), e => {
        if (e) console.log(e)
      })
    })
    console.log(`${join(__dirname, 'src', 'index.js')} to ${join(__dirname, 'test', 'react', version, 'src', 'index.js')}...`)
    copyFile(join(__dirname, 'src', 'index.js'), join(__dirname, 'test', 'react', version, 'src', 'index.js'), e => {
      if (e) console.log(e)
    })
  })
  const cwd = join(__dirname, 'test', 'react', version);
  if (existsSync(join(__dirname, 'test', 'react', version, 'node_modules'))) {
    console.log(`Skipping React version ${version} ... (already installed)`);
    return
  }

  console.log(`Installing React version ${version} ...`);

  const spawn = spawnSync('npm', ['install'], {
    cwd,
    stdio: 'inherit',
  });

  if (spawn.status > 0) {
    process.exit(spawn.status);
  }
});
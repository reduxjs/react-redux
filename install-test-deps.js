/* eslint no-console: 0 */
'use strict';

const {readdirSync, existsSync, copyFile} = require('fs');
const {join} = require('path');
const {spawnSync} = require('child_process');

readdirSync(join(__dirname, 'test/react')).forEach(version => {
  const tests = [join(__dirname, 'test', 'components'), join(__dirname, 'test', 'utils')]
  const dest = [
    join(__dirname, 'test', 'react', version, 'test', 'components'),
    join(__dirname, 'test', 'react', version, 'test', 'utils'),
  ]
  console.log('Copying test files')
  tests.forEach((dir, i) => {
    readdirSync(dir).forEach(file => {
      console.log(`${join(tests[i], file)} to ${join(dest[i], file)}...`)
      copyFile(join(tests[i], file), join(dest[i], file), (e => {
        if (e) console.log(e)
      }))
    })
  })
  const cwd = join(__dirname, 'test', 'react', version);
  if (existsSync(join(__dirname, 'test/react', version, 'node_modules'))) {
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
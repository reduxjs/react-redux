// adapted from https://gist.github.com/merlosy/55b7f974ca2116203c6cee4e6676068f
/* eslint no-console: 0 valid-jsdoc: 0 */
/**
 * This is a node script to merge LCOV reports.
 *
 * Execute with:
 * ```
 * node merge-lcov.js coverage/app1/lcov.info coverage/app2/lcov.info to=coverage/lcov.info
 * ```
 * Optional argument: `policy=best` or `policy=sum` (default)
 * @author Jérémy Legros
 * @license MIT
 */
(function() {
  'use strict';

  const fs = require('fs');
  const lcov = require('./lcov');

  main();

  /**
   * Run merge
   */
  function main() {
    const files = process.argv;
    files.splice(0, 2);

    let destFile = 'lcov.info';
    let policy = 'sum';
    const srcFiles = [];

    files.forEach(arg => {
      if (arg.indexOf('to=') > -1) {
        destFile = getDestinationFileFromArg(arg);
      } else if (arg.indexOf('policy=') > -1) {
        policy = getPolicyFromArg(arg);
      } else if (arg.indexOf('=') > -1) {
        throw new Error(`Unsupported argument '${arg}'.`);
      } else {
        srcFiles.push(arg);
      }
    });
    console.log('merge-lcov *', srcFiles, 'to', destFile, 'with', policy);

    const srcTests = srcFiles.map(file => (file.startsWith('/') ? file : '/' + file)).map(file => {
      return parseFile(file);
    });

    const mergedSrcTests = mergeTests(srcTests, policy);

    const destBody = mergedSrcTests.map(test => test.toString()).join('\n') + '\n';
    buildDestinationFile(destBody, destFile);
  }

  /**
   * Merge tests according to policy strategy
   * @param {Test[][]} srcTests
   * @param {'best'|'sum'} policy
   * @returns {Test[]}
   */
  function mergeTests(tests, policy) {
    return tests.slice(1).reduce((acc, test) => lcov.Test.merge(acc, test, policy), tests[0]);
  }

  function parseFile(file) {
    const lines = getFileContent(file).split(/\r?\n/);
    let i = 0;
    let currentTest;
    let tests = [];
    while (i < lines.length) {
      if (lines[i] === 'end_of_record' && !!currentTest) {
        tests.push(currentTest);
        currentTest = null;
        continue;
      }
      if (!currentTest) {
        currentTest = new lcov.Test();
      }
      currentTest.addLine(lines[i]);
      i++;
    }
    return tests;
  }

  /**
   * Build destination file
   * @param {string} destBody
   * @param {string} destFile
   */
  function buildDestinationFile(destBody, destFile) {
    const destFileName = destFile.startsWith('/') ? destFile : '/' + destFile;
    fs.writeFile(process.cwd() + destFileName, destBody, err => {
      if (err) {
        console.error('!!! Error while writing', err);
        throw err;
      }
    });
  }

  /**
   * Get file content as JS object
   * @param {string} fileName
   * @returns {string} raw content
   */
  function getFileContent(fileName) {
    console.log('merge-lcov * reading', process.cwd() + fileName);
    return fs
      .readFileSync(process.cwd() + fileName, 'utf-8', (err) => {
        if (err) {
          console.error('!!! Error while reading', err);
          throw err;
        }
      })
      .toString('utf-8');
  }

  function getPolicyFromArg(arg) {
    const arr = arg.split('=');
    if (arr.length > 2 || ['best', 'sum'].indexOf(arr[1]) === -1) {
      throw new Error(`Unsupported format for argument '${arr[0]}'`);
    } else {
      return arr[1];
    }
  }

  function getDestinationFileFromArg(arg) {
    const arr = arg.split('=');
    if (arr.length > 2) {
      throw new Error(`Unsupported format for argument '${arr[0]}'`);
    } else {
      return arr[1];
    }
  }
})();
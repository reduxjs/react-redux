// from https://gist.github.com/merlosy/55b7f974ca2116203c6cee4e6676068f
/* eslint no-console: 0 valid-jsdoc: 0 */
/**
 * @see http://ltp.sourceforge.net/coverage/lcov/geninfo.1.php
 */
class Test {
  constructor() {
    this.FN = [];
    this.FNDA = [];
    this.DA = [];
    this.BRDA = [];
  }

  get fileName() {
    return this.SF.value;
  }

  /**
   * @todo maybe optimize merge algorithm ?
   * @param {Test[]} test1
   * @param {Test[]} test2
   * @param {'sum'|'best'} policy
   * @returns {Test[]}
   */
  static merge(test1, test2, policy) {
    // destructuring, assuming fileName is unique
    const obj1 = arrayToKeyedObject(test1, 'fileName');
    const obj2 = arrayToKeyedObject(test2, 'fileName');
    let obj = {};
    Object.keys(obj1).forEach(fileName => {
      if (obj2[fileName]) {
        obj[fileName] = Test[policy](obj1[fileName], obj2[fileName]);
        delete obj2[fileName];
      } else {
        obj[fileName] = obj1[fileName];
      }
    });
    // add remaning tests from obj2
    obj = { ...obj, ...obj2 };
    // return results in alpha order
    return Object.values(obj).sort((a, b) => {
      return a.fileName > b.fileName ? 1 : b.fileName > a.fileName ? -1 : 0;
    });
  }

  /**
   * Sum strategy assumes tests are mutually exclusive. `test1` is used as reference
   * @param {Test} test1
   * @param {Test} test2
   * @returns {Test}
   */
  static sum(test1, test2) {
    const test = new Test();
    test.TN = test1.TN;
    test.SF = test1.SF;
    test.FN = removeDuplicates(test1.FN.concat(test2.FN), 'fnName');
    test.FNF = test1.FNF;
    test.FNH = Math.min(test1.FNH + test2.FNH, test.FNF);

    const fnda1 = arrayToKeyedObject(test1.FNDA, 'fnName');
    const fnda2 = arrayToKeyedObject(test2.FNDA, 'fnName');
    test.FNDA = test.FN.map(fn => fn.fnName).map(fnName => {
      const execCount = parseInt(fnda1[fnName].execCount) + parseInt(fnda2[fnName].execCount);
      return TestFNDA.instance(fnName, execCount);
    });

    const da1 = arrayToKeyedObject(test1.DA, 'lineNumber');
    const da2 = arrayToKeyedObject(test2.DA, 'lineNumber');
    test.DA = test1.DA.map(fn => fn.lineNumber).map(lineNumber => {
      const execCount = parseInt(da1[lineNumber].execCount) + parseInt(da2[lineNumber].execCount);
      return TestDA.instance(lineNumber, execCount, da1.checksum);
    });

    test.LF = test1.LF;
    test.LH = Math.min(test1.LH + test2.LH, test.LF);

    const brda1 = arrayToKeyedObject(test1.BRDA, 'uniqueId');
    const brda2 = arrayToKeyedObject(test2.BRDA, 'uniqueId');
    test.BRDA = test1.BRDA.map(fn => fn.uniqueId).map(uniqueId => {
      const taken = parseInt(brda1[uniqueId].taken) + parseInt(brda2[uniqueId].taken);
      return TestBRDA.instance(uniqueId, taken);
    });

    test.BRF = test1.BRF;
    test.BRH = Math.min(test1.BRH + test2.BRH, test.BRF);

    return test;
  }

  /**
   * Best strategy pick the best version of test.
   * @param {Test} test1
   * @param {Test} test2
   * @returns {Test}
   */
  static best(test1, test2) {
    if (+test1.FNH.value >= +test2.FNH.value && +test1.LH.value >= +test2.LH.value && +test1.BRH.value >= +test2.BRH.value) {
      return Object.assign(new Test(), test1);
    } else if (+test2.FNH.value >= +test1.FNH.value && +test2.LH.value >= +test1.LH.value && +test2.BRH.value >= +test1.BRH.value) {
      return Object.assign(new Test(), test2);
    } else {
      throw new Error(`Unable to define *best* coverage for ${test1.fileName}`);
    }
  }

  addLine(line) {
    const prefix = line.split(':')[0];
    switch (prefix) {
      case 'TN':
        this.TN = new TestTN(line);
        break;
      case 'SF':
        this.SF = new TestSF(line);
        break;
      case 'FN': {
        const newFn = new TestFN(line);
        if (!this.FN.map(fn => fn.fnName).includes(newFn.fnName)) {
          this.FN.push(newFn);
        }
        break;
      }
      case 'FNF':
        this.FNF = new TestFNF(line);
        break;
      case 'FNH':
        this.FNH = new TestFNH(line);
        break;
      case 'FNDA': {
        const newFnda = new TestFNDA(line);
        if (!this.FNDA.map(fnda => fnda.fnName).includes(newFnda.fnName)) {
          this.FNDA.push(newFnda);
        }
        break;
      }
      case 'DA': {
        const newDa = new TestDA(line);
        if (!this.DA.map(da => da.lineNumber).includes(newDa.lineNumber)) {
          this.DA.push(newDa);
        }
        break;
      }
      case 'LF':
        this.LF = new TestLF(line);
        break;
      case 'LH':
        this.LH = new TestLH(line);
        break;
      case 'BRDA': {
        const newBrda = new TestBRDA(line);
        if (!this.BRDA.map(brda => brda.uniqueId).includes(newBrda.uniqueId)) {
          this.BRDA.push(newBrda);
        }
        break;
      }
      case 'BRF':
        this.BRF = new TestBRF(line);
        break;
      case 'BRH':
        this.BRH = new TestBRH(line);
        break;
      default:
        break;
    }
  }

  toString() {
    return [
      this.TN.toString(),
      this.SF.toString(),
      this.FN.map(fn => fn.toString()).join('\n'),
      this.FNF.toString(),
      this.FNH.toString(),
      this.FNDA.map(fnda => fnda.toString()).join('\n'),
      this.DA.map(da => da.toString()).join('\n'),
      this.LF.toString(),
      this.LH.toString(),
      this.BRDA.map(brda => brda.toString()).join('\n'),
      this.BRF.toString(),
      this.BRH.toString(),
      'end_of_record'
    ]
      .filter(s => !!s)
      .join('\n');
  }
}

function arrayToKeyedObject(arr, key) {
  return arr.reduce((acc, item) => {
    return {
      [item[key]]: item,
      ...acc
    };
  }, {});
}

function removeDuplicates(arr, prop) {
  return arr.filter((obj, pos, arr) => {
    return arr.map(mapObj => mapObj[prop]).indexOf(obj[prop]) === pos;
  });
}

class TestTN {
  /**
   * @param {string} line
   */
  constructor(line) {
    this.value = line.split(':')[1];
  }
  toString() {
    return 'TN:' + this.value;
  }
}

class TestSF {
  /**
   * @param {string} line
   */
  constructor(line) {
    this.value = line.substring(3);
  }
  toString() {
    return 'SF:' + this.value;
  }
}

class TestFN {
  /**
   * @param {string} line
   */
  constructor(line) {
    const values = line.split(':')[1].split(',');
    this.lineNumber = values[0];
    this.fnName = values[1];
  }
  toString() {
    return `FN:${this.lineNumber},${this.fnName}`;
  }
}

class TestFNF {
  /**
   * @param {string} line
   */
  constructor(line) {
    this.value = line.split(':')[1];
  }
  toString() {
    return 'FNF:' + this.value;
  }
}

class TestFNH {
  /**
   * @type {string}
   */
  // value = undefined;
  /**
   * @param {string} line
   */
  constructor(line) {
    this.value = line.split(':')[1];
  }
  toString() {
    return 'FNH:' + this.value;
  }
}

class TestFNDA {
  /**
   * @param {string} line
   */
  constructor(line) {
    const values = line.split(':')[1].split(',');
    this.execCount = values[0];
    this.fnName = values[1];
  }
  /**
   * @param {string} fnName
   * @param {string} execCount
   */
  static instance(fnName, execCount) {
    return new TestFNDA(`FNDA:${execCount},${fnName}`);
  }
  toString() {
    return `FNDA:${this.execCount},${this.fnName}`;
  }
}

class TestDA {
  /**
   * @param {string} line
   */
  constructor(line) {
    const values = line.split(':')[1].split(',');
    this.lineNumber = values[0];
    this.execCount = values[1];
    this.checksum = values[2] ? ',' + values[2] : '';
  }
  /**
   * @param {string} lineNumber
   * @param {string} execCount
   * @param {string} [checksum='']
   */
  static instance(lineNumber, execCount, checksum = '') {
    return new TestDA(`DA:${lineNumber},${execCount}${checksum}`);
  }
  toString() {
    return `DA:${this.lineNumber},${this.execCount}${this.checksum}`;
  }
}

class TestLF {
  /**
   * @param {string} line
   */
  constructor(line) {
    this.value = line.split(':')[1];
  }
  toString() {
    return 'LF:' + this.value;
  }
}

class TestLH {
  /**
   * @param {string} line
   */
  constructor(line) {
    this.value = line.split(':')[1];
  }
  toString() {
    return 'LH:' + this.value;
  }
}

class TestBRDA {
  /**
   * @param {string} line
   */
  constructor(line) {
    const values = line.split(':')[1].split(',');
    this.lineNumber = values[0];
    this.blockNumber = values[1];
    this.branchNumber = values[2];
    this.taken = values[3];
  }
  get uniqueId() {
    return `${this.lineNumber},${this.blockNumber},${this.branchNumber}`;
  }
  /**
   * @param {string} uniqueId
   * @param {string} taken
   */
  static instance(uniqueId, taken) {
    return new TestBRDA(`BRDA:${uniqueId},${taken}`);
  }
  toString() {
    return `BRDA:${this.uniqueId},${this.taken}`;
  }
}

class TestBRF {
  /**
   * @param {string} line
   */
  constructor(line) {
    this.value = line.split(':')[1];
  }
  toString() {
    return 'BRF:' + this.value;
  }
}

class TestBRH {
  /**
   * @param {string} line
   */
  constructor(line) {
    this.value = line.split(':')[1];
  }
  toString() {
    return 'BRH:' + this.value;
  }
}

module.exports = {
  Test,
  TestDA,
  TestFN,
  TestFNDA,
  TestFNF,
  TestFNH,
  TestLF,
  TestLH,
  TestSF,
  TestTN,
  TestBRDA,
  TestBRF,
  TestBRH
};
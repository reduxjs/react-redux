# Contributing
We are open to, and grateful for, any contributions made by the community.  By contributing to React Redux, you agree to abide by the [code of conduct](https://github.com/reduxjs/react-redux/blob/master/CODE_OF_CONDUCT.md).

## Reporting Issues and Asking Questions
Before opening an issue, please search the [issue tracker](https://github.com/reduxjs/react-redux/issues) to make sure your issue hasn't already been reported.

Please ask any general and implementation specific questions on [Stack Overflow with a Redux tag](http://stackoverflow.com/questions/tagged/redux?sort=votes&pageSize=50) for support.

## Development

Visit the [Issue tracker](https://github.com/reduxjs/react-redux/issues) to find a list of open issues that need attention.

Fork, then clone the repo:
```
git clone https://github.com/your-username/react-redux.git
```

### Building

Running the `build` task will create both a CommonJS module-per-module build and a UMD build.
```
npm run build
```

To create just a CommonJS module-per-module build:
```
npm run build:lib
```

To create just a UMD build:
```
npm run build:umd
npm run build:umd:min
```

### Testing and Linting

To run the tests in the latest React version:
```
npm run test
```

To run in explicit React versions (the number is the version, so `test:16.3` will run in React version `16.3`):
```
REACT=16.4 npm run test
```

To run tests in all supported React versions, `16.4`, 16.5`,
```
REACT=all npm run test
```

To continuously watch and run tests, run the following:
```
npm run test -- --watch
```

To perform linting with `eslint`, run the following:
```
npm run lint
```

#### Adding a new React version for testing

To add a new version of React to test react-redux against, create a directory structure
in this format for React version `XX`:

```
test/
 react/
  XX/
   package.json
   test/
```

So, for example, to test against React 15.4:


```
test/
 react/
  15.4/
   package.json
   test/
```

The package.json must include the correct versions of `react` & `react-dom`
as well as the needed `create-react-class` like this:

```json
{
  "private": true,
  "devDependencies": {
    "create-react-class": "^15.6.3",
    "react": "15.4",
    "react-dom": "15.4"
  }
}
```

Then you can run tests against this version with:

```
REACT=15.4 npm run test
```

and the new version will also be automatically included in

```
REACT=all npm run test
```

In addition, the new version should be added to the .travis.yml matrix list:

```yaml
language: node_js
node_js:
  - "8"
before_install:
  - 'nvm install-latest-npm'
env:
  matrix:
  - REACT=16.4
  - REACT=16.5
sudo: false
script:
  - npm run lint
  - npm run test
after_success:
  - npm run coverage
```

### New Features

Please open an issue with a proposal for a new feature or refactoring before starting on the work. We don't want you to waste your efforts on a pull request that we won't want to accept.

## Submitting Changes

* Open a new issue in the [Issue tracker](https://github.com/reduxjs/react-redux/issues).
* Fork the repo.
* Create a new feature branch based off the `master` branch.
* Make sure all tests pass and there are no linting errors.
* Submit a pull request, referencing any issues it addresses.

Please try to keep your pull request focused in scope and avoid including unrelated commits.

After you have submitted your pull request, we'll try to get back to you as soon as possible. We may suggest some changes or improvements.

Thank you for contributing!

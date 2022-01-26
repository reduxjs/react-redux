# Contributing

We are open to, and grateful for, any contributions made by the community. By contributing to React Redux, you agree to abide by the [code of conduct](https://github.com/reduxjs/react-redux/blob/master/CODE_OF_CONDUCT.md).

Please review the [Redux Style Guide](https://redux.js.org/style-guide/style-guide) in the Redux docs to keep track of our best practices.

## Reporting Issues and Asking Questions

Before opening an issue, please search the [issue tracker](https://github.com/reduxjs/react-redux/issues) to make sure your issue hasn't already been reported.

Please ask any general and implementation specific questions on [Stack Overflow with a Redux tag](http://stackoverflow.com/questions/tagged/redux?sort=votes&pageSize=50) for support.

## Development

Visit the [Issue tracker](https://github.com/reduxjs/react-redux/issues) to find a list of open issues that need attention.

Fork, then clone the repo:

```
git clone https://github.com/your-username/react-redux.git
```

This repository uses Yarn v2 to manage packages. You'll need to have Yarn v1.22 installed globally on your system first, as Yarn v2 depends on that being available first. Install dependencies with:

```
yarn install
```

### Building

Running the `build` task will create both a CommonJS module-per-module build and a UMD build.

```
yarn build
```

To create just a CommonJS module-per-module build:

```
yarn build:lib
```

To create just a UMD build:

```
yarn build:umd
yarn build:umd:min
```

### Testing and Linting

To run the tests:

```
yarn test
```

To continuously watch and run tests, run the following:

```
yarn test --watch
```

To perform linting with `eslint`, run the following:

```
yarn lint
```

### New Features

Please open an issue with a proposal for a new feature or refactoring before starting on the work. We don't want you to waste your efforts on a pull request that we won't want to accept.

## Submitting Changes

- Open a new issue in the [Issue tracker](https://github.com/reduxjs/react-redux/issues).
- Fork the repo.
- Create a new feature branch based off the `master` branch.
- Make sure all tests pass and there are no linting errors.
- Submit a pull request, referencing any issues it addresses.

Please try to keep your pull request focused in scope and avoid including unrelated commits.

After you have submitted your pull request, we'll try to get back to you as soon as possible. We may suggest some changes or improvements.

Thank you for contributing!

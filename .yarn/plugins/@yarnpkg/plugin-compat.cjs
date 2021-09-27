module.exports = {
  name: `@yarnpkg/plugin-compat`,
  factory: (require) => {
    // we are not using PNP and want to use `typescript@next` in CI without hassle
    // dummy implementation to override the built-in version of this plugin
    // can be dropped once we switch to yarn 3
    return {}
  },
}

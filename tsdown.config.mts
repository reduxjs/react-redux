import * as path from 'node:path'
import type { InlineConfig, Rolldown, UserConfig } from 'tsdown'
import { defineConfig } from 'tsdown'
import packageJson from './package.json' with { type: 'json' }

/**
 * @internal
 */
const cwd = import.meta.dirname

/**
 * @internal
 */
const sourceRootDirectory = path.join(cwd, 'src')

/**
 * @internal
 */
const RE_DTS = /\.d\.([cm]?)ts$/

/**
 * Useful to flatten the type output to improve type hints shown in editors.
 * And also to transform an
 * {@linkcode https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#interfaces | interface}
 * into a
 * {@linkcode https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-aliases | type}
 * to aid with assignability.
 *
 * @example
 * <caption>Basic usage</caption>
 *
 * ```ts
 * import type { Simplify } from "./typeHelpers.js";
 *
 * interface SomeInterface {
 *   bar?: string;
 *   baz: number | undefined;
 *   foo: number;
 * }
 *
 * type SomeType = {
 *   bar?: string;
 *   baz: number | undefined;
 *   foo: number;
 * };
 *
 * const literal = {
 *   bar: "hello",
 *   baz: 456,
 *   foo: 123,
 * } as const satisfies SomeType satisfies SomeInterface;
 *
 * const someType: SomeType = literal;
 * const someInterface: SomeInterface = literal;
 *
 * function fn(object: Record<string, unknown>): void {
 *   console.log(object);
 * }
 *
 * fn(literal); // ✅ Good: literal object type is sealed
 * fn(someType); // ✅ Good: type is sealed
 * // @ts-expect-error
 * fn(someInterface); // ❌ Error: Index signature for type 'string' is missing in type 'SomeInterface'. Because `interface` can be re-opened
 * fn(someInterface as Simplify<SomeInterface>); // ✅ Good: transform an `interface` into a `type`
 * ```
 *
 * @template BaseType - The type to simplify.
 *
 * @see {@link https://github.com/sindresorhus/type-fest/blob/548e7dfdbc8a70767cd278c0ec8512aef6e16b56/source/simplify.d.ts | Source}
 * @see {@link https://github.com/microsoft/TypeScript/issues/15300 | TypeScript Issue}
 * @internal
 */
type Simplify<BaseType> = BaseType extends (...args: never[]) => unknown
  ? BaseType
  : NonNullable<unknown> & {
      [KeyType in keyof BaseType]: BaseType[KeyType]
    }

/**
 * A {@linkcode Rolldown.Plugin | Rolldown plugin} to emit a CommonJS entry
 * file that switches between development and production bundles based on
 * `NODE_ENV`. Automatically derives the folder and prefix from the output
 * chunk filenames. Only acts on production CJS builds (chunks ending in
 * `.production.min.cjs`).
 *
 * @param [pluginOptions={}] - Options forwarded to the plugin.
 * @returns A {@linkcode Rolldown.Plugin | Rolldown plugin} that emits the CJS entry file.
 * @internal
 */
const writeCommonJSEntryPlugin = (
  pluginOptions: GenerateBundleObjectHook = {},
): Rolldown.Plugin => {
  const { order = null } = pluginOptions

  return {
    name: `${packageJson.name}:write-commonjs-entry`,
    generateBundle: {
      order,
      handler(outputOptions, bundle, isWrite): void {
        if (outputOptions.format === 'cjs' && isWrite) {
          Object.values(bundle).forEach((chunk) => {
            if (
              chunk.type === 'chunk' &&
              chunk.isEntry &&
              chunk.fileName.endsWith('.production.min.cjs')
            ) {
              const chunkDirectory = path.dirname(chunk.fileName)

              const prefix = path.basename(
                chunk.fileName,
                '.production.min.cjs',
              )

              this.emitFile({
                code: `"use strict";
if (process.env.NODE_ENV === "production") {
  module.exports = require("./${prefix}.production.min.cjs");
} else {
  module.exports = require("./${prefix}.development.cjs");
}\n`,
                fileName: `${chunkDirectory}/index.js`,
                isEntry: true,
                sourcemapFileName: `${chunkDirectory}/index.js.map`,
                type: 'prebuilt-chunk',
              })
            }
          })
        }
      },
    },
  }
}

/**
 * @internal
 */
type GenerateBundleObjectHook = Simplify<
  Pick<
    Extract<
      NonNullable<Rolldown.Plugin['generateBundle']>,
      { handler: unknown }
    >,
    'order'
  >
>

/**
 * A {@linkcode Rolldown.Plugin | Rolldown plugin} to remove generated CommonJS
 * (`.cjs`) JavaScript outputs from DTS-only builds. When generating type
 * definition builds we may still emit stray `.cjs` files; this plugin deletes
 * those entries from the generated bundle to ensure only declaration artifacts
 * remain.
 *
 * @param [pluginOptions={}] - Options forwarded to the plugin.
 * @returns A {@linkcode Rolldown.Plugin | Rolldown plugin} that prunes `.cjs` files from the bundle.
 * @internal
 */
const removeCJSOutputsFromDTSBuilds = (
  pluginOptions: GenerateBundleObjectHook = {},
): Rolldown.Plugin => {
  const { order = null } = pluginOptions

  return {
    name: `${packageJson.name}:remove-cjs-outputs-from-dts-builds`,
    generateBundle: {
      order,
      handler(outputOptions, bundle, isWrite): void {
        if (outputOptions.format === 'cjs' && isWrite) {
          Object.values(bundle).forEach((outputChunk) => {
            if (
              outputChunk.type === 'chunk' &&
              outputChunk.isEntry &&
              !RE_DTS.test(outputChunk.fileName)
            ) {
              delete bundle[outputChunk.fileName]
              delete bundle[`${outputChunk.fileName}.map`]
            }
          })
        }
      },
    },
  }
}

/**
 * @internal
 */
const peerAndProductionDependencies = Object.keys({
  ...packageJson.dependencies,
  ...packageJson.peerDependencies,
} as const) satisfies Extract<Rolldown.ExternalOption, unknown[]>

export default defineConfig((cliOptions) => {
  const commonOptions = {
    checks: {
      // TODO: resolve circular dependencies and re-enable this check.
      circularDependency: false,
    },
    cjsDefault: false,
    clean: false,
    cwd,
    deps: {
      neverBundle: peerAndProductionDependencies,
      onlyBundle: [],
    },
    devtools: {
      clean: true,
      enabled: true,
    },
    dts: false,
    entry: {
      'react-redux': 'src/index.ts',
    },
    failOnWarn: true,
    fixedExtension: false,
    format: ['esm'],
    hash: false,
    inputOptions: (options) => {
      const plugins = options.plugins
        ? Array.isArray(options.plugins)
          ? options.plugins.flat()
          : [options.plugins]
        : []

      return {
        ...options,
        experimental: {
          ...options.experimental,
          lazyBarrel: true,
          nativeMagicString: true,
        },
        plugins: [...plugins],
        transform: {
          ...options.transform,
          inject: {
            ...options.transform?.inject,
            React: ['react', '*'],
          },
          typescript: {
            ...options.transform?.typescript,
            optimizeConstEnums: true,
            optimizeEnums: true,
          },
        },
      } as const satisfies Rolldown.InputOptions
    },
    minify: false,
    name: packageJson.name,
    nodeProtocol: true,
    outDir: 'dist',
    outExtensions: ({ format, options }) => ({
      dts: format === 'es' ? '.d.mts' : '.d.ts',
      js:
        format === 'es' && options.transform?.target != null
          ? (Array.isArray(options.transform?.target) &&
              options.transform?.target.includes('es2017')) ||
            options.transform?.target === 'es2017'
            ? '.legacy-esm.js'
            : `${options.platform === 'browser' ? '.browser' : ''}.mjs`
          : '.cjs',
    }),
    outputOptions: (options, format, context) => {
      const plugins = options.plugins
        ? Array.isArray(options.plugins)
          ? options.plugins.flat()
          : [options.plugins]
        : []

      return {
        ...options,
        codeSplitting: false,
        comments: {
          annotation: true,
          jsdoc: false,
          legal: true,
        },
        ...(format === 'cjs' && !context.cjsDts
          ? {
              externalLiveBindings: false,
              plugins: [
                ...plugins,
                ...(typeof options.entryFileNames === 'string' &&
                options.entryFileNames?.endsWith('.production.min.cjs')
                  ? [writeCommonJSEntryPlugin()]
                  : []),
              ],
            }
          : {}),
        strict: true,
      } as const satisfies Rolldown.OutputOptions
    },
    platform: 'node',
    root: sourceRootDirectory,
    shims: true,
    sourcemap: true,
    target: ['esnext'],
    treeshake: {
      moduleSideEffects: false,
    },
    tsconfig: path.join(cwd, 'tsconfig.build.json'),
    ...cliOptions,
  } as const satisfies InlineConfig

  return [
    // Standard ESM, embedded `process.env.NODE_ENV` checks
    {
      ...commonOptions,
      name: `${packageJson.name}-Modern-ESM`,
    },
    {
      ...commonOptions,
      entry: {
        rsc: 'src/index-rsc.ts',
      },
      name: `${packageJson.name}-ESM-for-RSC`,
    },

    // Support Webpack 4 by pointing `"module"` to a file with a `.js` extension
    // and optional chaining compiled away
    {
      ...commonOptions,
      name: `${packageJson.name}-Legacy-ESM`,
      target: ['es2017'],
    },

    // Browser-ready ESM, production + minified
    // Meant to be served up via CDNs like `unpkg`.
    {
      ...commonOptions,
      define: {
        process: 'undefined',
        window: JSON.stringify('window'),
      },
      env: {
        NODE_ENV: 'production',
      },
      minify: true,
      name: `${packageJson.name}-Browser-ESM`,
      platform: 'browser',
    },
    {
      ...commonOptions,
      define: {
        process: JSON.stringify('process'),
      },
      entry: {
        'cjs/react-redux': 'src/index.ts',
      },
      env: {
        NODE_ENV: 'development',
      },
      format: ['cjs'],
      name: `${packageJson.name}-CJS-Development`,
      outExtensions: () => ({ js: '.development.cjs' }),
    },
    {
      ...commonOptions,
      define: {
        process: JSON.stringify('process'),
      },
      entry: {
        'cjs/react-redux': 'src/index.ts',
      },
      env: {
        NODE_ENV: 'production',
      },
      format: ['cjs'],
      minify: true,
      name: `${packageJson.name}-CJS-Production`,
      outExtensions: () => ({ js: '.production.min.cjs' }),
    },
    {
      ...commonOptions,
      dts: {
        build: false,
        cjsDefault: false,
        cwd: commonOptions.cwd,
        dtsInput: false,
        eager: false,
        emitDtsOnly: true,
        emitJs: false,
        enabled: true,
        generator: 'tsc',
        incremental: false,
        logger: console,
        newContext: false,
        oxc: {},
        parallel: false,
        resolver: 'tsc',
        sideEffects: false,
        sourcemap: true,
        tsconfig: commonOptions.tsconfig,
        tsgo: {},
        vue: false,
      },
      format: ['cjs', 'esm'],
      name: `${packageJson.name}-Type-Definitions`,
      outputOptions: (options, format, context) => {
        const plugins = options.plugins
          ? Array.isArray(options.plugins)
            ? options.plugins.flat()
            : [options.plugins]
          : []

        return {
          ...options,
          codeSplitting: false,
          comments: {
            annotation: true,
            jsdoc: true,
            legal: true,
          },
          plugins: [
            ...plugins,
            ...(format === 'cjs' && !context.cjsDts
              ? [removeCJSOutputsFromDTSBuilds()]
              : []),
          ],
          strict: true,
        } as const satisfies Rolldown.OutputOptions
      },
    },
  ] as const satisfies UserConfig[]
})

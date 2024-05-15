import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Check, SizeLimitConfig } from 'size-limit'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const getAllPackageEntryPoints = async () => {
  const packageJson = await import('./package.json', { with: { type: 'json' } })

  const packageExports = Object.entries(packageJson.exports['.'])
    .filter(([condition]) => condition !== 'types')
    .map(([_condition, entryPoint]) =>
      path.isAbsolute(entryPoint) ? `./${entryPoint}` : entryPoint,
    )

  return [...new Set(packageExports)]
}

const getAllImports = async (
  entryPoint: string,
  index: number,
): Promise<SizeLimitConfig> => {
  const allNamedImports = await import(entryPoint)

  return Object.keys(allNamedImports)
    .map<Check>((namedImport) => ({
      path: entryPoint,
      name: `import { ${namedImport} } from "${entryPoint}"`,
      import: `{ ${namedImport} }`,
      modifyWebpackConfig: (config) => {
        config.optimization.nodeEnv = 'development'
        return config
      },
    }))
    .concat([
      {
        path: entryPoint,
        name: `import * from "${entryPoint}"`,
        import: '*',
      },
      {
        path: entryPoint,
        name: `import "${entryPoint}"`,
      },
    ])
}

const setNodeEnv = (
  nodeEnv: 'development' | 'production',
): Check['modifyWebpackConfig'] => {
  return (config) => {
    config.optimization.nodeEnv = nodeEnv
    return config
  }
}

const getAllImportsWithNodeEnv = async (
  nodeEnv: 'development' | 'production',
) => {
  const allPackageEntryPoints = await getAllPackageEntryPoints()

  const allImportsFromAllEntryPoints = (
    await Promise.all(allPackageEntryPoints.map(getAllImports))
  ).flat()

  const allImportsWithNodeEnv = allImportsFromAllEntryPoints.map(
    (importsFromEntryPoint) => ({
      ...importsFromEntryPoint,
      name: `${importsFromEntryPoint.name} ('${nodeEnv}' mode)`,
      modifyWebpackConfig: setNodeEnv(nodeEnv),
    }),
  )

  return allImportsWithNodeEnv
}

const allNodeEnvs = ['development', 'production'] as const

const sizeLimitConfig: Promise<SizeLimitConfig> = (async () =>
  (await Promise.all(allNodeEnvs.map(getAllImportsWithNodeEnv))).flat())()

export default sizeLimitConfig

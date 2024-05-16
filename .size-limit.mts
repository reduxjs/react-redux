import { fileURLToPath } from 'node:url'
import type { Check, SizeLimitConfig } from 'size-limit'
import type { Configuration } from 'webpack'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const packageJsonEntryPoints = new Set<string>()

const getPackageJsonExports = async (
  packageJsonExports:
    | string
    | Record<string, any>
    | null
    | typeof import('./package.json').exports,
) => {
  if (typeof packageJsonExports === 'string') {
    packageJsonEntryPoints.add(
      packageJsonExports.startsWith('./')
        ? packageJsonExports
        : `./${packageJsonExports}`,
    )

    return packageJsonEntryPoints
  }

  if (typeof packageJsonExports === 'object' && packageJsonExports !== null) {
    await Promise.all(
      Object.entries(packageJsonExports)
        .filter(
          ([condition]) =>
            condition !== './package.json' && condition !== 'types',
        )
        .map(([_condition, entryPoint]) => entryPoint)
        .map(getPackageJsonExports),
    )
  }

  return packageJsonEntryPoints
}

const getAllPackageEntryPoints = async () => {
  const packageJson = await import('./package.json', { with: { type: 'json' } })

  const packageExports = await getPackageJsonExports(packageJson.exports)

  return [...new Set(packageExports)]
}

const getAllImports = async (
  entryPoint: string,
  index: number,
): Promise<SizeLimitConfig> => {
  const allNamedImports: typeof import('./src/index') = await import(entryPoint)

  return Object.keys(allNamedImports)
    .map<Check>((namedImport) => ({
      path: entryPoint,
      name: `${index + 1}. import { ${namedImport} } from "${entryPoint}"`,
      import: `{ ${namedImport} }`,
    }))
    .concat([
      {
        path: entryPoint,
        name: `${index + 1}. import * from "${entryPoint}"`,
        import: '*',
      },
      {
        path: entryPoint,
        name: `${index + 1}. import "${entryPoint}"`,
      },
    ])
}

const allNodeEnvs = ['development', 'production'] as const

type NodeEnv = (typeof allNodeEnvs)[number]

const setNodeEnv = (nodeEnv: NodeEnv) => {
  const modifyWebpackConfig = ((config: Configuration) => {
    ;(config.optimization ??= {}).nodeEnv = nodeEnv
    return config
  }) satisfies Check['modifyWebpackConfig']

  return modifyWebpackConfig
}

const getAllImportsWithNodeEnv = async (nodeEnv: NodeEnv) => {
  const allPackageEntryPoints = await getAllPackageEntryPoints()

  const allImportsFromAllEntryPoints = (
    await Promise.all(allPackageEntryPoints.map(getAllImports))
  ).flat()

  const modifyWebpackConfig = setNodeEnv(nodeEnv)

  const allImportsWithNodeEnv = allImportsFromAllEntryPoints.map<Check>(
    (importsFromEntryPoint) => ({
      ...importsFromEntryPoint,
      name: `${importsFromEntryPoint.name} ('${nodeEnv}' mode)`,
      modifyWebpackConfig,
    }),
  )

  return allImportsWithNodeEnv
}

const getSizeLimitConfig = async (): Promise<SizeLimitConfig> => {
  const sizeLimitConfig = (
    await Promise.all(allNodeEnvs.map(getAllImportsWithNodeEnv))
  ).flat()

  return sizeLimitConfig
}

const sizeLimitConfig: Promise<SizeLimitConfig> = (async () =>
  await getSizeLimitConfig())()

export default sizeLimitConfig

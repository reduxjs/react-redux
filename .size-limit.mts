import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Check, SizeLimitConfig } from 'size-limit'

const __dirname = fileURLToPath(new URL('.', import.meta.url))

const getAllEntryPoints = async () => {
  const pkgJson = await import('./package.json', { with: { type: 'json' } })

  const entryPoints = Object.entries(pkgJson.exports['.'])
    .filter(([condition]) => condition !== 'types')
    .map(([, entryPoint]) =>
      path.isAbsolute(entryPoint) ? `./${entryPoint}` : entryPoint,
    )

  return entryPoints
}

const getAllImports = async (
  entryPoint: string,
  index: number,
): Promise<SizeLimitConfig> => {
  const allImports = await import(entryPoint)

  return Object.keys(allImports)
    .map<Check>((namedImport) => ({
      path: entryPoint,
      name: `${namedImport} (${entryPoint})`,
      import: `{ ${namedImport} }`,
    }))
    .concat({
      path: entryPoint,
      name: `${index + 1}. Entry point: ${entryPoint}`,
      import: '*',
    })
}

const config: Promise<SizeLimitConfig> = (async () =>
  (await Promise.all((await getAllEntryPoints()).map(getAllImports))).flat())()

export default config

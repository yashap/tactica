/* eslint-disable no-undef */
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname
const workspaceRoot = path.resolve(projectRoot, '../..')

const config = getDefaultConfig(projectRoot)

config.watchFolders = [workspaceRoot]
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
]
config.resolver.unstable_enablePackageExports = true
config.resolver.unstable_conditionNames = ['development', 'react-native', 'browser', 'require', 'import']

// Translate `.js` imports to `.ts`/`.tsx` for our workspace TS source files.
// In dev we resolve workspace packages to their `src/` (via the `development` export condition),
// but the source uses NodeNext-style `.js` extensions in relative imports (required for prod Node ESM).
// Metro doesn't natively do that rewriting, so we plug it into the resolver.
const originalResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isWorkspaceRelative = moduleName.startsWith('./') || moduleName.startsWith('../')
  if (isWorkspaceRelative && moduleName.endsWith('.js')) {
    // Only rewrite when the importer lives under the workspace's packages or backends source.
    // node_modules deps that use `.js` imports continue to resolve normally.
    const importer = context.originModulePath || ''
    if (importer.includes(`${path.sep}packages${path.sep}`) || importer.includes(`${path.sep}backends${path.sep}`)) {
      const candidates = [moduleName.replace(/\.js$/, '.ts'), moduleName.replace(/\.js$/, '.tsx')]
      for (const candidate of candidates) {
        try {
          return context.resolveRequest(context, candidate, platform)
        } catch {
          // try next candidate
        }
      }
    }
  }
  if (originalResolveRequest) {
    return originalResolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config

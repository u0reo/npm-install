// @ts-check
const core = require('@actions/core')
const exec = require('@actions/exec')
const io = require('@actions/io')
const hasha = require('hasha')
const cache = require('@actions/cache')
const fs = require('fs')
const os = require('os')
const path = require('path')
const quote = require('quote')

/**
 * Grabs a boolean GitHub Action parameter input and casts it.
 * @param {string} name - parameter name
 * @param {boolean} defaultValue - default value to use if the parameter was not specified
 * @returns {boolean} converted input argument or default value
 */
const getInputBool = (name, defaultValue = false) => {
  const param = core.getInput(name)
  if (param === 'true' || param === '1') {
    return true
  }
  if (param === 'false' || param === '0') {
    return false
  }

  return defaultValue
}

const restoreCachedNpm = (primaryKey, inputPath) => {
  console.log('trying to restore cached NPM modules')
  console.log(`key: ${primaryKey}`)
  console.log(`path: ${inputPath}`)

  return cache
    .restoreCache([inputPath], primaryKey)
    .then((cache) => {
      console.log(`npm cache hit: ${Boolean(cache)}`)
      return cache
    })
    .catch((e) => {
      console.warn(
        `caught error ${e} retrieving cache, installing from scratch`
      )
    })
}

const saveCachedNpm = (primaryKey, inputPath) => {
  console.log('\nsaving NPM modules')

  return cache.saveCache([inputPath], primaryKey).catch((err) => {
    // don't throw an error if cache already exists, which may happen due to
    // race conditions
    if (err instanceof cache.ReserveCacheError) {
      console.warn(err.message)
      return -1
    }

    // do not rethrow here or github actions will break (https://github.com/bahmutov/npm-install/issues/142)
    console.warn(`saving npm cache failed with ${err}, continuing...`)
  })
}

const hasOption = (name, o) => name in o

const install = (opts = {}) => {
  // Note: need to quote found tool to avoid Windows choking on
  // npm paths with spaces like "C:\Program Files\nodejs\npm.cmd ci"

  if (!hasOption('useYarn', opts)) {
    console.error('passed options %o', opts)
    throw new Error('Missing useYarn option')
  }
  if (!hasOption('usePackageLock', opts)) {
    console.error('passed options %o', opts)
    throw new Error('Missing usePackageLock option')
  }
  if (!hasOption('workingDirectory', opts)) {
    console.error('passed options %o', opts)
    throw new Error('Missing workingDirectory option')
  }

  const shouldUseYarn = opts.useYarn
  const shouldUsePackageLock = opts.usePackageLock

  const options = {
    cwd: path.resolve(opts.workingDirectory)
  }

  if (opts.installCommand) {
    core.debug(`installing using custom command "${opts.installCommand}"`)
    return exec.exec(opts.installCommand, [], options)
  }

  if (shouldUseYarn) {
    console.log('installing NPM dependencies using Yarn')
    return io.which('yarn', true).then((yarnPath) => {
      console.log('yarn at "%s"', yarnPath)

      const args = shouldUsePackageLock ? ['--frozen-lockfile'] : []
      core.debug(
        `yarn command: "${yarnPath}" ${args} ${JSON.stringify(options)}`
      )
      return exec.exec(quote(yarnPath), args, options)
    })
  } else {
    console.log('installing NPM dependencies')

    return io.which('npm', true).then((npmPath) => {
      console.log('npm at "%s"', npmPath)

      const args = shouldUsePackageLock ? ['ci'] : ['install']
      core.debug(`npm command: "${npmPath}" ${args} ${JSON.stringify(options)}`)
      return exec.exec(quote(npmPath), args, options)
    })
  }
}

const getPlatformAndArch = () => `${process.platform}-${process.arch}`
const getNow = () => new Date()

const getLockFilename = (usePackageLock) => (workingDirectory) => {
  const packageFilename = path.join(workingDirectory, 'package.json')
  const yarnFilename = path.join(workingDirectory, 'yarn.lock')
  const useYarn = fs.existsSync(yarnFilename)

  if (!usePackageLock) {
    return {
      useYarn,
      lockFilename: packageFilename
    }
  }

  core.debug(`yarn lock file "${yarnFilename}" exists? ${useYarn}`)

  const npmShrinkwrapFilename = path.join(
    workingDirectory,
    'npm-shrinkwrap.json'
  )
  const packageLockFilename = path.join(workingDirectory, 'package-lock.json')
  const npmFilename =
    !useYarn && fs.existsSync(npmShrinkwrapFilename)
      ? npmShrinkwrapFilename
      : packageLockFilename

  const result = {
    useYarn,
    lockFilename: useYarn ? yarnFilename : npmFilename
  }
  return result
}

const getCachePrimaryKey = ({ useYarn, useRollingCache, lockHash }) => {
  const platformAndArch = api.utils.getPlatformAndArch()
  core.debug(`platform and arch ${platformAndArch}`)
  const primaryKeySegments = [platformAndArch]

  primaryKeySegments.unshift(useYarn ? 'yarn' : 'npm')

  if (useRollingCache) {
    const now = api.utils.getNow()
    primaryKeySegments.push(
      String(now.getFullYear()),
      String(now.getMonth()),
      lockHash
    )
  } else {
    primaryKeySegments.push(lockHash)
  }

  return primaryKeySegments.join('-')
}

const installInOneFolder = ({
  usePackageLock,
  workingDirectory,
  useRollingCache,
  installCommand
}) => {
  core.debug(`usePackageLock? ${usePackageLock}`)
  core.debug(`working directory ${workingDirectory}`)

  const lockInfo = getLockFilename(usePackageLock)(workingDirectory)
  const lockHash = hasha.fromFileSync(lockInfo.lockFilename, {
    algorithm: 'md5'
  })
  if (!lockHash) {
    throw new Error(
      `could not compute hash from file "${lockInfo.lockFilename}"`
    )
  }
  core.debug(`lock filename ${lockInfo.lockFilename}`)
  core.debug(`file hash ${lockHash}`)

  const NPM_CACHE_FOLDER = path.join(workingDirectory, 'node_modules')

  const PRIMARY_KEY = getCachePrimaryKey({
    useYarn: lockInfo.useYarn,
    useRollingCache,
    lockHash
  })

  const opts = {
    useYarn: lockInfo.useYarn,
    usePackageLock,
    workingDirectory,
    npmCacheFolder: NPM_CACHE_FOLDER,
    installCommand
  }

  return api.utils
    .restoreCachedNpm(PRIMARY_KEY, NPM_CACHE_FOLDER)
    .then((npmCacheHit) => {
      if (npmCacheHit) {
        return
      }

      console.log('\n')
      return api.utils.install(opts).then(() => {
        return api.utils.saveCachedNpm(PRIMARY_KEY, NPM_CACHE_FOLDER)
      })
    })
}

const npmInstallAction = async () => {
  const usePackageLock = getInputBool('useLockFile', true)
  const useRollingCache = getInputBool('useRollingCache', false)
  core.debug(`usePackageLock? ${usePackageLock}`)
  core.debug(`useRollingCache? ${useRollingCache}`)

  // Note: working directory for "actions/exec" should be absolute

  const wds = core.getInput('working-directory') || process.cwd()

  const workingDirectories = wds
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

  core.debug(`iterating over working ${workingDirectories.length} folder(s)`)

  const installCommand = core.getInput('install-command')

  for (const workingDirectory of workingDirectories) {
    console.log(`--- ${workingDirectory} ---`)
    await api.utils.installInOneFolder({
      usePackageLock,
      useRollingCache,
      workingDirectory,
      installCommand
    })
    console.log('\n')
  }
}

/**
 * Object of exports, useful to easy testing when mocking individual methods
 */
const api = {
  npmInstallAction,
  // export functions mostly for testing
  utils: {
    restoreCachedNpm,
    install,
    saveCachedNpm,
    getPlatformAndArch,
    getNow,
    installInOneFolder
  }
}

module.exports = api

// @ts-ignore
if (!module.parent) {
  console.log('running npm-install GitHub Action')
  npmInstallAction()
    .then(() => {
      console.log('all done, exiting')
    })
    .catch((error) => {
      console.log(error)
      core.setFailed(error.message)
    })
}

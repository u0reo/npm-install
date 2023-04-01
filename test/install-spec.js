const exec = require('@actions/exec')
const core = require('@actions/core')
const io = require('@actions/io')
const quote = require('quote')
const path = require('path')

const action = require('../index')

describe('install command', () => {
  beforeEach(function () {
    this.exec = sandbox.stub(exec, 'exec').resolves()
  })

  // by resolving we normalize the folder on Linux and Windows CI
  const workingDirectory = path.resolve('/current/working/directory')
  const npmCacheFolder = path.join(workingDirectory, 'node_modules')

  context('using Yarn', () => {
    const pathToYarn = '/path/to/yarn'

    it('uses absolute working directory', async function () {
      const opts = {
        useYarn: true,
        usePackageLock: true,
        // only use relative path
        workingDirectory: 'directory',
        npmCacheFolder
      }
      sandbox.stub(io, 'which').withArgs('yarn').resolves(pathToYarn)
      sandbox
        .stub(path, 'resolve')
        .withArgs('directory')
        .returns(workingDirectory)

      await action.utils.install(opts)
      expect(
        this.exec,
        'to use absolute working directory'
      ).to.have.been.calledOnceWithExactly(
        quote(pathToYarn),
        ['--frozen-lockfile'],
        { cwd: workingDirectory }
      )
    })

    it('and lock file', async function () {
      const opts = {
        useYarn: true,
        usePackageLock: true,
        workingDirectory,
        npmCacheFolder
      }
      sandbox.stub(io, 'which').withArgs('yarn').resolves(pathToYarn)
      await action.utils.install(opts)
      expect(this.exec).to.have.been.calledOnceWithExactly(
        quote(pathToYarn),
        ['--frozen-lockfile'],
        { cwd: workingDirectory }
      )
    })

    it('without lock file', async function () {
      const opts = {
        useYarn: true,
        usePackageLock: false,
        workingDirectory,
        npmCacheFolder
      }
      sandbox.stub(io, 'which').withArgs('yarn').resolves(pathToYarn)
      await action.utils.install(opts)
      expect(this.exec).to.have.been.calledOnceWithExactly(
        quote(pathToYarn),
        [],
        { cwd: workingDirectory }
      )
    })
  })

  context('using NPM', () => {
    const pathToNpm = '/path/to/npm'

    it('uses absolute working directory', async function () {
      const opts = {
        useYarn: false,
        usePackageLock: true,
        // only use relative path
        workingDirectory: 'directory',
        npmCacheFolder
      }
      sandbox.stub(io, 'which').withArgs('npm').resolves(pathToNpm)
      sandbox
        .stub(path, 'resolve')
        .withArgs('directory')
        .returns(workingDirectory)

      await action.utils.install(opts)

      expect(
        this.exec,
        'to use absolute working directory'
      ).to.have.been.calledOnceWithExactly(quote(pathToNpm), ['ci'], {
        cwd: workingDirectory
      })
    })

    it('installs using lock file', async function () {
      const opts = {
        useYarn: false,
        usePackageLock: true,
        workingDirectory,
        npmCacheFolder
      }
      sandbox.stub(io, 'which').withArgs('npm').resolves(pathToNpm)
      await action.utils.install(opts)
      expect(this.exec).to.have.been.calledOnceWithExactly(
        quote(pathToNpm),
        ['ci'],
        { cwd: workingDirectory }
      )
    })

    it('installs without a lock file', async function () {
      const opts = {
        useYarn: false,
        usePackageLock: false,
        workingDirectory,
        npmCacheFolder
      }
      sandbox.stub(io, 'which').withArgs('npm').resolves(pathToNpm)
      await action.utils.install(opts)
      expect(this.exec).to.have.been.calledOnceWithExactly(
        quote(pathToNpm),
        ['install'],
        { cwd: workingDirectory }
      )
    })
  })

  context('using custom command', () => {
    it('calls exec directly', async function () {
      const opts = {
        useYarn: true,
        usePackageLock: true,
        // only use relative path
        workingDirectory: 'directory',
        npmCacheFolder,
        installCommand: 'my install command'
      }

      sandbox
        .stub(path, 'resolve')
        .withArgs('directory')
        .returns(workingDirectory)

      await action.utils.install(opts)
      expect(
        this.exec,
        'to use the install command'
      ).to.have.been.calledOnceWithExactly('my install command', [], {
        cwd: workingDirectory
      })
    })
  })
})

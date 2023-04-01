// following guide
// https://glebbahmutov.com/blog/mocha-and-sinon/
const chai = require('chai')
const sinonChai = require('sinon-chai')
const sinon = require('sinon')

chai.use(sinonChai)
global.expect = chai.expect

before(() => {
  global.sandbox = sinon.createSandbox()
})
beforeEach(() => {
  global.sandbox.restore()
})

// restore npm cache directory setting changed in tests
const core = require('@actions/core')
const { execSync } = require('child_process')

const cacheDir = execSync('npm config get cache')
  .toString()
  .split('\n')[0]

after(() => {
  core.exportVariable('npm_config_cache', cacheDir)
})

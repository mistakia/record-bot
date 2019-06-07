const RecordNode = require('record-node')
const path = require('path')
const os = require('os')
const Logger = require('logplease')
const debug = require('debug')
const fs = require('fs')

const Worker = require('./worker')

debug.enable('record:*,ipfs:*')
Logger.setLogLevel(Logger.LogLevels.DEBUG)

const logger = debug('record:bot')
logger.log = console.log.bind(console) // log to stdout instead of stderr
const error = debug('record:bot:err')

const dataDir = path.resolve(os.homedir(), './.record-bot')
if (!fs.existsSync(dataDir)) { fs.mkdirSync(dataDir) }
const dataFile = path.resolve(dataDir, './data.txt')

if (!fs.existsSync(dataFile)) {
  fs.closeSync(fs.openSync(dataFile, 'w'))
}

const opts = {
  orbitdb: {
    directory: path.resolve(dataDir, './orbitdb')
  },
  ipfs: {
    repo: path.resolve(dataDir, './ipfs')
  }
}
const record = new RecordNode(opts)

record.on('ready', async () => {
  try {
    const profileData = {
      name: 'Bot',
      bio: 'A feed of music from various websites',
      location: 'World Wide Web'
    }
    await record.profile.set(profileData)
    // ready
  } catch (e) {
    error(e)
    process.exit()
  }

  new Worker(dataFile, record)
})

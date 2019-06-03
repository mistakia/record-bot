const Record = require('record-node')
const path = require('path')
const os = require('os')
const Logger = require('logplease')
const debug = require('debug')
const fs = require('fs')
const IPFS = require('ipfs')

const Worker = require('./worker')

debug.enable('record:*,jsipfs')
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

const ipfsConfig = {
  repo: path.resolve(dataDir, './ipfs'),
  init: true,
  EXPERIMENTAL: {
    dht: false, // TODO: BRICKS COMPUTER
    pubsub: true
  },
  config: {
    Bootstrap: [],
    Addresses: {
      Swarm: [
        //'/ip4/0.0.0.0/tcp/4002',
        '/ip4/0.0.0.0/tcp/4003/ws/',
        '/ip4/206.189.77.125/tcp/9090/ws/p2p-websocket-star/'
      ]
    }
  },
  libp2p: {
    config: {
      relay: {
        enabled: true
      }
    }
  }
}

const ipfs = new IPFS(ipfsConfig)

ipfs.on('ready', async () => {
  const opts = {
    orbitdb: {
      directory: path.resolve(dataDir, './orbitdb')
    }
  }

  const record = new Record(ipfs, opts)

  try {
    await record.init()
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

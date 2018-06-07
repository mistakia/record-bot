const RecordNode = require('record-node')
const path = require('path')
const os = require('os')
const Logger = require('logplease')
const debug = require('debug')
const fs = require('fs')
const IPFS = require('ipfs')
const OrbitDB = require('orbit-db')

const Worker = require('./worker')

debug.enable('record:*,jsipfs')
Logger.setLogLevel(Logger.LogLevels.DEBUG)

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
    relay: {
      enabled: true,
      hop: {
        enabled: false, // TODO: CPU hungry on mobile
        active: false
      }
    },
    pubsub: true
  },
  config: {
    Bootstrap: [],
    Addresses: {
      Swarm: [
        // '/ip4/0.0.0.0/tcp/4002',
        // '/ip4/0.0.0.0/tcp/4003/ws',
        // '/dns4/star-signal.cloud.ipfs.team/wss/p2p-webrtc-star',
        '/ip4/159.203.117.254/tcp/9090/ws/p2p-websocket-star'
        // '/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star'
      ]
    }
  }
}

const ipfs = new IPFS(ipfsConfig)

ipfs.on('ready', async () => {
  const opts = {
    orbitPath: path.resolve(dataDir, './orbitdb')
  }

  const rn = new RecordNode(ipfs, OrbitDB, opts)

  await rn.load()
  // ready

  const worker = new Worker(dataFile, rn._log)
})

const RecordNode = require('record-node')
const path = require('path')
const os = require('os')
const Logger  = require('logplease')
const debug = require('debug')
const fs = require('fs')

const Worker = require('./worker')

debug.enable('record:*,jsipfs')

Logger.setLogLevel(Logger.LogLevels.DEBUG)

const dataDir = path.resolve(os.homedir(), './.record-bot')

if (!fs.existsSync(dataDir)){
  fs.mkdirSync(dataDir);
}

const dataFile = path.resolve(dataDir, './data.txt')

if (!fs.existsSync(dataFile)) {
  fs.closeSync(fs.openSync(dataFile, 'w'));
}

const node = new RecordNode({
  ipfsConfig: {
    repo: path.resolve(dataDir, './ipfs')
  },
  orbitPath: path.resolve(dataDir, './orbitdb')
})

node.on('ready', function() {
  const worker = new Worker(dataFile)
  //ready
})

const RecordNode = require('record-node')
const path = require('path')
const os = require('os')
const Logger = require('logplease')
const debug = require('debug')
const fs = require('fs')
const jsonfile = require('jsonfile')
const moment = require('moment')

const Scraper = require('./scraper')

debug.enable('record:*')
Logger.setLogLevel(Logger.LogLevels.INFO)
const logger = debug('record:bot')
logger.log = console.log.bind(console) // log to stdout instead of stderr
const error = debug('record:bot:err')

const dataDir = path.resolve(os.homedir(), './.record-bot')
if (!fs.existsSync(dataDir)) { fs.mkdirSync(dataDir) }
const configFile = path.resolve(dataDir, './config.json')

const saveConfig = () => jsonfile.writeFileSync(configFile, config, { spaces: 2 })
const defaultConfig = {
  about: {
    name: 'Bot',
    bio: 'A Record Bot',
    location: 'IPFS'
  },
  importPaths: [],
  scrapePaths: [],
  completedImports: [],
  logs: {},
  logLimit: 10,
  logExpirationLimit: 10 // days
}

if (!fs.existsSync(configFile)) {
  jsonfile.writeFileSync(configFile, defaultConfig, { spaces: 2 })
}

const config = jsonfile.readFileSync(configFile)

const defaultProperties = Object.keys(defaultConfig)
const configProps = Object.keys(config)
let configUpdated = false
defaultProperties.forEach((prop) => {
  if (configProps.indexOf(prop) === -1) {
    config[prop] = defaultConfig[prop]
    configUpdated = true
  }
})

if (configUpdated) {
  saveConfig()
}

const { address, id } = config
logger(`ID: ${id}`)
logger(`Default Orbit Address: ${address}`)

const opts = {
  address,
  id,
  directory: dataDir
}

const main = async () => {
  const record = new RecordNode(opts)

  const syncLog = async (logAddress) => {
    // ignore any of our own logs
    const canAppend = await record.log.canAppend(logAddress)
    if (canAppend) {
      return
    }

    logger.log(`Pinning log: ${logAddress}`)
    await record.logs.connect(logAddress)
    config.logs[logAddress] = new Date()
    saveConfig()
  }

  record.on('redux', async ({ type, payload }) => {
    switch (type) {
      case 'LOG_PEER_JOINED':
      case 'RECORD_PEER_LEFT':
        if (config.logs[payload.logAddress]) {
          config.logs[payload.logAddress] = new Date()
          saveConfig()
        }
        break

      case 'IMPORTER_PROCESSED_FILE': {
        const { completed, remaining, file } = payload
        return logger.log(`imported ${file} (${completed}/${remaining})`)
      }

      case 'IMPORTER_FINISHED': {
        config.completedImports.push(payload.filepath)
        return saveConfig()
      }

      case 'RECORD_PEER_JOINED': {
        if (config.logs[payload.logAddress]) {
          config.logs[payload.logAddress] = new Date()
          saveConfig()
          return
        }

        // if limit is zero, exit
        if (!config.logLimit) {
          return
        }

        // add if below limit or have stale logs
        const logAddresses = Object.keys(config.logs)
        if (logAddresses.length < config.logLimit) {
          await syncLog(payload.logAddress)
        } else {
          const now = moment()
          let logsRemoved = true
          const lastSeenCutOff = now.subtract(config.logExpirationLimit, 'days')
          for (const logAddress of logAddresses) {
            const lastSeen = moment(config.logs[logAddress])
            if (lastSeen.isBefore(lastSeenCutOff)) {
              logger.log(`Purging log: ${logAddress}`)
              await record.logs.disconnect(logAddress)
              delete config.logs[logAddress]
              logsRemoved = true
              await record.log.drop(logAddress)
              // TODO unpin exclusively associated ipfs hashes
            }
          }

          if (logsRemoved) {
            await syncLog(payload.logAddress)
          }
        }
        break
      }
    }
  })

  record.on('ready', async (data) => {
    config.id = data.id
    config.address = data.orbitdb.address
    saveConfig()

    try {
      await record.about.set(config.about)
    } catch (e) {
      error(e)
      process.exit()
    }

    try {
      setTimeout(async () => {
        const logAddresses = Object.keys(config.logs)
        for (const logAddress of logAddresses) {
          await record.logs.connect(logAddress)
        }
      }, 5000)
    } catch (e) {
      error(e)
      process.exit()
    }

    new Scraper(configFile, record)

    try {
      if (!config.importPaths.length) {
        return
      }

      for (let i = 0; i < config.importPaths.length; i++) {
        const { importPath, logAddress } = config.importPaths[i]
        if (config.completedImports.indexOf(importPath) > -1) {
          logger.log(`Already imported ${importPath}`)
          continue
        }

        logger.log(`Importing ${importPath}`)
        if (logAddress && !record.isMe(logAddress)) {
          await record.log.get(logAddress, { create: true })
        }
        record.importer.add(importPath, logAddress)
      }
    } catch (e) {
      error(e)
    }
  })

  await record.init()
}

try {
  main()
} catch (err) {
  console.log(err)
}

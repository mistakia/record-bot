const RecordNode = require('record-node')
const path = require('path')
const os = require('os')
const Logger = require('logplease')
const debug = require('debug')
const fs = require('fs')
const jsonfile = require('jsonfile')
const moment = require('moment')

const Scraper = require('./scraper')

debug.enable('record:*,ipfs:*')
Logger.setLogLevel(Logger.LogLevels.DEBUG)
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
  contacts: {},
  contactLimit: 0,
  contactExpirationLimit: 10 //days
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

if (configUpdated) saveConfig()

const { address, id } = config
logger(`ID: ${id}`)
logger(`Default Orbit Address: ${address}`)

const opts = {
  address,
  id,
  keystore: path.resolve(dataDir, './keystore'),
  cache: path.resolve(dataDir, './cache'),
  orbitdb: {
    directory: path.resolve(dataDir, './orbitdb')
  },
  ipfs: {
    repo: path.resolve(dataDir, './ipfs')
  }
}

const record = new RecordNode(opts)

const pinContact = async (logId) => {
  logger.log(`Pinning log: ${logId}`)
  await record.contacts.connect(logId)
  config.contacts[logId] = new Date()
  saveConfig()
}

record.on('redux', async ({ type, payload }) => {
  switch(type) {
    case 'CONTACT_PEER_JOINED':
      if (config.contacts[payload.logId]) {
        config.contacts[payload.logId] = new Date()
        saveConfig()
      }
      break

    case 'RECORD_PEER_LEFT':
      if (config.contacts[payload.logId]) {
        config.contacts[payload.logId] = new Date()
        saveConfig()
      }
      break

    case 'RECORD_PEER_JOINED':
      // If contact exists, update last seen
      if (config.contacts[payload.logId]) {
        config.contacts[payload.logId] = new Date()
        saveConfig()
        return
      }

      if (!config.contactLimit) {
        return
      }

      // add if below limit or have stale contacts
      const logIds = Object.keys(config.contacts)
      if (logIds.length < config.contactLimit) {
        await pinContact(payload.logId)
      } else {
        const now = moment()
        let contactsRemoved = true
        const lastSeenCutOff = now.subtract(config.contactExpirationLimit, 'days')
        for (let i=0; i < logIds.length; i++) {
          const logId = logIds[i]
          const lastSeen = config.contacts[logId]
          if (lastSeen.isBefore(lastSeenCutOff)) {
            logger.log(`Purging log: ${logId}`)
            await record.contacts.disconnect(logId)
            delete config.contacts[logId]
            contactsRemoved = true
            // TODO delete associated caches
            // TODO unpin exclusively associated ipfs hashes
          }
        }

        if (contactsRemoved) {
          await pinContact(payload.logId)
        }
      }
      break

    default:
      return
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

  new Scraper(configFile, record)

  try {
    if (!config.importPaths.length) {
      return
    }

    for (let i = 0; i < config.importPaths.length; i++) {
      const { importPath, logId } = config.importPaths[i]
      if (config.completedImports.indexOf(importPath) > -1) {
        logger.log(`Already imported ${importPath}`)
        continue
      }

      logger.log(`Importing ${importPath}`)
      if (logId && !record.isMe(logId)) {
        await record.log.get(logId, { create: true })
      }
      await record.tracks.addTracksFromFS(importPath, { logId })
      config.completedImports.push(importPath)
      saveConfig()
    }
  } catch (e) {
    error(e)
  }
})

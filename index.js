const RecordNode = require('record-node')
const path = require('path')
const os = require('os')
const Logger = require('logplease')
const debug = require('debug')
const fs = require('fs')
const jsonfile = require('jsonfile')

const Scraper = require('./scraper')

debug.enable('record:*,ipfs:*')
Logger.setLogLevel(Logger.LogLevels.DEBUG)

const logger = debug('record:bot')
logger.log = console.log.bind(console) // log to stdout instead of stderr
const error = debug('record:bot:err')

const dataDir = path.resolve(os.homedir(), './.record-bot')
if (!fs.existsSync(dataDir)) { fs.mkdirSync(dataDir) }

const configFile = path.resolve(dataDir, './config.json')
if (!fs.existsSync(configFile)) {
  const defaultConfig = {
    about: {
      name: 'Bot',
      bio: 'A feed of music from various websites',
      location: 'World Wide Web'
    },
    importPaths: [],
    scrapePaths: [],
    completedImports: []
  }
  jsonfile.writeFileSync(configFile, defaultConfig, { spaces: 2 })
}

const config = jsonfile.readFileSync(configFile)

if (typeof config.completedImports === 'undefined') {
  config.completedImports = []
  jsonfile.writeFileSync(configFile, config, { spaces: 2 })
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
      const importPath = config.importPaths[i]
      if (config.completedImports.indexOf(importPath) > -1) {
        logger.log(`Already imported ${importPath}`)
        continue
      }

      logger.log(`Importing ${importPath}`)
      await record.tracks.addTracksFromFS(importPath)
      config.completedImports.push(importPath)
      jsonfile.writeFileSync(configFile, config, { spaces: 2 })
    }
  } catch (e) {
    error(e)
  }
})

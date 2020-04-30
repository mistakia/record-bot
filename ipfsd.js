const Ctl = require('ipfsd-ctl')
const { execFileSync } = require('child_process')
const debug = require('debug')
const logger = debug('record:bot:ipfsd')
logger.log = console.log.bind(console) // log to stdout instead of stderr
const error = debug('record:bot:ipfsd:err')

function getIpfsBinPath () {
  return require('go-ipfs-dep').path()
}

async function cleanup (ipfsd) {
  /* if (!configExists(ipfsd)) {
   *   throw new Error('cannot connect to api')
   * }
   */
  logger('run: ipfs repo fsck')
  const exec = getIpfsBinPath()

  try {
    execFileSync(exec, ['repo', 'fsck'], {
      env: {
        ...process.env,
        IPFS_PATH: ipfsd.path
      }
    })
  } catch (err) {
    error(err)
  }
}

async function spawn (path) {
  const ipfsd = await Ctl.createController({
    ipfsHttpModule: require('ipfs-http-client'),
    ipfsBin: getIpfsBinPath(),
    ipfsOptions: {
      repo: path,
      config: {
        Pubsub: {
          Router: 'gossipsub'
        },
        Swarm: {
          ConnMgr: {
            HighWater: 100,
            LowWater: 20
          }
        }
      },
      preload: {
        enabled: false
      }
    },
    remote: false,
    disposable: false,
    test: false,
    args: [
      '--enable-pubsub-experiment'
    ]
  })

  /* if (configExists(ipfsd)) {
   *   checkCorsConfig(ipfsd)
   *   return { ipfsd, isRemote: false }
   * }

   * // If config does not exist, but $IPFS_PATH/api exists, then
   * // it is a remote repository.
   * if (apiFileExists(ipfsd)) {
   *   return { ipfsd, isRemote: true }
   * }
   */
  await ipfsd.init({
    bits: 2048,
    emptyRepo: true
  })

  // applyDefaults(ipfsd)
  return { ipfsd, isRemote: false }
}

module.exports = async function (opts) {
  const { ipfsd, isRemote } = await spawn(opts)

  try {
    await ipfsd.start()
    const { id, addresses } = await ipfsd.api.id()
    logger(`PeerID is ${id}`)
    addresses.forEach(address => logger(`Listening at ${address}`))
    logger(`Repo is at ${ipfsd.path}`)
  } catch (err) {
    if (!err.message.includes('ECONNREFUSED')) {
      throw err
    }

    await cleanup(ipfsd)
    await ipfsd.start()
  }

  return ipfsd
}

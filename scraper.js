const async = require('async')
const domain = require('domain')
const debug = require('debug')
const jsonfile = require('jsonfile')

const scrape = require('./scrape')

class Scraper {
  constructor (configPath, record) {
    this.configPath = configPath
    this._record = record

    this.logger = debug('record:bot:scraper')
    this.logger.log = console.log.bind(console) // log to stdout instead of stderr
    this.logger.err = debug('record:bot:scraper:err')
    this.queue = async.queue(this._run.bind(this), 1)
    this.queue.drain = this._check.bind(this)

    this._check()
  }

  _check () {
    this.logger('Checking for work')
    const self = this
    const checkLater = () => {
      setTimeout(() => {
        self._check()
      }, 60000)
    }

    const now = new Date()
    const hourAgo = new Date(now.setTime(now.getTime() - 3600000))

    if (this.lastCheck && this.lastCheck < hourAgo) {
      this.logger('Checked less than 10 mins ago, will check again in a minute')
      return checkLater()
    }

    this.lastCheck = now

    const config = jsonfile.readFileSync(this.configPath)
    this.scrapePaths = config.scrapePaths
    this.logger(`Found ${this.scrapePaths.length} jobs`)

    if (this.scrapePaths.length) { this.queue.push(this.scrapePaths) }
  }

  _run (url, done) {
    this.logger('Starting a job')

    const self = this
    const timeout = setTimeout(() => {
      done('page timeout', url)
    }, 180000)

    this._update(url, (err) => {
      clearTimeout(timeout)
      self._finish(err, url, done)
    })
  }

  _update (url, done) {
    this.logger(`Crawling ${url}`)

    const self = this
    const d = domain.create()
    d.on('error', (err) => {
      done(err)
    })

    d.run(() => {
      scrape(url, this._record.resolve, (err, items) => {
        if (err) { return done(err) }

        this.logger(`Found ${items.length} items`)

        async.eachSeries(items, async (item) => {
          await self._record.tracks.addTrackFromUrl(item)
        }, done)
      })
    })
  }

  _finish (err, url, done) {
    if (err) this.logger.err(err)
    this.logger(`Finishing ${url} job`)
    done(err)
  }
}

module.exports = Scraper

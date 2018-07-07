const fs = require('fs')
const async = require('async')
const domain = require('domain')
const debug = require('debug')

const scrape = require('./scrape')

class Worker {
  constructor (filePath, rn) {
    this.filePath = filePath
    this._log = rn._log
    this._resolve = rn.resolve

    this.logger = debug('record:bot:worker')
    this.logger.log = console.log.bind(console) // log to stdout instead of stderr
    this.logger.err = debug('record:bot:worker:err')
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

    const data = fs.readFileSync(this.filePath)
    const lines = []
    data.toString().split('\n').forEach((line, index, arr) => {
      if (line) {
        lines.push(line)
      }
    })

    this.lines = lines
    this.logger(`Found ${lines.length} jobs`)

    if (this.lines.length) { this.queue.push(this.lines) }
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
      scrape(url, this._resolve, (err, items) => {
        if (err) { return done(err) }

        this.logger(`Found ${items.length} items`)

        async.eachSeries(items, async (item) => {
          await self._log.tracks.findOrCreate(item)
        }, done)
      })
    })
  }

  _finish (err, url, done) {
    if (err) this.logger.err(err)
    this.logger(`Finishing ${url} job`)

    this.lines.push(this.lines.shift())

    const data = this.lines.join('\n')
    fs.writeFileSync(this.filePath, data)

    done(err)
  }
}

module.exports = Worker

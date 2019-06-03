const cheerio = require('cheerio')
const async = require('async')
const URI = require('urijs')
const debug = require('debug')

const utils = require('./utils')

const logger = debug('record:bot:scrape')
logger.log = console.log.bind(console) // log to stdout instead of stderr
const error = debug('record:bot:scrape:err')

module.exports = function (url, resolve, callback) {
  // TODO: work with either a url or html

  let title = null
  let tracks = []
  let links = []
  let paths = []
  let feeds = []

  async.waterfall([

    (next) => {
      utils.getHTML(url, (err, body) => {
        if (err) { return next(err) }

        const isXML = body.slice(1, 5) === '?xml'
        const $ = cheerio.load(body, {
          xmlMode: !!isXML
        })

        title = $('title').first().text()

        if (!isXML) {
          const extract = () => {
            const feed = $(this).attr('href')
            if (!feed) {
              return
            }

            try {
              const uri = URI(feed).absoluteTo(url).normalize()
              if (feeds.indexOf(uri.toString()) < 0) { feeds.push(uri.toString()) }
            } catch (e) {
              error(e)
            }
          }

          // Legit
          $('link[type*=rss]').each(extract)
          $('link[type*=atom]').each(extract)

          // Questionable
          $('a:contains(RSS)').each(extract)
          $('a[href*=feedburner]').each(extract)
        } else {
          // get entry/item links and add to path
          $('feed entry link').each(() => {
            const path = $(this).attr('href')
            // validate domain
            paths.push(URI(path).search('').fragment('').toString())
          })

          $('channel item link').each(() => {
            const path = $(this).text()
            // validate domain
            paths.push(URI(path).search('').fragment('').toString())
          })
        }

        links = links.concat(utils.dedup(utils.getResources(body, url)))
        next()
      })
    },

    (next) => {
      const resolvePaths = (path, done) => {
        resolve(path, (err, results) => {
          if (results.length) {
            tracks = tracks.concat(results)
            return done()
          }

          utils.getHTML(path, (err, body) => {
            if (err) {
              error(err)
              done()
              return
            }

            links = links.concat(utils.dedup(utils.getResources(body, path)))
            done()
          })
        })
      }

      paths = utils.dedup(paths)

      logger(`Found ${paths.length} paths`)

      async.each(paths, resolvePaths, next)
    },

    (next) => {
      if (tracks.length) { return next(null) }

      links = utils.dedup(links)

      logger(`Found ${links.length} links`)

      async.eachSeries(links, (link, done) => {
        logger(`Resolving ${link}`)
        resolve(link, (err, results) => {
          if (!err) tracks = tracks.concat(results)
          logger(`Finished ${link}`)
          done()
        })
      }, next)
    }

  ], (err) => {
    callback(err, tracks)
  })
}

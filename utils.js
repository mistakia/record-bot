const URI = require('urijs')
const request = require('request')
const domain = require('domain')

const cleanURL = (URL) => {
  return URL
    .replace(/^(\s?href|\s?src)=['"]?/i, '')
    .replace(/^\s*/, '')
    .replace(/^url\(['"]*/i, '')
    .replace(/^javascript:[a-z0-9]+\(['"]/i, '')
    .replace(/["')]$/i, '')
    .replace(/\\\/\\\//i, '//')
    .replace(/\\/gi, '')
    .split(/\s+/g)
    .shift()
    .replace('#038;', '&')
    .split('#')
    .shift()
}

const isURL = (text) => {
  const pattern = '^(https?:\\/\\/)?' + // protocol
          '((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|' + // domain name
          '((\\d{1,3}\\.){3}\\d{1,3}))' + // OR ip (v4) address
          '(?::\\d{2,5})?' + // port
          '(?:/[^\\s]*)?$' // path

  const re = new RegExp(pattern, 'i')
  return re.test(text)
}

const protocolSupported = (URL) => {
  let protocol
  const allowedProtocols = [
    /^http(s)?$/i // HTTP & HTTPS
  ]

  try {
    protocol = URI(URL).protocol()

    // Unspecified protocol. Assume http
    if (!protocol) { protocol = 'http' }
  } catch (e) {
    // If URIjs died, we definitely /do not/ support the protocol.
    return false
  }

  return allowedProtocols.reduce(function (prev, protocolCheck) {
    return prev || !!protocolCheck.exec(protocol)
  }, false)
}

const getResources = (data, url) => {
  let resources = []
  const resourceText = data.toString('utf8')

  // Regular expressions for finding URL items in HTML and text
  var discoverRegex = [
    /(\shref\s?=\s?|\ssrc\s?=\s?|url\()([^"'\s>)]+)/ig,
    /(\shref\s?=\s?|\ssrc\s?=\s?|url\()['"]([^"'<]+)/ig,
    /http(s)?:(\/\/)[^?\s><'"\\]+/ig,
    /http(s)?:(\\\/\\\/)[^?\s><'"]+/ig,
    /url\([^)]+/ig,

    /^javascript:[a-z0-9]+\(['"][^'"\s]+/ig
  ]

  // Clean links
  function cleanAndQueue (urlMatch) {
    if (!urlMatch) return []

    return urlMatch
      .map(cleanURL)
      .reduce(function (list, URL) {
        let uri
        let ext
        const allowedExts = [
          'mp3',
          'wav',
          'mp4',
          'm4a'
        ]

        // Ensure URL is whole and complete
        try {
          uri = URI(URL).absoluteTo(url).normalize()
          ext = uri.suffix()
          URL = uri.toString()
        } catch (e) {
          // But if URI.js couldn't parse it - nobody can!
          return list
        }

        // does it pass our regex url test?
        if (!isURL(URL)) return list

        // If we hit an empty item, don't add return it
        if (!URL.length) return list

        // If we don't support the protocol in question
        if (!protocolSupported(URL)) return list

        if (ext && allowedExts.indexOf(ext) === -1) return list

        // Does the item already exist in the list?
        if (resources.reduce(function (prev, current) {
          return prev || current === URL
        }, false)) { return list }

        return list.concat(URL)
      }, [])
  }

  // Rough scan for URLs
  return discoverRegex.reduce((list, regex) => {
    return list.concat(
      cleanAndQueue(
        resourceText.match(regex)))
  }, [])
}

const dedup = (arr) => {
  let i = 0
  const l = arr.length
  let out = []
  let obj = {}

  for (; i < l; i++) {
    obj[arr[i]] = 0
  }

  for (i in obj) {
    if (obj.hasOwnProperty(i)) out.push(i)
  }

  return out
}

const getHTML = (url, callback) => {
  var d = domain.create()
  var limit = 1000 * 1000 * 10
  var size = 0

  d.on('error', function (err) {
    callback(err)
  })

  d.run(function () {
    var r = request({
      method: 'GET',
      url: url,
      rejectUnauthorized: false,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/49.0.2623.110 Safari/537.36'
      }
    }, function () {
      // node request needs a callback to emit a 'complete' event with the body
    })

    r.on('data', function (chunk) {
      size += chunk.length
      if (size > limit) {
        r.abort()
        callback(new Error(`page: ${url} is too large, nice try brian`), null)
      }
    })

    r.on('error', function (err) {
      r.abort()
      callback(err, null)
    })

    r.on('complete', function (response, body) {
      callback(body ? null : 'page: ' + url + ' has no body', body)
    })
  })
}

module.exports = {
  cleanURL,
  isURL,
  protocolSupported,
  getResources,
  getHTML,
  dedup
}

const cheerio = require('cheerio')
const async = require('async')
const parse = require('parse')
const URI = require('urijs')

const utils = require('./utils')

module.exports = function(url, callback) {

  //TODO: work with either a url or html

  let title = null  
  let tracks = []
  let links = []
  let paths = []
  let feeds = []
  
  async.waterfall([

    function(next) {

      utils.getHTML(url, function(err, body) {

	if (err)
	  return next(err)

	var isXML = body.slice(1, 5) === '?xml';
	var $ = cheerio.load(body, {
	  xmlMode: isXML ? true : false
	});

	title = $('title').first().text();

	if (!isXML) {

	  var extract = function() {
	    var feed = $(this).attr('href');
	    try {
	      var uri = URI(feed).absoluteTo(url).normalize();
	      if (feeds.indexOf(uri.toString()) < 0)
		feeds.push(uri.toString());
	    } catch(e) {
	      console.log(e)
	    }
	  };

	  // Legit
	  $('link[type*=rss]').each(extract);
	  $('link[type*=atom]').each(extract);

	  // Questionable
	  $('a:contains(RSS)').each(extract);
	  $('a[href*=feedburner]').each(extract);

	} else {
	  // get entry/item links and add to path
	  $('feed entry link').each(function() {
	    var path = $(this).attr('href');
	    // validate domain
	    paths.push(URI(path).search('').fragment('').toString());
	  });

	  $('channel item link').each(function() {
	    var path = $(this).text();
	    // validate domain
	    paths.push(URI(path).search('').fragment('').toString());
	  });
	}

	links = links.concat(utils.dedup(utils.getResources(body, url)));
	next();
      });
    },

    function(next) {
      var parsePaths = function(path, done) {
	parse(path, function(err, results) {
	  if (err) console.log(err)

	  if (results.length) {
	    tracks = tracks.concat(results);
	  } else {
	    utils.getHTML(path, function(err, body) {
	      if (err) {
		console.log(err)
		done();
		return;
	      }

	      links = links.concat(utils.dedup(utils.getResources(body, path)));
	      done();
	    });
	  }
	});
      };

      paths = utils.dedup(paths).slice(0, 25);

      async.each(paths, parsePaths, next);

    },

    function(next) {

      if (tracks.length)
	return	next(null)

      links = utils.dedup(links);

      async.each(links, function(link, next) {
	parse(link, function(err, results) {
	  if (err) console.log(err)
	  else tracks = tracks.concat(results);
	  next();
	});
      }, next)
    }
    
  ], function(err) {

    callback(err, tracks)

  })
}

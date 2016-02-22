/*
 * HTTP and WebSocket Data Server
 */
var util = require('util');
var DataServer = require('./DataServer');
var http = require('http');
var url = require('url');
var send = require('send');
var serveIndex = require('serve-index');
var serveStatic = require('serve-static');
var finalhandler = require('finalhandler');
var gateway = require('gateway');
var wss = require('websocket').server;
var pako = require('pako');

function HTTPDataServer(manager, config) {
	HTTPDataServer.super_.call(this);
	config = this.setup(manager, config);
	if (config.port <= 0) {
		return false;
	}

	// Create Server
	var indexserv = serveIndex(config.root_dir, {'icons': true, 'view': 'details'});
	var staticserv = serveStatic(config.root_dir, {
		'index': ['index.html']
	});
	var phpserv = gateway(config.root_dir, {'.php': 'php-cgi'});
	this.nserv = http.createServer(function(req, res) {

		// Log Request
		req.socket.dserv.log('Client Request', req.socket.info,
			req.method, req.url);

		var rurl = url.parse(req.url, true);
		var refhost = "";
		if (req.headers.referer) {
			var refurl = url.parse(req.headers.referer);
			refhost = refurl.protocol + "//" + refurl.host;
		}

		var regex = rurl.pathname.match(/^\/data\/now.((json)|(dat))(.gz)?(\/[\w\W]*)?$/);
		//if (rurl.pathname.substr(0,6) == "/data/") {
		if (regex) {
			res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
			res.setHeader('Expires', '0');
			res.setHeader('Access-Control-Allow-Origin', refhost);
			res.setHeader('Content-Type', 'application/json');

			// Determine URI
			// TODO: Handle .xml extension?
			// TODO: Handle .gz and other compression extensions
			// TODO: Differentiate between leafs and nodes?
			uri = '';
			var gzip = false;
			if (regex[4]) {
				gzip = true;
			}
			if (regex[5]) {
				uri = regex[5].substr(1);
			}
			var txt_hack = (regex[1] == 'dat');
			if (txt_hack) {
				res.setHeader('Content-Type', 'text/plain');
				txt_hack = true;
			}

			// Get Data Node
			var data = this.dserv.manager.data_get(uri);

			// Handle a GET
			if (req.method == 'GET') {

				// Ensure node exists
				if (data.node === undefined) {
					res.statusCode = 404;
					res.end();
					return;
				}

				// Return node if that's what we want
				if (!data.prop || data.prop === '') {
					var json = JSON.stringify(data.node);
					var data = json;
					if (gzip) {
						data = pako.gzip(data, { to: 'string' });
					}
					res.write(data);
					res.end();
					return;
				}

				// Ensure leaf node exists
				if (data.node[data.prop] === undefined) {
					res.statusCode = 404;
					res.end();
					return;
				}

				/* Ensure leaf node is really a leaf node
				if (typeof data.node[data.prop] === 'object') {
					res.statusCode = 404;
					res.end();
					return;
				} */

				var json = JSON.stringify(data.node[data.prop]);
				var data = json;
				if (gzip) {
					data = pako.gzip(data, { to: 'string' });
				}
				res.write(data);
				res.end();
				return;
			}

			// Handle a POST
			if (req.method == 'POST') {
				var post_data = '';
				var persist = false;
				if (rurl.query.persist) {
					persist = true;
				}

				req.on('data', function(chunk) {
					post_data += chunk;
				});

				req.on('end', function() {
					var update;
					try {
						update = JSON.parse(post_data);
					} catch (e) {
						res.statusCode = 400;
						res.end();
						return;
					}
					this.socket.dserv.manager.data_update(uri, update, this.socket, persist);
					res.write(JSON.stringify(update));
					res.end();
				});

				return;
			}

			// We are trying to do something not supported
			res.statusCode = 405;
			res.end();
			return;
		}

		// Not trying to get data
		var done = finalhandler(req, res);
		phpserv(req, res, function (err) {
			if (err) {
				return done(err);
			}
			staticserv(req, res, function (err) {
				if (err) {
					return done(err);
				}

				// remap
				var pathname = decodeURI(rurl.pathname);
				if (pathname.match(/^\/[\w\s]+?$/)) {
					send(req, config.remap, { root: config.root_dir }).pipe(res);
					return;
				}

				indexserv(req, res, done);
			});
		});
	});

	this.server_hook();

	this.wserv = new WebSocketDataServer(manager, config.ws, this.nserv);

	this.nserv.listen(config.port);
	return this;
}
util.inherits(HTTPDataServer, DataServer);

HTTPDataServer.prototype.config_default = {}.merge(DataServer.config_default, {
	server_name:	'Server_HTTP',
	port:		8888,
	root_dir:	'www',
	remap:		'index.html'
});

function WebSocketDataServer(manager, config, http) {
	WebSocketDataServer.super_.call(this);
	config = this.setup(manager, config);
	this.nserv = new wss({
		httpServer: http,
		autoAcceptConnection: false
	});
	this.server_hook();

	this.nserv.on('request', function(req) {
		var regex = req.resource.match(/\/data\/now.((json)|(dat))(.gz)?$/);
		if (!regex) {
			req.reject();
			return;
		}
		var gzip = false;
		if (regex[4]) {
			gzip = true;
		}

		/*
		if (!originIsAllowed(req.origin)) {
			req.reject();
			return;
		}
		*/
		//req.requestedProtocols[0];
		var c = req.accept(null, req.origin);
		c.httpRequest = req.httpRequest;
		c.origin = req.origin;
		c.requestedExtensions = req.requestedExtensions;
		c.gzip = gzip;
		this.dserv.client_hook(c);
	});

	return this;
}
util.inherits(WebSocketDataServer, DataServer);

WebSocketDataServer.prototype.config_default = {}.merge(DataServer.config_default, {
	server_name:	"Server_WS",
	send:		true,
	recv:		false,
	once:		false
});

module.exports = HTTPDataServer;

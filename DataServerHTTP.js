/*
 * HTTP and WebSocket Data Server
 */
var util = require('util');
var DataServer = require('./DataServer');
var http = require('http');
var url = require('url');
var serveIndex = require('serve-index');
var serveStatic = require('serve-static');
var finalhandler = require('finalhandler');
var wss = require('websocket').server;

function HTTPDataServer(manager, config) {
	HTTPDataServer.super_.call(this);
	config = this.setup(manager, config);
	if (config.port <= 0) {
		return false;
	}

	// Create Server
	var indexserv = serveIndex(config.root_dir, {'icons': true});
	var staticserv = serveStatic(config.root_dir, {
		'index': ['index.html']
	});
	this.nserv = http.createServer(function(req, res) {

		// Log Request
		req.socket.dserv.log('Client Request', req.socket.info,
			req.method, req.url);

		var rurl = url.parse(req.url);
		var refhost = "";
		if (req.headers.referer) {
			var refurl = url.parse(req.headers.referer);
			refhose = refurl.protocol + "//" + refurl.host;
		}

		if (rurl.pathname.substr(0,7) == "/.data/") {
			res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
			res.setHeader('Expires', '0');
			res.setHeader('Access-Control-Allow-Origin', refhost);
			res.setHeader('Content-Type', 'application/json');

			// Determine URI
			// TODO: Handle .json and .xml extensions
			// TODO: Handle .gz and other compression extensions
			// TODO: Differentiate between leafs and nodes
			var uri = rurl.pathname.substr(6);
			var txt_hack = uri.search(/.txt$/);
			if (txt_hack < 0) {
				txt_hack = false;
			} else {
				uri = uri.substring(0, txt_hack);
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
					res.write(JSON.stringify(data.node));
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

				res.write(JSON.stringify(data.node[data.prop]));
				res.end();
				return;
			}

			// Handle a POST
			if (req.method == 'POST') {
				var data = '';

				req.on('data', function(chunk) {
					data += chunk;
				});

				req.on('end', function() {
					var update;
					try {
						update = JSON.parse(data);
					} catch (e) {
						res.statusCode = 400;
						res.end();
						return;
					}
					this.socket.dserv.manager.data_update(uri, update, this.dserv);	// XXX dserv is wrong?
					res.write(JSON.stringify(update));
					res.end();
				});

				return;
			}

			// We are trying to do something not supported
			res.statusCode = 400; // XXX
			res.end();
			return;
		}

		// Not trying to get data
		var done = finalhandler(req, res);
		staticserv(req, res, function onNext(err) {
			if (err) {
				return done(err);
			}
			indexserv(req, res, done);
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
	root_dir:	'www'
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
		if (req.resource != '/.data/') {
			req.reject();
			return;
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

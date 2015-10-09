/*
 * THAR BE DRAGONS
 */
var version = {
	commit: {
		sha1: '$Format:%H$',
		time: '$Format:%ci$',
		name: '$Format:%cN$',
		email: '$Format:%cE$',
		signature: {
			name: '$Format:%GS$',
			type: '$Format:%G?$',
			key: '$Format:%GK$'
		}
	},
	refs: '$Format:%d$'
};
var util = require('util');
var om = require('./jsUtils');

function decPad (num, size) {
	var ret = '';
	while (Math.pow(10, --size) > num) {
		ret = ret + '0';
	}
	ret = ret + num;
	return ret;
}



/*
 * Data Manager
 *
 * Update {
 *	*wsb_update:	[Version]		(protocol version)
 *	uri: 		"URI",["URI"...]	(Node Location)
 *	epoch_ms:	Natural			(Last Update Time)
 *	data: 		{...}			(Relative New/Updated Data)
 *	expiration:	Natural			(0 or Experiation in seconds)
 *	prune:		"URI",["URI"...]	(Relative Nodes to Prune)
 *	meta:		{...}			(Meta Data for Propogation)
 *	source:		...
 *	// Internal Fields
 *	ts:		Date("Generation Timestamp")
 *	expire_ts:	Date("Remove After Timestamp"),null
 * }
 */
var fs = require('fs');
function DataManager(config) {
	var ts = new Date();
	this.meta = {
		updated: {
			str: null,
			iso8601: null,
			epoch_ms: 0
		},
		start: {
			str: ts.toUTCString(),
			iso8601: ts.toISOString(),
			epoch_ms: ts.getTime()
		}
	};
	this.servers = [];
	this.servers_count = 0;
	this.updates = [];
	this.config = om.object_merge({}, this.config_default, config);
	this.data = {};
	this.data._bserver_ = this.meta;
	this.data_initial();
}

DataManager.prototype.config_default = {
	expire:		null,
	log:		null,
	persist:	'persist.json'
};

DataManager.prototype.data_get = function(uri) {
	var node = this.data;

	// Send it all!
	if (!uri) {
		return node;
	}

	// Parse URI
	var links = uri;
	if (!(links instanceof Array)) {
		links = links.split('/');
	}

	// Traverse to find node
	for (var i = 0; i < links.length; i++) {
		var link = links[i];
		node = node[link];

		// We are done, return the node
		if (i+1 == links.length) {
			// XXX: Ensure it's not an object?
			return node;
		}
		if (i+2 == links.length && links[i+1] === '') {
			// XXX: Ensure it's an object?
			return node;
		}

		// Can't traverse
		if (node === null || typeof node !== 'object') {
			return undefined;
		}
	}
};

// XXX:
DataManager.prototype.data_persist = function() {
	var data = {};
	for (var i = 0; i < this.updates.length; i++) {
		var update = this.updates[i];
		if (update.expire_ts) {
			continue;
		}
		om.object_merge(data, update.data);
	}
	data._bserver_ = this.data._bserver_;
	try {
		fs.writeFileSync(this.config.persist, JSON.stringify(data));
	} catch (e) {
		console.log("# Persist: Could not write initialization file!");
		return false;
	}
	return true;
};

DataManager.prototype.data_initial = function() {

	// Get data on file
	var fs_stat = null;
	try {
		fs_stat  = fs.statSync(this.config.persist);
	} catch (e) {
		console.log("# Initialize: Could not read initialization file!");
		return false;
	}
	if (!fs_stat.isFile()) {
		console.log("# Initialize: Could not read initialization file!");
		return false;
	}

	// Compose update
	var update = {
		initial:	true,
		epoch_ms:	fs_stat.mtime.getTime(),
		expire:		0
	};

	// Read file
	try {
		update.data = JSON.parse(fs.readFileSync(this.config.persist, 'utf8'));
	} catch (e) {
		console.log("# Initialize: Could not read initialization file!");
		return false;
	}

	this.update(update, null, { file: this.config.persist });
	return true;
};

DataManager.prototype.data_log = function(data, ts, dserv, source) {
	if (!this.config.log) {
		return false;
	}

	var log_ts = ts.toISOString();
	var log_date = ts.getUTCFullYear().toString() + decPad(ts.getUTCMonth(),2) + decPad(ts.getUTCDate(),2);

	// Open log file
	var log_fd = -1;
	try {
		log_fd = fs.openSync(this.config.log + '/' + log_date + '.json', 'a', 0644);
	} finally {
		if (log_fd < 0) {
			console.log('# DataLog: ERROR: Could not open log file - data not logged!');
			return false;	// XXX: Data updated, but not logged.
		}
	}

	// Write to log file
	var log_data = JSON.stringify([log_ts, source, data]) + '\n';
	var log_datasize = Buffer.byteLength(log_data, 'UTF-8');
	var log_written = fs.writeSync(log_fd, log_data, null, 'UTF-8');
	if (log_written <= 0) {
		console.log('# DataLog: ERROR: Could not write to log file - data not logged and possibly corrupted file!');
	} else if (log_written != log_data.length) {
		console.log('# DataLog: ERROR: Could not write to log file - data not logged and corrupted file!');
	}

	// Close log file
	fs.closeSync(log_fd);

	// All done
	return true;
};

// XXX BUG: DOES NOT PRUNE PRIMATIVES, ONLY OBJECTS
DataManager.prototype.prune = function(ts) {

	// Current time was not passed in
	if (ts === undefined) {
		ts = new Date();
	}

	var updates = this.updates;
	var i, j;
	var update;
	var prune = [];
	var links = [];

	// Find all data to be pruned
	var link;
	for (i = 0; i < updates.length; i++) {
		update = updates[i];

		// Don't prune if new enough
		if (!update.expire_ts || update.expire_ts > ts) {
			continue;
		}

		// Prune this update
		prune.push(update);

		// Collect data to be pruned
		for (j in update.links) {
			link = update.links[j];
			if (links.indexOf(link) >= 0) {
				continue;
			}
			links.push(link);
		}
	}

	// If nothing to prune, return immediately
	if (prune.length === 0) {
		return 0;
	}

	// Make sure we don't prune new data
	var index, p;
	for (i = 0; i < updates.length; i++) {
		update = updates[i];

		// This update is being pruned, skip
		if (prune.indexOf(update) >= 0) {
			continue;
		}

		// Check all new data
		for (j in update.links) {
			link = update.links[j];
			index = links.indexOf(link);

			// We don't want to prune this data
			if (index >= 0) {
				delete links[index];
			}
		}
	}

	// Nuke the actual data to be pruned
	var remove_node = function(obj) {
		if (!obj || typeof obj !== 'object') {
			return;
		}

		for (p in obj) {
			if (obj[p] === link) {
				delete obj[p];
			}
		}
		return;
	};
	for (i in links) {
		link = links[i];
		om.object_traverse(this.data, remove_node);
	}

	// Nuke the update references
	this.updates = updates.filter(function filter(update, index, prune) {
		// This update was pruned, remove it
		if (prune.indexOf(update) >= 0) {
			return false;
		}
		// Not pruned, keep it
		return true;
	});

	// Return the number of updates pruned
	return prune.length;
};

// XXX: TODO: BOBDOLE
// Does not prune obsolete updates
DataManager.prototype.remove = function(links) {
	var i, p;
	var remove = function(obj) {
		if (!obj || typeof obj !== 'object') {
			return;
		}

		for (p in obj) {
			if (obj[p] === link[j]) {
				if (j == link.length) {
					delete obj[p];
					return false;
				}
			}
		}

		return;
	};

	var errors = 0;
	for (i = 0; i < links.length; i++) {
		var link = links[i];
		var j = 0;
		if (!om.object_traverse(this.data, remove)) {
			errors++;
		}
	}
	return links.length - errors;
};

// XXX: update not validated!!!
DataManager.prototype.update = function(update, dserv, source) {

	var ts = new Date();

	if (!update.wsb_update) {
		update = { wsb_update: 0, data: update };
	}

	// prune old data
	this.prune(ts);

	// compose update
	if (update.expire === false || update.expire === 0) {
		// Never expire
	} else if (update.expire > 0) {
		update.expire_ts = new Date(ts.getTime() + update.expire * 1000);
	} else {
		update.expire_ts = new Date(ts.getTime() + this.config.expire * 1000);
	}
	update.ts = new Date(update.epoch_ms);
	// XXX:
	var usource = {
		serv: dserv ? dserv.info : null,
		client: source
	};
	if (update.source) {
		update.source.unshift(usource);
	} else {
		update.source = [ usource ];
	}
	update.links = [];
	this.updates.push(update);

	// Remove data specified in update
	// XXX: array
	if (update.prune && typeof update.prune === 'object') {
		this.remove(update.prune);
	}

	// merge update hook... XXX
	om.object_merge_hooks.before = function(prop, dst, src) {
		if (!dst || typeof dst !== 'object') {
			if (src && typeof src === 'object') {
				// XXX:
				update.links.push(src);
				// Update all sub-objects for pruning
				om.object_traverse(src, function(obj) {
					if (obj && typeof obj === 'object') {
						// XXX: Keep track of updates
						//Object.defineProperty(obj, '_bserver_', { value: [update], enumerable: false, configurable: true });
						update.links.push(obj);
					}
				});
			}
		} else {
			// XXX: Keep track of updates
			//Object.defineProperty(dst, '_bserver_', { value: dst._bserver_.unshift(update), enumerable: false, configurable: true });
			update.links.push(dst);
		}
		return src;
	};

	// merge data
	if (update.uri) {
		var node = this.data;
		var prop = null;
		var links = update.uri.split('/');
		for (var i = 0; i < links.length - 1; i++) {
			var prop = links[i];
			if (prop == '') {
				continue;
			}
			if (node[prop] && typeof node[prop] === 'object') {
				node = node[prop];
			} else {
				node = node[prop] = {};
			}
		}
		prop = links[i];
		if (prop == '') {
			om.object_merge(node, update.data);
		} else {
			var temp = {};
			temp[prop] = update.data;
			om.object_merge(node, temp);
		}
	} else {
		om.object_merge(this.data, update.data);
	}

	// Reset hook... XXX
	om.object_merge_hooks.before = function(prop, dst, src) {
		return src;
	};

	// Replace meta data
	om.object_merge(this.data, { _bserver_: this.meta });

	// Handle meta data
	this.meta.updated = {
		epoch_ms:	ts.getTime(),
		iso8601:	ts.toISOString(),
		str:		ts.toUTCString(),
		update:		{
					epoch_ms:	update.epoch_ms,
					expire:		update.expire,
					source:		update.source,
					meta:		update.meta
				}
	};

	// log the data
	this.data_log(update.data, ts, dserv ? dserv.info : null, source);

	// broadcast updated data
	var mdata = this.data;
	this.servers.forEach(function(serv) {
		serv.broadcast(mdata);
	});

	// Persist Data
	if (!update.expire_ts && !update.initial) {
		this.data_persist();
	}

	// All done
	return true;
};

DataManager.prototype.server_attach = function(serv) {
	if (this.servers.indexOf(serv) >= 0) {
		console.log('# ERROR: Attaching already attached server - ' + JSON.stringify(serv.info));
		return false;
	}
	this.servers.push(serv);
	serv.info.server = ++this.servers_count;
	return true;
};

DataManager.prototype.server_detach = function(serv) {
	this.servers = this.servers.filter(function(serv_cur, serv_index, servers) {
		if (serv_cur === serv) {
			return false;
		}
		return true;
	});
	return true;
};


/*
 * Data Server Base
 */
function DataServer() {
	this.manager = null;
	this.dserv = null;
	this.serv = null;
	this.info = { name: '0xDEADBABE', server: 0 };
	this.clients = [];
	this.client_count = 0;
	this.config = null;
}

DataServer.prototype.setup = function(manager, config) {
	this.manager = manager;
	this.dserv = this;
	this.config = om.object_merge({}, this.config_default, config);
	this.info = {};
	this.info.name = this.config.server_name;
	this.info.config = this.config;
	this.manager.server_attach(this);
	return this.config;
};

DataServer.prototype.log = function () {
	var args = arguments || {};
	var message = '';
	for (var i = 1; i < args.length; i++) {
		message += ' - ' + JSON.stringify(args[i]);
	}
	console.log('# DS(' + this.info.server + ') "' +
		this.info.name + '": ' + args[0] + message);
};

DataServer.prototype.client_hook = function(c) {
	c.dserv = this;
	c.info = { client: ++this.dserv.client_count, net: {} };
	c.client_string = 'Client(' + c.info.client + ')';
	if (c.remoteAddress) {	// XXX: Better test
		c.info.net.address = c.remoteAddress;
		c.info.net.port = c.remotePort;
		c.info.net.family = c.remoteFamily;
	}
	this.log(c.client_string + ' Open', c.info);
	this.clients.push(c);

	// XXX: arguments (WebSockets)
	c.on('close', function(reason, description) {
		// unlink client from server
		var index = this.dserv.clients.indexOf(this);
		if (index >= 0) {
			this.dserv.clients.splice(index, 1);
		}

		// log
		if (reason) {
			this.dserv.log(c.client_string +
				' Close', '[Unclean!]');
		} else {
			this.dserv.log(c.client_string + ' Close');
		}
	});

	c.on('error', function(e) {
		// XXX: BUG: Unclear if safe to JSON e
		this.dserv.log(c.client_string + ' Error',
			this.info, e);
	});

	// XXX: Different formats (XML, bXML)
	c.on('message', function(message) {
		var config = this.dserv.config;

		// Ignore?
		if (!config.recv) {
			this.dserv.log(this.client_string + ' IGNORED Message', message);
			return;
		}

		// Sanity
		if (message.type != 'utf8') {
			this.dserv.log(this.client_string + ' INVALID Message', message);
			return;
		}

		// Parse
		var update = null;
		try {
			update = JSON.parse(message.utf8Data);
		} catch (e) {
			var error = '[JSON Parse Error!]'; // XXX: e
			this.dserv.log(this.client_string + ' INVALID Message',
				message, error);
			return;
		}

		// Log
		this.dserv.log(this.client_string + ' Message');

		// Update
		this.dserv.manager.update(update, this.dserv, this.info);
	});

	c.on('timeout', function() {
		// XXX:
		//this.close();
	});

	// XXX: Different formats (XML, bXML)
	c.message_send = function (data) {
		this.send(JSON.stringify(data));
	};

	if (c.dserv.config.send) {
		var data = this.manager.data_get(c.subscription);
		if (data !== undefined) {
			c.message_send(data);
		}
		if (c.dserv.config.once) {
			c.close();
		}
	}
};

DataServer.prototype.server_hook = function() {
	this.serv.dserv = this;

	this.serv.on('lookup', function(err, address, family) {
		this.info.net.address = address;
		this.info.net.family = family;
	});

	this.serv.on('listening', function() {
		if (typeof this.address === 'function') {
			this.dserv.info.net = this.address();
		}
		this.dserv.log('Started', this.dserv.info);
	});

	this.serv.on('close', function() {
		// XXX: WS
		this.dserv.log('Stopped');
	});

	// XXX: this.serv..on('error',

	this.serv.on('connection', function (c) {
		var config = this.dserv.config;

		// Hook
		this.dserv.client_hook(c);

		// Send Updates?
		if (config.send) {
			c.message_send(this.dserv.manager.data);

			if (config.once) {
				// XXX: BUG?
				c.close();
			}
		}
	});
};

DataServer.prototype.broadcast = function(data) {
	var config = this.config;
	if (config.send) {
		this.clients.forEach(function each(client) {
			try {
				client.message_send(client.subscription ? client.dserv.manager.data_get(client.subscription) : client.dserv.manager.data);
			} catch (e) {
				this.log(client.name + ' Error Sending Message');
				client.close(); // XXX: Needed?
			}
		});
	}
};


/*
 * HTTP Server
 */
var http = require('http');
var url = require('url');
var serveIndex = require('serve-index');
var serveStatic = require('serve-static');
var finalhandler = require('finalhandler');
function HTTPDataServer(manager, config) {
	HTTPDataServer.super_.call(this);
	config = this.setup(manager, config);
	if (config.port <= 0) {
		return false; // BUG: ?
	}

	var indexserv = serveIndex(config.root_dir, {'icons': true});
	var staticserv = serveStatic(config.root_dir, {
		'index': ['index.html']
	});
	this.serv = http.createServer(function(req, res) {
		req.socket.dserv.log(req.socket.client_string + ' Request',
			req.method, req.url);

		// Request for data
		var rurl = url.parse(req.url);
		var refhost = "";
		if (req.headers.referer) {
			var refurl = url.parse(req.headers.referer);
			refhost = refurl.protocol + "//" + refurl.host;
		}

		if (rurl.pathname.substr(0, 6) == '/.data') {
			res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
			res.setHeader('Expires', '0');
			res.setHeader('Access-Control-Allow-Origin', refhost);
			res.setHeader('Content-Type', 'application/json');

			// Hack for IE
			var agent = req.headers['user-agent'];
			if (agent.search('MSIE') > 0 || agent.search('Trident') > 0) {
				res.setHeader('Content-Type', 'text/plain');
			}

			// Determine URI
			// XXX: Handle .json, .xml, .dat, extensions?
			// XXX: Differentiate between leafs and nodes based on trailing /
			var key = rurl.pathname.substr(6);
			if (key.length > 0 && key.charAt(0) != '/') {
				res.statusCode = 404;	// Not Found
				res.end();
				return;
			} else if (key.length > 0) {
				key = key.substr(1);
			}

			var node;
			if (key.length === 0) {
				node = this.dserv.manager.data;
			} else {
				key = decodeURIComponent(key);
				node = this.dserv.manager.data_get(key);
			}
			if (req.method == 'POST') {
				var data = '';
				req.on('data', function(chunk) {
					data += chunk;
				});
				req.on('end', function() {
					// XXX: Proper mimetype handling
					// XXX: Error handling
					var update = JSON.parse(data);
					if (!update.uri) {
						update.uri = key;
					}
					this.socket.dserv.manager.update(update, this.dserv);
					res.write(JSON.stringify(update));
					res.end();
				});
				return;
			} else if (req.method == 'GET') {
				if (node === undefined) {
					res.statusCode = 404;
					res.end();
					return;
				}
				// XXX: Proper mimetype handling
				res.write(JSON.stringify(node));
				res.end();
				return;
			}
			res.statusCode = 404;
			res.end();
			return;
		}

		// Static web request
		var done = finalhandler(req, res);
		staticserv(req, res, function onNext(err) {
			if (err) {
				return done(err);
			}
			indexserv(req, res, done);
		});
	});

	// start the server
	this.server_hook();
	this.serv.listen(config.port);
}
util.inherits(HTTPDataServer, DataServer);

HTTPDataServer.prototype.config_default = om.object_merge({}, DataServer.config_default, {
	server_name:	'Server_HTTP',
	port:		8888,
	root_dir:	'WebClient'
});


/*
 * WebSockets Server
 */
var WebSocketServer = require('websocket').server;
function WebSocketDataServer(manager, config) {
	WebSocketDataServer.super_.call(this);
	config = this.setup(manager, config);

	this.serv = new WebSocketServer({
		httpServer: serv_http.serv, // XXX
		autoAcceptConnection: false
	});
	this.server_hook();
	this.serv.on('request', function(req) {
		if (req.resource.substr(0, 6) != '/.data') {
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
		c.subscription = req.resource.substr(7);
		c.httpRequest = req.httpRequest;
		c.origin = req.origin;
		c.requestedExtensions = req.requestedExtensions;
		this.dserv.client_hook(c);
	});

	return this;
}
util.inherits(WebSocketDataServer, DataServer);

WebSocketDataServer.prototype.config_default = om.object_merge({}, DataServer.config_default, {
	server_name:	'Server_WS',
	send: 		true,
	recv: 		false,
	once: 		false
});


/*
 * TCP Server
 */
var net = require('net');
function TCPDataServer(manager, config) {
	TCPDataServer.super_.call(this);
	config = this.setup(manager, config);
	if (config.port <= 0) {
		return false; // BUG: ?
	}

	var self = this;
	this.connection_handler = function(oc) {
		var c = oc;
		if (!c) {
			c = self.serv;
		}
		c.message_buffer = new Buffer(0);
		c.process_buffer = function() {
			var start = 0;
			var mb = this.message_buffer;
			for (var i = 0; i < mb.length; i++) {
				if (mb[i] === config.term) {
					var message = {
						type: 'utf8',
						utf8Data: mb.toString('utf8',
							start, i)
					};
					start = i + 1;
					this.emit('message', message);
				}
			}
			if (start !== 0) {
				if (start >= mb.length) {
					this.message_buffer = new Buffer(0);
				} else {
					var buffer_new = new Buffer(mb.length - start);
					mb.copy(buffer_new, 0, start);
					this.message_buffer = buffer_new;
				}
			}
		};

		// Allow updates on this port
		c.on('data', function (data) {
			this.message_buffer = Buffer.concat(
				[this.message_buffer, data],
				this.message_buffer.length + data.length);
			this.process_buffer();
		});

		c.send = function(data) {
			this.write(data + String.fromCharCode(config.term));
		};

		c.close = function() {
			this.end();
		};
	};

	if (config.type == 'client') {
		this.serv = net.createConnection(config.port, config.host,
			this.connection_handler);
		this.serv.info = { net: { host: config.host, port: config.port }};
		this.serv.client_string = config.host;
		this.server_hook();
		this.client_hook(this.serv);
	} else if (config.type == 'server') {
		this.serv = net.createServer(this.connection_handler);
		this.server_hook();
		this.serv.listen(config.port);
	} else {
		// BUG: XXX:
	}

	return this;
}
util.inherits(TCPDataServer, DataServer);

TCPDataServer.prototype.config_default = om.object_merge({}, DataServer.config_default, {
	server_name:	'Server_TCP',
	type:		'server',
	term:		0x0a,	// 0x0A for newline testing w/ telnet
				// 0x00 for real release
	once:		true,	// Disconnect after one update?
	send:		true,
	recv:		false
});


/*
 * Process Command Line Options
 */
var config = {	server_http: {
			port: 8888,
			memcache: {
				port: 11211,
				host: 'localhost'
			}
		},
		server_ws: {
			port: 8889
		},
		recv_tcp: {
			port: 1230,
			send: false,
			recv: true,
			once: true
		},
		send_tcp: {
			port: 1231,
			send: true,
			recv: false,
			once: true
		},
		server_tcp: {
			port: 1337,
			send: true,
			recv: false,
			once: false
		}
};
var getopt = require('node-getopt').create([
	['x',	'expire=SECS',	'Number of seconds to expire old data. [REQUIRED]'],
	['p',	'http-server=PORT', 'Port to run HTTP server on. [DEFAULT: 8888]'],
	['t',	'tcp-server=PORT', 'Port for TCP Broadcast Server. [DEFAULT: 1337]'],
	['r',	'tcp-recv=PORT', 'Port to run simple TCP Server on to update data on. [DEFAULT: 1230]'],
	['s',	'tcp-send=PORT', 'Port to run simple TCP Server on to retrive data on. [DEFAULT: 1231]'],
	['w',	'ws-server=PORT', 'Port to run WebSockets HTTP server on. [DEPRECIATED][DEFAULT: 8889]'],
	['',	'tcp-client=HOST[:PORT]', 'Mirror data from a remote TCP Broadcast Server.'],
	['',	'memcache=HOST[:PORT]', 'Use HOST and PORT for memcache Connections. [DEFAULT: localhost:11211]'],
	['',	'webdir=DIR', 'Root directory of the HTTP Server'],
	['l',	'log=DIR',	'Directory to log data into.'],
	['h',	'help',		'Display this help.'],
	['v',	'version',	'Display the version number.']
])
.on('version', function(argv, opt) {
	console.log('v0.0.1');	// XXX
	process.exit(false);
})
.on('log', function (argv, opt) {
	// XXX: console.log(util.inspect(fs.readdirSync(opt.log)));
	config.log = opt.log;
})
.on('expire', function (argv, opt) {
	var expire = parseInt(opt.expire, 10);
	if (Number.isNaN(expire) || expire <= 0) {
		console.log('ERROR: Invalid data expiration specified!');
		getopt.showHelp();
		process.exit(false);
	}
	config.expire = expire;
})
.on('http-server', function(argv, opt) {
	var port = opt['http-server'];
	port = Number.parseInt(port, 10);
	if (Number.isNaN(port) || port <= 0) {
		console.log('ERROR: Invalid http-server port specified!');
		getopt.showHelp();
		process.exit(false);
	}
	config.server_http.port = port;
})
.on('webdir', function(argv, opt) {
	config.server_http.root_dir = opt.webdir;
})
.on('tcp-server', function(argv, opt) {
	var port = opt['tcp-server'];
	port = Number.parseInt(port, 10);
	if (Number.isNaN(port) || port <= 0) {
		console.log('ERROR: Invalid tcp-server port specified!');
		getopt.showHelp();
		process.exit(false);
	}
	config.server_tcp.port = port;
})
.on('ws-server', function(argv, opt) {
	var port = opt['ws-server'];
	port = Number.parseInt(port, 10);
	if (Number.isNaN(port) || port <= 0) {
		console.log('ERROR: Invalid ws-server port specified!');
		getopt.showHelp();
		process.exit(false);
	}
	config.server_ws.port = port;
})
.on('memcache', function(argv, opt) {
	var str = opt.memcache;
	var index = str.indexOf(':');
	var port = 11211;
	var host = str;
	if (index >= 0) {
		host = str.substr(0, index);
		port = str.substr(index+1);
		port = Number.parseInt(port, 10);
		if (Number.isNaN(port) || port <= 0) {
			console.log('ERROR: Invalid memcache port specified!');
			getopt.showHelp();
			process.exit(false);
		}
	}
	config.server_http.memcache.host = host;
	config.server_http.memcache.port = port;
})
.on('tcp-recv', function(argv, opt) {
	var port = opt['tcp-recv'];
	port = Number.parseInt(port, 10);
	if (Number.isNaN(port) || port <= 0) {
		console.log('ERROR: Invalid tcp-recv port specified!');
		getopt.showHelp();
		process.exit(false);
	}
	config.recv_tcp.port = port;
})
.on('tcp-send', function(argv, opt) {
	var port = opt['tcp-send'];
	port = Number.parseInt(port, 10);
	if (Number.isNaN(port) || port <= 0) {
		console.log('ERROR: Invalid tcp-send port specified!');
		getopt.showHelp();
		process.exit(false);
	}
	config.send_tcp.port = port;
})
.on('tcp-client', function (argv, opt) {
	var str = opt['tcp-client'];
	var index = str.indexOf(':');
	var port = 1337;
	var host = str;
	if (index >= 0) {
		host = str.substr(0, index);
		port = str.substr(index+1);
		port = Number.parseInt(port, 10);
		if (Number.isNaN(port) || port <= 0) {
			console.log('ERROR: Invalid tcp-client port specified!');
			getopt.showHelp();
			process.exit(false);
		}
	}
	config.client_tcp = { type: 'client', recv: true, send: false, once: false, host: host, port: port };
})
//.setHelp
.bindHelp();

// Parse the command line
var opt = getopt.parseSystem();

// Manditory options...
if (!config.expire) {
	console.log('ERROR: Data Expiration MUST be specified!');
	getopt.showHelp();
	process.exit(false);
}


/*
 * Start everything up.
 */
var dm = new DataManager(config);
var serv_http = new HTTPDataServer(dm, config.server_http);
var serv_ws = new WebSocketDataServer(dm, config.server_ws);
var serv_tcp = new TCPDataServer(dm, config.server_tcp);
if (config.client_tcp) {
	var serv_tcp_client = new TCPDataServer(dm, config.client_tcp);
}
var tcp_recv = new TCPDataServer(dm, config.recv_tcp);
var tcp_send = new TCPDataServer(dm, config.send_tcp);


/* EOF */

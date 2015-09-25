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
 */
var fs = require('fs');
var DataManagerConfig = {
	expire:		null,
	log:		null
};
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
	this.data = { _bserver_: this.meta };
	this.servers = [];
	this.servers_count = 0;
	this.updates = [];
	this.config = om.object_merge({}, DataManagerConfig, config);
}

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

// XXX: DOES NOT PRUNE PRIMATIVES, ONLY OBJECTS
DataManager.prototype.prune = function(ts_current) {

	// No expiration of data
	if (!this.config.expire) {
		return false;
	}

	// Current time was not passed in
	if (ts_current === undefined) {
		ts_current = new Date();
	}

	var ts = new Date(ts_current.getTime() - this.config.expire * 1000);
	var updates = this.updates;
	var i, j;
	var update;
	var links = [];

	// Find all data to be pruned
	var link;
	for (i = 0; i < updates.length; i++) {
		update = updates[i];

		// Don't prune if new enough
		if (update.ts > ts) {
			break;
		}
		
		// Collect data to be pruned
		for (j in update.links) {
			link = update.links[j];
			if (links.indexOf(link) >= 0) {
				continue;
			}
			links.push(link);
		}
	}

	// How much to prune, if nothing return immediately
	if (i === 0) {
		return 0;
	}
	var pruned = i;

	// Make sure we don't prune new data
	var index, p;
	for (i = i; i < updates.length; i++) {
		update = updates[i];

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
	for (i in links) {
		link = links[i];
		om.object_traverse(this.data, function(obj) {
			if (!obj || typeof obj !== 'object') {
				return;
			}

			for (p in obj) {
				if (obj[p] === link) {
					delete obj[p];
				}
			}
			return;
		});
	}

	// Nuke the update references
	this.updates = updates.slice(i);

	// Return the number of updates pruned
	return pruned;
};

DataManager.prototype.update = function(data, dserv, source) {

	// compose update
	var ts = new Date();
	var update = {
		ts: ts,
		data: data,
		dserv: dserv,
		source: source,
		links: []
	};
	this.updates.push(update);

	// prune old data
	this.prune(ts);

	// Handle meta data
	if (data._bserver_) {
		data._bserver_.source = dserv.info;
		this.meta.updated._bserver_ = data._bserver_;
		delete data._bserver_;
	}

	// merge update hook... XXX
	om.object_merge_hooks.before = function(prop, dst, src) {
		if (!dst || typeof dst !== 'object') {
			// Update all sub-objects for pruning
			om.object_traverse(src, function(obj) {
				if (obj && typeof obj === 'object') {
					// XXX: Keep track of old updates
					Object.defineProperty(obj, '_bserver_', { value: update, enumerable: false, configurable: true });
					update.links.push(obj);
				}
			});
		} else {
			// XXX: Keep track of old updates
			Object.defineProperty(dst, '_bserver_', { value: update, enumerable: false, configurable: true });
			update.links.push(dst);
		}
		return src;
	};

	// merge data
	this.meta.updated.epoch_ms = ts.getTime();
	this.meta.updated.iso8601 = ts.toISOString();
	this.meta.updated.str = ts.toUTCString();
	om.object_merge(this.data, data, { _bserver_: this.meta });

	// Reset hook... XXX
	om.object_merge_hooks.before = function(prop, dst, src) {
		return src;
	};

	// log the data
	this.data_log(data, ts, dserv.info, source);

	// broadcast updated data
	var mdata = this.data;
	this.servers.forEach(function(serv) {
		serv.broadcast(mdata);
	});

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

DataServer.prototype.setup = function(manager, defaults, config) {
	this.manager = manager;
	this.dserv = this;
	this.config = om.object_merge({}, defaults, config);
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

	// XXX: arguments
	c.on('close', function(reason, description) {
		// unlink client from server
		var index = this.dserv.clients.indexOf(this);
		if (index >= 0) {
			// XXX: Do this more efficiently
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

	// XXX: Different formats
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
		var data = '';
		try {
			data = JSON.parse(message.utf8Data);
		} catch (e) {
			var error = '[JSON Parse Error!]'; // XXX: e
			this.dserv.log(this.client_string + ' INVALID Message',
				message, error);
			return;
		}

		// Log
		this.dserv.log(this.client_string + ' Message');

		// Update
		this.dserv.manager.update(data, this.dserv, this.info);
	});

	c.on('timeout', function() {
		this.close();
	});
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
			// XXX: Different formats
			c.send(JSON.stringify(this.dserv.manager.data));

			if (config.once) {
				// XXX: BUG:
				c.close();
			}
		}
	});
};

// XXX: Different formats
DataServer.prototype.broadcast = function(data) {
	var config = this.config;
	if (config.send) {
		this.clients.forEach(function each(client) {
			try {
				client.send(JSON.stringify(data));
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
var HTTPDataServerConfigDefaults = {
	server_name:		'Server_HTTP',
	port:			8888,
	root_dir:		'WebClient'
};
var finalhandler = require('finalhandler');
var http = require('http');
var serveIndex = require('serve-index');
var serveStatic = require('serve-static');
var memcache = require('memcache');
var url = require('url');
function HTTPDataServer(manager, config) {
	HTTPDataServer.super_.call(this);
	config = this.setup(manager, HTTPDataServerConfigDefaults, config);
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
		if (rurl.pathname == '/.data' || rurl.pathname == '/.data.json' || rurl.pathname == '/.data.dat') {
			if (req.method == 'GET') {
				// Work-around for IE problems with 'application/json' mimetype
				if (rurl.pathname == '/.data.dat') {
					res.writeHead(200, {
						'Content-Type': 'text/plain',
						'Cache-Control': 'no-cache, no-store, must-revalidate',
						'Expires': '0',
						'Access-Control-Allow-Origin': refhost
					});
				} else {
					res.writeHead(200, {
						'Content-Type': 'application/json',
						'Cache-Control': 'no-cache, no-store, must-revalidate',
						'Expires': '0',
						'Access-Control-Allow-Origin': refhost
					});
				}
				res.write(JSON.stringify(
					this.dserv.manager.data
				));
				res.end();
			}
			return;
		} else if (rurl.pathname.substr(0, 8) == '/.config') {
			res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
			res.setHeader('Expires', '0');
			res.setHeader('Access-Control-Allow-Origin', refhost);
			res.setHeader('Content-Type', 'application/json');
			var key = rurl.pathname.substr(8);
			if (key.charAt(0) != '/') {
				res.statusCode = 404;	// Not Found
				res.end();
				return;
			}
			key = key.substr(1);
			if (key.indexOf('/') >= 0 || key.trim() === '') {
				res.statusCode = 501;	// Not Implemented
				res.statusMessage = 'Not Implemeted (Yet)';
				res.write('{"error": "Invalid Key"}');
				res.end();
				return;
			}
			key = decodeURIComponent(key);
			if (key.search('\s') >= 0) {
				res.statusCode = 501;	// Not Implemented
				res.statusMessage = 'Invalid Key Name';
				res.write('{"error": "Invalid Key Name"}');
				res.end();
				return;
			}
			var mc_client = new memcache.Client(config.memcache.port, config.memcache.host);
			mc_client.on('close', function() {
				res.end();
			});
			mc_client.on('timeout', function() {
				res.statusCode = 504;	// Gateway Timeout
				res.statusMessage = 'memcached Timed-Out';
				res.write('{"error": "memcached Timeout"}');
			});
			mc_client.on('error', function(e) {
				res.statusCode = 500;	// Internal Server Error
				res.statusMessage = 'memcached Error';
				res.write('{"error": "memcached Error"}');
			});

			if (req.method == 'GET') {
				mc_client.on('connect', function() {
					mc_client.get(key, function(error, result) {
						if (error) {
							res.statusCode = 500;
							res.statusMessage = 'memcached Error';
							res.write('{"error": "memcached get error!"}');
						} else {
							// XXX: result could in theory be bunk... Check it
							res.write('{"result": ' + result + '}');
						}
						mc_client.close();
					});
				});
				mc_client.connect();
			} else if (req.method == 'POST') {
				var data = '';
				req.on('data', function(chunk) {
					data = data + chunk;
				});
				req.on('end', function() {
					mc_client.connect();
				});
				mc_client.on('connect', function() {
					mc_client.set(key, data, function(error, result) {
						if (error) {
							res.statusCode = 500;
							res.statusMessage = 'memcached Error';
							res.write('{"error": "memcached Error"}');
						} else if (result == 'STORED') {
							res.statusCode = 201;
							res.write('{"result": "' + result + '"}');
						} else {
							res.statusCode = 500;
							res.statusMessage = 'memcached Error';
							res.write('{"error": "' + result + '"}');
						}
						mc_client.close();
					});
				});
			}
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


/*
 * WebSockets Server
 */
var WebSocketDataServerConfigDefaults = {
	server_name:		'Server_WS',
	send: true,
	recv: false,
	once: false
};
var WebSocketServer = require('websocket').server;
function WebSocketDataServer(manager, config) {
	WebSocketDataServer.super_.call(this);
	config = this.setup(manager, WebSocketDataServerConfigDefaults, config);
	
	this.serv = new WebSocketServer({
		httpServer: serv_http.serv, // XXX
		autoAcceptConnection: false
	});
	this.server_hook();
	this.serv.on('request', function(req) {
		/*
		if (!originIsAllowed(req.origin)) {
			req.reject();
			return;
		}
		*/
		var c = req.accept(null, req.origin);
		this.dserv.client_hook(c);
	});

	return this;
}
util.inherits(WebSocketDataServer, DataServer);

/*
 * TCP Server
 */
var TCPDataServerConfigDefaults = {
	server_name:		'Server_TCP',
	type:			'server',
	term:			0x0a,	// 0x0A for newline testing w/ telnet
					// 0x00 for real release
	once:			true,	// Disconnect after one update?
	send:			true,
	recv:			false
};
var net = require('net');
function TCPDataServer(manager, config) {
	TCPDataServer.super_.call(this);
	config = this.setup(manager, TCPDataServerConfigDefaults, config);
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
			this.write(JSON.stringify(data) + String.fromCharCode(config.term));
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
	var expire = Number.parseInt(opt.expire, 10);
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

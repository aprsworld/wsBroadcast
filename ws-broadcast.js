var util = require('util');

function merge_objects(o1, o2) {
	var out = {};

	for (var p in o1) {
		if (typeof o1[p] !== 'object') {
			out[p] = o1[p];
		} else {
			out[p] = merge_objects({}, o1[p]);
		}
	}

	for (var q in o2) {
		if (typeof o1[q] !== 'object') {
			out[q] = o2[q];
		} else if (typeof o2[q] === 'object') {
			out[q] = merge_objects(o1[q], o2[q]);
		} else {
			out[q] = o2[q];
		}
	}

	return out;
}



/*
 * Data Manager
 */
function DataManager() {
	this.data = {
		_bserver_: {
			uptime: 0//,
//			start: new Date().toString(),
		}
	};
	this.servers = [];
	this.servers_count = 0;

	var self = this;
	setInterval(function() { self.timer.call(self); }, 10*1000);
}
DataManager.prototype.timer = function() {
	if (!this.data._bserver_) {
		this.data._bserver_ = { uptime: 0 };
	} else {
		this.data._bserver_.uptime+=10;
	}
	return this.update(this.data);
};

DataManager.prototype.update = function(data) {
//	this.data = merge_objects(this.data, data);
//	data = this.data;
	this.data = data;

	/* send data to each server to broadcast */
	this.servers.forEach(function(serv) {
		serv.broadcast(data);
	});
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
var dm = new DataManager();


/*
 * Data Server Base
 */
function DataServer() {
	this.manager = null;
	this.dserv = null;
	this.serv = null;
	this.info = { name: '0xDEADBABE', server: 0 };
	this.client_count = 0;
	this.config = null;
}

DataServer.prototype.setup = function(manager, defaults, config) {
	this.manager = manager;
	this.dserv = this;
	this.config = merge_objects(defaults, config);
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
	console.log('# DS(' + this.info.server + ') "' + this.info.name + '": '
		+ args[0] + message);
};

DataServer.prototype.hook = function() {
	this.serv.dserv = this;

	this.serv.on('listening', function() {
		if (typeof this.address === 'function') {
			this.dserv.info.net = this.address();
		}
		this.dserv.log('Started', this.dserv.info);
	});

	this.serv.on('close', function() {
		this.dserv.log('Stopped');
	});
	
	// TODO: XXX: c.on('error',
	
	this.serv.on('connection', function(c) {
		c.dserv = this.dserv;
		c.info = { client: ++this.dserv.client_count};
		c.client_string = 'Client(' + c.info.client + ')';
		if (c.remoteAddress) {	// XXX: Better test
			c.info.net = {
				address: c.remoteAddress,
				port: c.remotePort,
				family: c.remoteFamily
			};
		// Hack: Fix ws encapsulation for WebSocketServer
		} else if (c._socket && c._socket.remoteAddress) { // XXX: Above
			c.info.net = {
				address: c._socket.remoteAddress,
				port: c._socket.remotePort,
				family: c._socket.remoteFamily
			};
		}
		this.dserv.log(c.client_string + ' Open', c.info);

		c.on('close', function(had_error) {
			if (had_error) {
				this.dserv.log(c.client_string
					+ ' Close', '[Unclean!]');
			} else {
				this.dserv.log(c.client_string + ' Close');
			}
		});
		
		c.on('error', function(e) {
			// XXX: BUG: Unclear from docs if safe to JSON e
			this.dserv.log(c.client_string + ' Error',
				this.info, e);
		});

		// TODO:
		// c.on('message'
		// c.on('open',
	});
};

DataServer.prototype.broadcast = function(data) {
	//console.log('DataServer.prototype.broadcast() called but nothing is implemented in this stub');
	//console.log('data=' + data);
	//console.log('typeof data=' + typeof(data));
};


/*
 * HTTP Server
 */
var HTTPDataServerConfigDefaults = {
	server_name:		'Server_HTTP',
	port:			8888,
	root_dir:		'www'
};
var finalhandler = require('finalhandler');
var http = require('http');
var serveIndex = require('serve-index');
var serveStatic = require('serve-static');
var url = require('url');
function HTTPDataServer(manager, config) {
	HTTPDataServer.super_.call(this);
	config = this.setup(manager, HTTPDataServerConfigDefaults, config);
	if (config.port <= 0) { 
		return false; // BUG: ?
	}

	var indexserv = serveIndex('www', {'icons': true});
	var staticserv = serveStatic(config.root_dir, {
		'index': ['index.html']
	});
	this.serv = http.createServer(function(req, res) {
		req.socket.dserv.log(req.socket.client_string + ' Request',
			req.method, req.url);

		// Request for data
		var rurl = url.parse(req.url);
		if (rurl.pathname == '/.data') {
			if (req.method == 'GET') {
				res.writeHead(200, {
					// XXX: IE may have problems
					'Content-Type': 'application/json',
					'Cache-Control': 'no-cache, no-store, must-revalidate',
					'Expires': '0'
				});
				res.write(JSON.stringify(
					this.dserv.manager.data
				));
				res.end();
				return;
			}
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
	this.hook();
	this.serv.listen(config.port);
}
util.inherits(HTTPDataServer, DataServer);
var serv_http = new HTTPDataServer(dm, {});


/*
 * WebSockets Server
 */
var WebSocketDataServerConfigDefaults = {
	server_name:		'Server_WS',
	port:			1228
};
var WebSocketServer = require('ws').Server;
function WebSocketDataServer(manager, config) {
	WebSocketDataServer.super_.call(this);
	config = this.setup(manager, WebSocketDataServerConfigDefaults, config);
	if (config.port <= 0) { 
		return false; // BUG: ?
	}
	
	this.serv = new WebSocketServer({ port: config.port });
	// Fix for ws encapsulation
	this.serv.address = function () { return this._server.address(); };
	this.hook();
	this.serv.on('connection', function(c) {
		c.send(JSON.stringify(this.dserv.manager.data));
	});

	return this;
}
util.inherits(WebSocketDataServer, DataServer);
WebSocketDataServer.prototype.broadcast = function(data) {
	this.serv.clients.forEach(function each(client) {
		client.send(JSON.stringify(data));
	});
};
var serv_ws = new WebSocketDataServer(dm, {});


/*
 * TCP Server
 */
var TCPDataServerConfigDefaults = {
	server_name:		'Server_TCP',
	port:			1229,
	term:			0x0a	// 0x0A for newline testing w/ telnet
					// 0x00 for real release
};
var net = require('net');
function TCPDataServer(manager, config) {
	TCPDataServer.super_.call(this);
	config = this.setup(manager, TCPDataServerConfigDefaults, config);
	if (config.port <= 0) { 
		return false; // BUG: ?
	}
	
	this.serv = net.createServer(function(c) {
		c.message_buffer = new Buffer(0);
		c.process_buffer = function() {
			var start = 0;
			var mb = this.message_buffer;
			for (var i = 0; i < mb.length; i++) {
				if (mb[i] === config.term) {
					var message = mb.toString('utf8', start, i);
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

		c.on('data', function (data) {
			this.message_buffer = Buffer.concat(
				[this.message_buffer, data],
				this.message_buffer.length + data.length);
			this.process_buffer();
		});

		c.on('timeout', function() {
			c.close();
		});

		c.on('message', function(message) {
			var data = '';
			try {
				data = JSON.parse(message);
			} catch (e) {
				var error = '[JSON Parse Error!]'; // XXX: e
				this.dserv.log(this.client_string + ' Message',
					message, error);
				return;
			}
			this.dserv.log(this.client_string + ' Message', data);
			this.dserv.manager.update(data);
		});
	});
	this.hook();
	this.serv.listen(config.port);
	return this;
}
util.inherits(TCPDataServer, DataServer);
var serv_tcp = new TCPDataServer(dm, {});


/* EOF */

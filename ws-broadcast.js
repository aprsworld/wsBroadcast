var util = require('util');


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

	var self = this;
	setInterval(function() { self.timer.call(self) }, 10*1000);
}
DataManager.prototype.timer = function() {
	this.data._bserver_.uptime+=10;
	return this.update({'_bserver_': this.data._bserver_});
};

DataManager.prototype.update = function(data) {
//	this.data = merge_objects(this.data, data);
//	data = this.data;

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
	return true;
};
DataManager.prototype.server_detach = function(serv) {
	this.servers = this.servers.filter(function(serv_cur, serv_index, servers) {
		if (serv_cur == serv)
			return false;
		return true;
	});
	return true;
};
var dm = new DataManager();


/*
 * Event Handlers
 */
function log_event(name) {
	var message = '';
//	console.log('arguments=' + arguments);
//	console.log('arguments.length=' + arguments.length);
//	console.log('arguments[0]=' + arguments[0]);
//	console.log('arguments[1]=' + arguments[1]);
//	console.log('arguments[2]=' + arguments[2]);

//	var args = arguments || {}
//	console.log('args=' + args);

	message = JSON.stringify(arguments);
//	for (var i = 1; i < arguments.length; i++) {
		//message += ' - ' + JSON.stringify(arguments[i]);
		//message += ' - ' + arguments[i];
//	}
	// XXX: TODO: DEBUG: BUG:
	//for (p in this) console.log(p);
	console.log('# ' + name + ' ' + message);
	//console.log('# ' + this.dserv.info.name + ': ' + name + message);
}
// DataServer Handlers
var ds_handlers = {
	'listening': function() { log_event('Started', this.info); },
	'close': function() { log_event('Stopped'); },
	'connection': function() { log_event('Client Open', this.info, 'another message'); }
	// TODO: XXX: 'error'
};
// DataClient Handlers
var dc_handlers = {
	/*'open': function() { log_event('Client Open', this.info); },*/
	'close': function(had_error) {
		if (had_error)
			log_event('Client Close', this.info, '[UNCLEAN]');
		else
			log_event('Client Close', this.info);
	},
	'error': function(e) { log_event('Client Error', this.info, e); }
	// TODO: XXX: 'message'
};
// Install Handlers
function Handlers_Install(emitter, handlers) {
	for (var prop in handlers)
		emitter.on(prop, handlers[prop]);
}


/*
 * Data Server Base
 */
function DataServer() {
	this.manager = null;
	this.dserv = null;
	this.serv = null;
	this.info = { name: '0xDEADBABE' };
	this.config = null;
}
DataServer.prototype.setup = function(manager, defaults, config) {
	this.manager = manager;
	this.dserv = this;
	this.config = merge_objects(defaults, config);
	this.info.name = this.config.server_name;
	this.manager.server_attach(this);
	return this.config;
}
DataServer.prototype.hook = function(handlers) {
	this.serv.dserv = this;
	Handlers_Install(this.serv, handlers);
}
DataServer.prototype.broadcast = function(data) {
}
function merge_objects(o1, o2) {
	var out = {};

	for (var p in o1) {
		if (typeof o1[p] != 'object')
			out[p] = o1[p];
		else
			out[p] = merge_objects({}, o1[p]);
	}

	for (var p in o2) {
		if (typeof o1[p] != 'object')
			out[p] = o2[p];
		else if (typeof o2[p] == 'object')
			out[p] = merge_objects(o1[p], o2[p]);
		else
			out[p] = o2[p];
	}

	return out;
}


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
function HTTPDataServer(manager, config) {
	HTTPDataServer.super_.call(this);
	config = this.setup(manager, HTTPDataServerConfigDefaults, config);
	if (config.port <= 0) return false; // BUG: ?
	var indexserv = serveIndex('www', {'icons': true});
	var staticserv = serveStatic(config.root_dir, {'index': ['index.html']});
	this.serv = http.createServer(function(req, res) {
		var done = finalhandler(req, res);
		staticserv(req, res, function onNext(err) {
			if (err)
				return done(err);
			indexserv(req, res, done);
		});
	});
	this.hook(ds_handlers);
	this.serv.listen(config.port);
	return this;
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
	DataServer.call(this);
	config = this.setup(manager, WebSocketDataServerConfigDefaults, config);

	if (config.port <= 0) 
		return false; // BUG: ?

	this.serv = new WebSocketServer({ port: config.port });
	this.hook(ds_handlers);
	this.serv.on('connection', function(ws) {
		ws.dserv = this.dserv;
		Handlers_Install(ws, dc_handlers);
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
};
var net = require('net');
function TCPDataServer(manager, config) {
	TCPDataServer.super_.call(this);
	config = this.setup(manager, TCPDataServerConfigDefaults, config);
	if (config.port <= 0) return false; // BUG: ?
	this.serv = net.createServer(function(c) {
		c.dserv = this.dserv;
		Handlers_Install(c, dc_handlers);
		c.message_buffer = new Buffer(0);
		c.process_buffer = function() {
			var start = 0;
			for (var i = 0; i < this.message_buffer.length; i++) {
				if (this.message_buffer[i] == config.term) {
					var message = this.message_buffer.toString('utf8', start, i);
					start = i + 1;
					this.emit('message', message);
				}
			}
			if (start != 0) {
				if (start >= this.message_buffer.length) {
					this.message_buffer = new Buffer(0);
				} else {
					var buffer_new = new Buffer(this.message_buffer.length - start);
					this.message_buffer.copy(buffer_new, 0, start);
					this.message_buffer = buffer_new;
				}
			}
		};

		c.on('data', function (data) {
			this.message_buffer = Buffer.concat([this.message_buffer, data], this.message_buffer.length + data.length);
			this.process_buffer();
		});
		c.on('timeout', function() {
			c.close();
		});
		c.on('message', function(message) {
			var data = ''
			console.log("# got a message: " + message);
			try {
				data = JSON.parse(message);
			} catch (e) {
				console.log("# exception e=" + e);
			}
			this.dserv.manager.update(data);
		});
	});
	this.hook(ds_handlers);
	this.serv.listen(config.port);
	return this;
}
util.inherits(TCPDataServer, DataServer);
var serv_tcp = new TCPDataServer(dm, {});


/* EOF */

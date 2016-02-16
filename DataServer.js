/*
 * Data Server Base
 */
var jsUtils = require('@aprsworld/jsutils');
var pako = require('pako');
var util = require('util');

function DataServer() {
	this.config = null;
	this.manager = null;
	this.dserv = this;
	this.nserv = null;
	this.info = { name: '0xDEADBABE', server: null };
	this.clients = [];
	this.client_count = 0;
	return this;
}

DataServer.prototype.setup = function(manager, config) {
	this.config = {}.merge(this.config_default, config);
	this.dserv = this;
	this.info = {
		name: this.config.server_name,
		config: this.config
	};
	manager.server_attach(this);
	return this.config;
};

DataServer.prototype.client_hook = function(c) {

	// Update various info and links
	c.dserv = this;
	c.info = { client: ++this.dserv.client_count, net: {} };
	if (c.remoteAddress) { // TODO: Better test
		c.info.net.address = c.remoteAddress;
		c.info.net.port = c.remotePort;
		c.info.net.family = c.remoteFamily;
	}
	this.log('Client Connected', c.info);
	this.clients.push(c);

	// Client Closed Connection
	c.on('close', function(reason, description) {

		// Unlink client from server
		var index = this.dserv.clients.indexOf(this);
		if (index >= 0) {
			this.dserv.clients.splice(index, 1);
		}

		// Log
		if (reason && reason != 1000) {
			if (description) {
				this.dserv.log('Client Died!', this.info, reason, description);
			} else {
				this.dserv.log('Client Died!', this.info);
			}
		} else {
			this.dserv.log('Client Disconnected', this.info);
		}
	});

	// Client Error
	c.on('error', function(e) {
		// TODO: Unclear if safe to JSON e
		this.dserv.log('Client Error!', this.info);
	});

	c.on('message', function(message) {
		var config = this.dserv.config;

		// Ignore?
		if (!config.recv) {
			this.dserv.log('Ignoring Client Message!', this.info, message);
			return;
		}

		// Sanity
		if (message.type != 'utf8') {
			this.dserv.log('Client Sent Invalid Message!', this.info, message);
			return;
		}

		// Parse
		var update = null;
		try {
			update = JSON.parse(message.utf8Data);
		} catch (e) {
			// TODO: Unclear if safe to JSON e
			var error = ['JSON Parse Error!'];
			this.dserv.log('Client Sent Invalid Message!', this.info, message, error);
			return;
		}

		// Log
		this.dserv.log('Client Sent Message', this.info, update);

		// Update
		if (update.data && update.uri) {
			this.dserv.manager.data_update(update.uri, update.data, this, update.persist);
		} else {
			this.dserv.manager.data_update(null, update, this, false);
		}
	});

	// Client Timed-out
	c.on('timeout', function() {
		// XXX: this.close();
	});

	// Send a Message to Client
	c.update_send = function(data) {
		var json = JSON.stringify(data);
		var send = json;
		if (this.gzip) {
			send = pako.deflate(send, { to: 'string' });
		}
		this.send(send);
	};

	// Send initial update
	if (c.dserv.config.send) {
		c.update_send(this.manager.data);
		if (c.dserv.config.once) {
			c.end();
		}
	}
};

DataServer.prototype.server_hook = function() {

	// Update pointer to this dataserver
	this.nserv.dserv = this;

	// Update info if this server is really a client
	this.nserv.on('lookup', function(err, address, family) {
		this.info.net.address = address;
		this.info.net.family = family;
	});

	// Update info when this server starts
	this.nserv.on('listening', function() {
		if (typeof this.address === 'function') {
			this.dserv.info.net = this.address();
		}
		this.dserv.log('Started', this.dserv.info);
	});

	// Update info when this server stops
	this.nserv.on('close', function() {
		// WebSockets Hack
		if (arguments.length == 3) {
			return;
		}
		this.dserv.log('Stopped', this.dserv.info);
	});

	// TODO: this.serv.on('error', ...

	// Client connected
	this.nserv.on('connection', function(c) {
		var config = this.dserv.config;

		// Hook client
		this.dserv.client_hook(c);
	});
};

DataServer.prototype.log = function() {
	var args = arguments || [];
	var message = '';
	for (var i = 1; i < args.length; i++) {
		message += ' - ' + JSON.stringify(args[i]);
	}
	console.log('# DS(' + this.info.server + ') "' +
		this.info.name + '": ' + args[0] + message);
};

// Broadcast update to all clients
DataServer.prototype.broadcast = function(data) {
	var config = this.config;
	var self = this;
	if (config.send) {
		this.clients.forEach(function(client) {
			try {
				client.update_send(data);
			} catch (e) {
				self.log('Client Error!', 'Could not send message!');
				client.close(); // XXX: Needed?
			}
		});
	}
};

module.exports = DataServer;

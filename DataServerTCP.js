/*
 * TCP Data Server
 */
(function () {
"use strict";

var DataServer = require('./DataServer');
var util = require('util');
var net = require('net');
var zlib = require('zlib');
function TCPDataServer(manager, config) {
	TCPDataServer.super_.call(this);
	config = this.setup(manager, config);
	if (config.port <= 0) {
		return false;
	}

	var self = this;
	this.connection_handler = function(c) {
		if (!c) {
			c = self.nserv;
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
			if (!this.dserv.config.once) {
				this.process_buffer();
			}
		});

		c.on('close', function (had_error) {
			if (had_error) {
				return;
			}
			if (this.message_buffer[0] == 0x1F && this.message_buffer[1] == 0x8B) {
				this.message_buffer = zlib.gunzipSync(this.message_buffer);
			}
			var message = {
				type: 'utf8',
				utf8Data: this.message_buffer.toString('utf8')
			};
			this.emit('message', message);
		});

		c.send = function(data) {
			this.write(data + String.fromCharCode(config.term));
		};

		c.close = function() {
			this.end();
		};
	};

	if (config.type == 'client') {
		this.nserv = net.createConnection(config.port, config.host,
			this.connection_handler);
		this.nserv.info = { net: { host: config.host, port: config.port }};
		this.nserv.client_string = config.host;
		this.server_hook();
		this.client_hook(this.nserv);
	} else if (config.type == 'server') {
		this.nserv = net.createServer(this.connection_handler);
		this.server_hook();
		this.nserv.listen(config.port);
	} else {
		return false;
	}

	return this;
}
util.inherits(TCPDataServer, DataServer);

TCPDataServer.prototype.config_default = {}.merge(DataServer.config_default, {
	server_name:	'Server_TCP',
	type:		'server',
	term:		0x0A,
	once:		true,	// Disconnect after one update?
	send:		true,
	recv:		false
});

module.exports = TCPDataServer;

})();

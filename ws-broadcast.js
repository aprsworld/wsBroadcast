/*
 * Server Ports
 *	Set to 0 for default or -1 to disable
 */
var httpserv_port = 8888;
var wsserv_port = 1228;
var tcpserv_port = 1229;

/*
 * Globals
 */
var wsserv;

/*
 * Base Data Connection Server Class
 */
function DataServer() {
	this.name = '0xDEADBABEBEEFCAFE';
	this.listen_info = '0xDEADBABEBEEFCAFE';
}
DataServer.prototype.on_start = function() {
	console.log("# " + this.name + ': Started - ' + JSON.stringify(this.listen_info));
}
DataServer.prototype.on_stop = function() {
	console.log("# " + this.name + ': Stopped - ' + JSON.stringify(this.listen_info));
}
DataServer.prototype.on_error = function(e) {
	console.log("# " + this.name + ': Error - ' + JSON.stringify(e));
}
DataServer.prototype.on_connection = function(c) {
	console.log("# " + this.name + ': Connection - ' + JSON.stringify(c.client_info));
}

/*
 * Base Data Connection Client Class
 */
function DataClient(s) {
	this.server = s;
	this.client_info = '0xDEADBABEBEEFCAFE'; 
	this.on('close', this.on_close);
	this.on('error', this.on_error);
	this.on_connect();
}
DataClient.prototype.on_connect = function() {
	console.log("# " + this.server.name + ': Client Connected - ' + JSON.stringify(this.client_info));
}
DataClient.prototype.on_disconnect = function() {
	console.log("# " + this.server.name + ': Client Disconnected - ' + JSON.stringify(this.client_info));
}
DataClient.prototype.on_error = function(e) {
	console.log("# " + this.server.name + ': Client Error - ' + JSON.stringify(this.client_info) + ' - ' + JSON.stringify(e));
}

/*
 * HTTP Server
 */
if (httpserv_port == 0)
	httpserv_port = 8888;	// TODO: Default web server port
if (httpserv_port > 0) {
	var finalhandler = require('finalhandler');
	var http = require('http');
	var serveStatic = require('serve-static');

	// Create static server for www directory
	var serve = serveStatic('www', {'index': 'test.html'});

	// Create HTTP server
	var httpserv = http.createServer(function(req, res) {
		var done = finalhandler(req, res);
		serve(req, res, done);
	});

	// Start HTTP Server
	httpserv.listen(httpserv_port);
	console.log("# " + 'Server_HTTP: Listening Port - ' + httpserv_port);
}

/*
 * WebSockets Server
 */
if (wsserv_port == 0)
	wsserv_port = 1228;	// TODO: default port
if (wsserv_port > 0) {
	console.log("# " + 'WS Port: Listening Port - ' + wsserv_port);


	var WebSocketServer = require('ws').Server;
	wsserv = new WebSocketServer({ port: wsserv_port });

	wsserv.on('connection', function connection(ws) {
		ws.client_info = { "addr": ws._socket.remoteAddress, "port": ws._socket.remotePort };
		console.log("# " + 'Server_WS: Client Connected - ' + JSON.stringify(ws.client_info)); 
		ws.on('message', function incoming(message) {
			// TODO, handle incoming data
		});
		ws.on('close', function close() {
			console.log("# " + 'Server_WS: Client Disconnected - ' + JSON.stringify(this.client_info));
		});
		ws.on('error', function error(e) {
			console.log("# " + 'Server_WS: Client Error - ' + JSON.stringify(this.client_info) + ' - ' + JSON.stringify(e));
		});
	});

	wsserv.broadcast = function broadcast(data) {
		wsserv.clients.forEach(function each(client) {
			client.send(data, function ack(error) {
				// TODO, handle error
			});
		});
	};
}

/*
 * TCP Server
 */
if (tcpserv_port == 0)
	tcpserv_port = 1229;	// TODO: Default tcpserv port
if (tcpserv_port > 0) {
	var net = require('net');
	var tcpserv = net.createServer(function(c) {
		c.client_info = { 'addr': c.remoteAddress, 'port': c.remotePort };
		c.message_buffer = new Buffer(0);
		c.process_buffer = function () {
			var start = 0;
			for (var i = 0; i < this.message_buffer.length; i++) {
				if (this.message_buffer[i] == 0x0) {
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
		console.log("# " + 'Server_TCP: Client Connected - ' + JSON.stringify(c.client_info));
		c.on('end', function() {
			console.log("# " + 'Server_TCP: Client Disconnected - ' + JSON.stringify(this.client_info));
		});
		c.on('error', function() {
			console.log("# " + 'Server_TCP: Client Error - ' + JSON.stringify(this.client_info));
		});
		c.on('data', function (data) {
			this.message_buffer = Buffer.concat([this.message_buffer, data], this.message_buffer.length + data.length);
			this.process_buffer();
		});
		c.on('message', function(data) {
			// TODO - 
			console.log(data);
		});
	});
	tcpserv.listen(tcpserv_port, function() {
		console.log("# " + 'Server_TCP: Listening Port - ' + tcpserv_port);
	});
}

/*
 * Actual Logic
 */
var ds = {
	counter: 0,
	epoch: new Date().toString(),
	message: "Hello"
};
setInterval(function timer() {
	ds.counter++;
	if (wsserv != null)
		wsserv.broadcast(JSON.stringify(ds));
}, 1000);

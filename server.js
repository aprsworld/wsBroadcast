(function () {
"use strict";

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

var DataManager = require('./DataManager');
var TCPDataServer = require('./DataServerTCP');
var HTTPDataServer = require('./DataServerHTTP');
var fs = require('fs');

/*
 * Process Command Line Options
 */
var config = {	server_http: {
			port: process.env.npm_package_config_http_port // 8888
		},
		recv_tcp: {
			port: 1229,
			send: false,
			recv: true,
			once: true
		},
		send_tcp: {
			port: 1230,
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
	['',	'expire=seconds',	'Number of seconds to expire old data. [REQUIRED]'],
	['',	'http-server=port', 'Port to run HTTP server on. [DEFAULT: 8888]'],
	['',	'tcp-server=port', 'Port for TCP Broadcast Server. [DEFAULT: 1337]'],
	['',	'tcp-recv=port', 'Port to run simple TCP Server on to update data on. [DEFAULT: 1229]'],
	['',	'tcp-send=port', 'Port to run simple TCP Server on to retrive data on. [DEFAULT: 1230]'],
	['',	'tcp-client=host[:port]', 'Mirror data from a remote TCP Broadcast Server.'],
	['',	'webdir=dir', 'Absolute path to the Root directory of the HTTP Server. [REQUIRED]'],
	['',	'remap=file', 'File to remap 404 root entries. [DEFAULT: index.html]'],
	['',	'persist=file', 'JSON file used for persistent data.'],
	['',	'log=dir',	'Directory to log data into.'],
	['',	'ping=time',	'Send a ping every n seconds.'],
	['h',	'help',		'Display this help.'],
	['v',	'version',	'Display the version number.']
])
.on('version', function(argv, opt) {
	console.log('v0.1.1');	// XXX
	process.exit(false);
})
.on('log', function (argv, opt) {
	config.log = opt.log;
	var valid = false;
	try {
		valid = fs.statSync(config.log).isDirectory();
	} catch (e) {}
	if (!valid) {
		console.log('ERROR: Log directory does not exist!');
		getopt.showHelp();
		process.exit(false);
	}
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
	if (Number.isNaN(port) || port < 0) {
		console.log('ERROR: Invalid http-server port specified!');
		getopt.showHelp();
		process.exit(false);
	}
	config.server_http.port = port;
})
.on('webdir', function(argv, opt) {
	config.server_http.root_dir = opt.webdir;
	if (config.server_http.root_dir[0] != '/') {
		console.log('ERROR: Web document root must be an absolute path!');
		getopt.showHelp();
		process.exit(false);
	}
	var valid = false;
	try {
		valid = fs.statSync(config.server_http.root_dir).isDirectory();
	} catch (e) {}
	if (!valid) {
		console.log('ERROR: Web doument root does not exist!');
		getopt.showHelp();
		process.exit(false);
	}
})
.on('remap', function(argv, opt) {
	config.server_http.remap = opt.remap;
})
.on('persist', function(argv, opt) {
	config.persist = opt.persist;
})
.on('ping', function(argv, opt) {
	config.ping = opt.ping;
})
.on('tcp-server', function(argv, opt) {
	var port = opt['tcp-server'];
	port = Number.parseInt(port, 10);
	if (Number.isNaN(port) || port < 0) {
		console.log('ERROR: Invalid tcp-server port specified!');
		getopt.showHelp();
		process.exit(false);
	}
	config.server_tcp.port = port;
})
.on('tcp-recv', function(argv, opt) {
	var port = opt['tcp-recv'];
	port = Number.parseInt(port, 10);
	if (Number.isNaN(port) || port < 0) {
		console.log('ERROR: Invalid tcp-recv port specified!');
		getopt.showHelp();
		process.exit(false);
	}
	config.recv_tcp.port = port;
})
.on('tcp-send', function(argv, opt) {
	var port = opt['tcp-send'];
	port = Number.parseInt(port, 10);
	if (Number.isNaN(port) || port < 0) {
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

// Mandatory options...
if (!config.expire) {
	console.log('ERROR: Data Expiration MUST be specified!');
	getopt.showHelp();
	process.exit(false);
}

/* print out our current configuration before starting */
console.log("-----------------------------------------------------");
console.log("# Starting with configuration:");
console.log(config);
console.log("-----------------------------------------------------");

/*
 * Start everything up.
 */
var dm = new DataManager(config);
var serv_http;
if (config.server_http.port) {
	serv_http = new HTTPDataServer(dm, config.server_http);
}
var serv_tcp;
if (config.server_tcp.port) {
	serv_tcp = new TCPDataServer(dm, config.server_tcp);
}
if (config.client_tcp) {
	var serv_tcp_client = new TCPDataServer(dm, config.client_tcp);
}
var tcp_recv;
if (config.recv_tcp.port) {
	tcp_recv = new TCPDataServer(dm, config.recv_tcp);
}
var tcp_send;
if (config.send_tcp.port) {
	tcp_send = new TCPDataServer(dm, config.send_tcp);
}

/*
 * Process Signals
 */
process.on('SIGHUP', function() {
	console.log('# SIGHUP Received: Persisting Data.');

	if (config.persists && !dm.data_save(config.persist)) {
		console.log("# Error: Could not write initialization file!");
	}
});

})();

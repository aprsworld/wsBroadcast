/*
 * BroadcastClient Object
 *
 *	Will immediately start a connection to periodically obtain data from
 *	a broadcast server.
 *
 * config object
 *	url_ws is the WebSocket url used.
 *	url_ajax is the AJAX url used.
 *	delay_inc is the amount of seconds added after each failed connection
 *	delay_max is the longest delay waited after each failed connection
 *	poll_freq is the frequency at which AJAX polls will happen 
 *
 *	callback_error is a callback called whenever there is an error
 *		error([errors], reconnect_delay)
 *			where [errors] is an array of errors with the first
 *			always being a string containing a general and short
 *			description of the error.
 *			where reconnect_delay is the number of seconds until
 *			another connection attempt will happen if needed.
 *	callback_update is a callback called whenever there is new data
 *		update(data)
 *			where data is a standard JavaScript object created
 *			from JSON data.
 *
 *	logger	is a 'logger' object.  If one isn't passed in the standard
 *		console object from the browser is used.
 *		Currently it uses log, error, warn, info, and debug.
 *		If any aren't defined they fallback to log and if that
 *		doesn't exist, it's an empty function.
 *		If debug doesn't exist and config doesn't contain debug
 *		the logger's debug will be an empty function.
 *		Simply passing null in will suffice to disable all messages.
 *
 *	debug is a flag to specify print extra crap for debugging purposes.
 */
function BroadcastClient(config) {

	// Set Defaults
	this.url_ws = 'ws://' + window.location.hostname + ':' + 1228 + '/.data';	// XXX: port
	this.url_ajax = 'http://' + window.location.hostname + ":" + window.location.port + '/.data';
	this.delay_inc = 10;		// 10 seconds
	this.delay_max = 60 * 5;	// 5 minute default
	this.poll_freq = 20;		// 20 second default

	// error([errors], reconnect_delay)
	this.callback_error = function() {};
	// update(data)
	this.callback_update = function() {};
	
	this.logger = console;


	// merge in config object
	$.extend(this, config);	

	// Set initial properties
	this.delay = 0;	// delay after connection failure
	this.ws = null; // current WebSocket
	this.ws_error = false;	// false if no WebSocket error, otherwise the error

	// Clean up logger
	if (!this.logger) {
		this.loger = { log: function() {} };
	}
	var logger = this.logger;
	if (!logger.error) {
		logger.error = logger.log;
	}
	if (!logger.warn) {
		logger.warn = logger.log;
	}
	if (!logger.info) {
		logger.info = logger.log;
	}
	if (!logger.debug) {
		if (this.debug) {
			logger.debug = logger.log;
		} else {
			logger.debug = function() {};
		}
	}

	// Make a Connection
	if (!this.Connect()) {
		return false; // XXX
	}

	// We should be good.
	return this;
}


/*
 * Message Handler
 */
BroadcastClient.prototype.onMessage = function(text) {
	//this.logger.debug('wsb-client: Received message.');

	// Parse JSON Message
	var data = null;
	try {
		data = JSON.parse(text);
	} catch (e) {
		this.onError(['JSON Parse Error', e]);
		return;
	}

	// Do something with data
	this.onData(data);
};


/*
 * Data Handler
 */
BroadcastClient.prototype.onData = function(data) {
	this.logger.debug('wsb-client: Received new data.');
	try {
		this.callback_update(data);
	} catch (e) {
		this.onError(['Error in executing update callback!', e]);
	}
};


/*
 * Error Handler
 */
BroadcastClient.prototype.onError = function(error) {
	this.logger.error('wsb-client: ' + error[0]);
	try {
		this.callback_error(error, this.delay);
	} catch (e) {
		this.logger.error('wsb-client: Error in executing error callback function!');
	}
};


/*
 * Delay Throttling
 */
BroadcastClient.prototype.ConnectThrottle = function (reset) {

	// Reset the throttle?
	if (reset) {
		this.delay = 0;
		return;
	}

	// Throttle it more
	this.delay = this.delay + this.delay_inc;
	if (this.delay > this.delay_max) {
		this.delay = this.delay_max;
	}
};


/*
 * AJAX Polling
 */
BroadcastClient.prototype.AJAXConnect = function () {
	this.logger.debug('wsb-client: Making JQuery AJAX Request...');
	var self = this;

	// XXX: TODO: IE Workaround (append '.dat' to url)
	$.ajax(self.url_ajax, {
		cache: 'false',
		dataType: 'json',
		error: function (XHR, status, error) {
			self.ConnectThrottle();
			// XXX: XHR?
			self.onError(['AJAX Error!', status, error]);
			setTimeout($.proxy(self.AJAXConnect, self), self.delay * 1000);
		},
		success: function (data, status, XHR) {
			// XXX: status, XHR?
			self.onUpdate(data);
			setTimeout($.proxy(self.AJAXConnect, self), self.poll_freq * 1000);
		}
	});

	// Was successful (in theory)...
	return true;
};

/*
 * WebSocket Connection
 */
BroadcastClient.prototype.WSConnect = function() {
	this.logger.log('wsb-client: Connecting via WebSockets...');

	// Sanity
	if (this.ws) {
		this.logger.error('wsb-client: WebSockets already connected!');
		return false;
	}


	//
	// Create WebSocket
	//

	// Standard WebSockets Implementation
	if (!this.method || this.method == 'WebSocket') {
		try {
			this.ws = new WebSocket(this.url_ws);
		} finally {
			if (!this.ws && this.method) {
				this.logger.error('wsb-client: WebSockets unavailable!');
				return false;
			}
		}
	}

	// Mozilla WebSockets Implementation
	if (!this.ws && (!this.method || this.method == 'MozWebSocket')) {
		try {
			this.ws = new MozWebSocket(this.url_ws);
		} finally {
			if (!this.ws && this.method) {
				this.logger.error('wsb-client: MozWebSockets unavailable!');
				return false;
			}
		}
	}

	// Flash WebSockets Emulation
	if (!this.ws && (!this.method || this.method == 'FlashWebSocket')) {
		try {
			this.ws = new FlashWebSocket(this.url_ws);
		} finally {
			if (!this.ws && this.method) {
				this.logger.error('wsb-client: FlashWebSocket unavailable!');
				return false;
			}
		}
	}

	// Method chosen doesn't actually exist
	if (!this.ws && this.method) {
		this.logger.error('wsb-client: ' + this.method + ' implementation doesn\'t exist!');
		return false;
	}

	// All methods failed
	if (!this.ws) {
		this.logger.error('wsb-client: No WebSocket implementations available!');
		return false;
	}


	//
	// Install WebSocket Handlers
	//
	var self = this;

	// WebSocket Connection Complete
	this.ws.onopen = function() {
		self.logger.log('wsb-client: WebSocket Connected.');
		self.ConnectThrottle(true);
		self.ws_error = false;
	};

	// WebSocket Message
	this.ws.onmessage = function(m) {
		self.onMessage(m.data);
	};

	// WebSocket Closed
	this.ws.onclose = function(e) {
		self.logger.warn('wsb-client: WebSocket Disconnected.');
		// XXX: e
		if (!self.ws_error) {
			self.onError(['WebSocket Disconnected', e]);
		} else {
			self.ConnectThrottle();
		}
		self.ws = null;
		setTimeout($.proxy(self.WSConnect, self), self.delay * 1000);
	};

	// WebSocket Error
	this.ws.onerror = function(e) {
		self.onError(['WebSocket Error', e]);
		self.ws_error = e;
	};

	// Was successful (in theory)...
	return true;
};

/*
 * Connect
 *
 * If a method configuration is set use that specific method, otherwise
 * try them all until one works...
 */
BroadcastClient.prototype.Connect = function() {

	// WebSockets methods
	if (!this.method || this.method.search('WebSocket$')) {
		if (this.WSConnect()) {
			return true;
		}
	}

	// AJAX method
	if (!this.method || this.method == 'AJAX') {
		if (this.AJAXConnect()) {
			return true;
		}
	}

	// All methods failed or we requested to just fail here
	if (!this.method || this.method == 'Fail') {
		this.logger.error('wsb-client: All connection methods failed!');
		return false;
	}

	// Some method we don't support was requested
	this.logger.error('wsb-client: Connection method ' + this.method + ' does not exist!');
	return false;
};

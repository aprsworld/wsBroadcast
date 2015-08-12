function BroadcastClient(config) {
	/* Get configuration */
	this.url_ws = 'ws://' + window.location.hostname + ':' + 1228 + '/.data';
	this.url_ajax = 'http://' + window.location.hostname + ":" + window.location.port + '/.data';
	this.delay = 0;
	this.delay_inc = 10;		// 10 seconds
	this.delay_max = 60 * 5;	// 5 minute default
	this.poll_freq = 60;		// 1 minute default

	// error([errors], reconnect_delay)
	this.callback_error = function() {};
	// update(data)
	this.callback_update = function() {};

	// merge in config object
	$.extend(this, config);	


	/* AJAX Polling fallback */
	this.ajax_connect = function () {
		var self = this;
		// XXX: TODO: IE Workaround (append '.dat' to url)
		$.ajax(self.url_ajax, {
			cache: 'false',
			dataType: 'json',
			error: function (XHR, status, error) {
				self.delay = self.delay + self.delay_inc;
				self.delay = (self.delay >= self.delay_max) ? self.delay_max : self.delay;
				self.callback_error(['AJAX Error', status, error], self.delay);
				setTimeout($.proxy(self, self.ajax_connect), self.delay * 1000);
			},
			success: function (data, status, XHR) {
				// TODO: XXX: Check status
				self.callback_update(data);
				setTimeout($.proxy(self, self.ajax_connect), self.poll_freq * 1000);
			}
		});
		return true;
	}

	/* WebSocket Connection */
	this.ws_connect = function() {
		var ws = null;

		try {
			ws = new WebSocket(this.url_ws);
		} finally {
			if (!ws) {
				return this.ajax_connect();
			}
		}

		var self = this;
		ws.onopen = function() {
			self.delay = 0;
		}

		ws.onmessage = function(m) {
			var data = null;
			try {
				data = JSON.parse(m.data);
			} catch (e) {
				self.callback_error(['JSON Parse Error', e], null);
				return;
			}
			self.callback_update(data);
		}

		ws.onclose = function(ws_error) {
			if (!ws_error) {
				self.callback_error(['WebSocket Disconnected'], delay);
			}
			setTimeout($.proxy(self, self.ws_connect), self.delay * 1000);
		}

		ws.onerror = function(e) {
			self.elay = self.delay + self.delay_inc;
			self.delay = (self.delay >= self.delay_max) ? self.delay_max : self.delay;
			callback_error(['WebSocket Error', e], self.delay);
		}

		return true;
	}


	/* Actually do the deed */
	this.ws_connect();
	return this;
}

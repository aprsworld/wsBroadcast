/*
 * Data Manager
 */
var jsUtils = require('@aprsworld/jsutils');
var util = require('util');

function decPad (num, size) {
	var ret = '';
	while (Math.pow(10, --size) > num) {
		ret = ret + '0';
	}
	ret = ret + num;
	return ret;
}

function DataManager(config) {
	this.config = {}.merge(this.config_default, config);
	var ts = new Date();
	this.meta = {
		start: {
			ts:		ts.getTime(),
			iso8601:	ts.toISOString(),
			str:		ts.toUTCString()
		},
		updated: {
			source:		null,
			ts: 		0,
			iso8601:	'',
			str:		''
		}
	};
	this.servers = [];
	this.servers_count = 0;
	this.data = { /*_bserver_: this.meta*/ };
	var self = this;
	this.timer = setInterval(function() { self.grimreaper(); },
			this.config.expire * 1000);
	return this;
}

DataManager.prototype.config_default = {
	log:		null
};

DataManager.prototype.grimreaper = function() {
	var ts = new Date().getTime();
	var ts_expire = ts - (this.config.expire * 1000);
	var update = {};

	function prune (update, data, expire) {

		// Prune stuff
		var pruned = false;
		if (typeof data !== 'object') {
			return pruned;
		}

		// Do it...
		for (var p in data._bserver_) {

			// Ignore
			if (p == '_bserver_') {
				delete data._bserver_._bserver_;
				continue;
			}

			// This has been manually pruned...
			if (data[p] === null) {
				data._bserver_[p] = null;
				continue;
			}

			// Anything to prune in here?
			if (!data._bserver_[p].p && data._bserver_[p].ts < expire) {
				data._bserver_[p] = null;
				data[p] = null;
				pruned = true;
				update[p] = null;
				continue;
			}

			// Recurse and remember if we prune something...
			update[p] = {};
			if (!prune(update[p], data[p], expire)) {
				delete update[p];
			} else {
				pruned = true;
			}
		}

		// All done
		return pruned;
	}

	function reap (data) {
		if (!data || typeof data !== 'object') {
			return;
		}
		for (var p in data) {
			if (data[p] === null) {
				delete data[p];
				delete data._bserver_[p];
				continue;
			}
			reap(data[p]);
		}
	}

	// Prune old data and send update
	update = {};
	if (prune(update, this.data, ts_expire)) {
		// Broadcast updated data
		this.servers.forEach(function(serv) {
			serv.broadcast(update);
		});
	}

	// Reap old data
	reap(this.data);
};

DataManager.prototype.uri_parse = function(uri) {

	// Already parsed?
	if (uri instanceof Array) {
		return uri;
	}

	// Split URI into links
	var links = uri.split('/');
	//var leaf = true;

	// Remove empty link in case absolute URI was given
	if (links.length > 1 && links[0] === '') {
		links.shift();
	}

	// Decode the URI links
	for (var i = 0; i < links.length; i++) {
		links[i] = decodeURI(links[i]);
	}

	// Return the parsed URI
	return links;
};

DataManager.prototype.data_get = function(uri) {
	var node = this.data;

	// No URI, send it all!
	if (!uri) {
		return { node: node, prop: null, uri: null };
	}

	// Parse URI
	var links = this.uri_parse(uri);
	var prop = links.pop();

	// Traverse to find node
	for (var i = 0; i < links.length; i++) {
		var link = links[i];
		node = node[link];

		// Can't traverse
		if (node === null || typeof node !== 'object') {
			return undefined;
		}
	}

	// Return results
	return { node: node, prop: prop, uri: uri };
};

DataManager.prototype.data_meta_inject = function(data, meta) {
	if (typeof data !== 'object') {
		return;
	}
	data._bserver_ = {};
	for (var p in data) {
		if (p == '_bserver_') {
			continue;
		}
		data._bserver_[p] = {}.merge(meta); // XXX: clone
		if (data[p] && typeof data[p] === 'object') {
			this.data_meta_inject(data[p], meta);
		}
	}
};

DataManager.prototype.data_wrap = function(uri, data, meta) {

	// Inject meta-data
	this.data_meta_inject(data, meta);

	// Nothing to do
	if (!uri) {
		return data;
	}

	// Wrap the data in URI objects
	var links = this.uri_parse(uri);
	if (links[links.length-1] === '') {
		links.pop();
	}
	for (var i = links.length-1; i >= 0; i--) {
		var tmp = {};
		tmp[links[i]] = data;

		// Inject meta-data...
		tmp._bserver_ = {};
		tmp._bserver_[links[i]] = {}.merge(meta); // XXX: clone

		// Up one level...
		data = tmp;
	}

	// Return wrapped data
	return data;
};

DataManager.prototype.data_update = function(uri, data, client, persist) {

	// MetaData tracking
	var ts = new Date().getTime();
	var meta = { ts: ts };
	if (persist) {
		meta.p = 1;
	}

	// Wrap data if needed
	var wrap = this.data_wrap(uri, data, meta);

	// Merge data in
	this.data.merge(wrap);

	// Log the data
	if (this.config.log instanceof String) {
		this.data_log(uri, data, client, ts, persist);
	}

	// Broadcast updated data
	this.servers.forEach(function(serv) {
		serv.broadcast(wrap);
	});

	// All done
	return true;
};

DataManager.prototype.data_log = function(uri, data, client, ts, persist) {

	// Clean up output of persist
	if (persist) {
		persist = true;
	} else {
		persist = false;
	}

	// Nowhere to log
	if (!this.config.log) {
		return false;
	}

	// Get string representation of date
	var log_date = ts.getUTCFullYear.toString() + decPad(ts.getUTCMonth(), 2) + decPad(ts.getUTCDate(), 2);

	// Open log file
	var log_fd = -1;
	try {
		log_fd = fs.openSync(this.config.log + '/' + log_date + '.json',
				'a', 0644);
	} finally {
		if (log_fd < 0) {
			console.log('# DataLog: ERROR: Could not open log file - data not logged!');
			return false;
		}
	}

	// Write to log file
	var res = true;
	var log_data = JSON.stringify([ts, client.info, persist, uri, data]);
	var log_datasize = Buffer.byteLength(log_data, 'UTF-8');
	var log_written = fs.writeSync(log_fd, log_data, null, 'UTF-8');
	if (log_written <= 0) {
		console.log('# DataLog: ERROR: Could not write to log file!');
		res = false;
	} else if (log_written != lot_datasize) {
		console.log('# DataLog: ERROR: Could not write to log file!');
		console.log('# DataLog: ERROR: File likely corrupted!');
		res = false;
	}

	// Close the log file
	fs.closeSync(log_fd);

	// All done
	return res;
};

// TODO: data_save(filename), data_load(filename)

DataManager.prototype.server_attach = function(serv) {

	// Ensure this server isn't already linked
	if (this.servers.indexOf(serv) >= 0) {
		console.log('# ERROR: DataManager: Attaching already attached server - ' + JSON.stringify(serv.info));
		return false;
	}

	// Link this server
	this.servers.push(serv);

	// Update server info
	serv.manager = this;
	serv.info.server = ++this.servers_count;

	// All done
	return true;
};

DataManager.prototype.server_detach = function(serv) {

	// Ensure this server is already linked
	if (this.servers.indexOf(serv) < 0) {
		console.log('# ERROR: DataManager: Detaching a server that was never attached - ' + JSON.stringify(serv.info));
		return false;
	}

	// Remove server from linking
	this.servers = this.servers.filter(function(serv_cur, serv_index, servers) {
		if (serv_cur == serv) {
			return false;
		}
		return true;
	});

	// Update server info
	serv.dmanager = null;
	serv.info.server = null;

	// All done
	return true;
};

module.exports = DataManager;

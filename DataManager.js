/*
 * Data Manager
 */
var jsUtils = require('@aprsworld/jsutils');

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
			epoch_ms:	ts.getTime(),
			iso8601:	ts.toISOString(),
			str:		ts.toUTCString()
		},
		updated: {
			//source:		null,
			epoch_ms: 	0,
			iso8601:	'',
			str:		''
		}
	};
	this.servers = [];
	this.servers_count = 0;
	this.data = { _bserver_: this.meta };
}

DataManager.prototype.config_default = {
	log:		null
};

DataManager.prototype.uri_parse = function(uri) {

	// Already parsed?
	if (uri instanceof Array) {
		return uri;
	}

	// Split URI into links
	var links = links.split('/');
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
		return node;
	}

	// Parse URI
	var links = this.uri_parse(uri);
	var prop = links.pop();

	// Traverse to find node
	for (var i = 0; i < links.length; i++) {
		var link = links[i];
		node = node[link];

		// Can't traverse
		if (node == null || typeof node !== 'object') {
			return undefined;
		}
	}

	// Return results
	return { node: node, prop: prop, uri: uri };
};

DataManager.prototype.data_wrap = function(uri, data, client, ts) {

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
		data = {}[links[i]] = data;
	}

	// Return wrapped data
	return data;
};

DataManager.prototype.data_update = function(uri, data, client) {

	// Get update time
	var ts = new Date();

	// Wrap data if needed
	var wrap = this.data_wrap(uri, data, client, ts);

	// TODO: RX Data, Expire/Persist MetaData

	// Merge data in
	this.data.merge(wrap);

	// Replace meta data
	this.meta.updated = {
		source:		client.info,
		epoch_ms:	ts.getTime(),
		iso8601:	ts.toISOString(),
		str:		ts.toUTCString()
	};
	this.data.merge({ _bserver_: this.meta });

	// Log the data
	if (this.config.log instanceof String) {
		this.data_log(uri, data, client, ts);
	}

	// Broadcast updated data
	this.servers.forEach(function(serv) {
		serv.broadcast(uri, data, client, ts);
	});

	// All done
	return true;
};

DataManager.prototype.data_log = function(uri, data, client, ts) {

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
	var log_data = JSON.stringify([ts.getTime(), client.info, uri, data]);
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
// TODO: data_prune

DataManager.prototype.server_attach = function(serv) {

	// Ensure this server isn't already linked
	if (this.servers.indexOf(serv) >= 0) {
		console.log('# ERROR: DataManager: Attaching already attached server - ' + JSON.stringify(serv.info));
		return false;
	}

	// Link this server
	this.server.push(serv);

	// Update server info
	serv.dmanager = this;
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

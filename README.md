# wsBroadcast

Broadcast data system. Receives data via TCP and broadcasts data via TCP, HTTP, and WebSockets.

Data is JSON object based with a global namespace. Objects can be made to expire, not-expire, or to be persistent between reboots.

Written in node.js.



## Installation

* Install Node.js as required by your platform.
* Install PHP-CGI as required by your platform (`sudo apt-get install php5-cgi`)
* `git clone http://github.com/aprsworld/wsBroadcast`
* `cd wsBroadcast && npm install`

To execute:

* `node server.js --help` for usage and option information.
* `node server.js --expire 60 --webdir=[Absolute_Path]` and point a web-browser at http://hostname:8888/test.html.
* `node server.js --expire 60 --webdir=[Absolute_Path]  --tcp-client=[server]` to mirror an existing server.


## Command Line Options

* `--expire=[time]` where [time] is in seconds for objects to expire unless persistent.
* `--persist=[file]` where [file] is a json file to load and store persistent data in.
* `--webdir=[Absolute_Path]` where [Absolute_Path] is the path to the root directory to serve via HTTP.
* `--remap=[Relative_WWW_Path]` where [Relative_WWW_Path] is a file in the web directory to serve in place of a 404 when requested from the root path.
* `--log=[DIR]` is the directory to log updates to.
* `--http-server=[PORT]` is the port to run the HTTP Server on.
* `--tcp-recv=[PORT]` is the port to run the HTTP Receiving Server on.
* `--tcp-send=[PORT}` is the port to run the HTTP Sending Server on.
* `--tcp-client=[HOST[:PORT]]` is the server and optional port to connect to in order to mirror an existing server.
* `--tcp-server=[PORT]` is the port to run the mirroring tcp server on.


## Default Ports

* HTTP/WS: 8888
* Input TCP: 1289
* One-Time Output TCP: 1230 _(DO NOT USE)_
* Constant Output TCP: 1337 _(DO NOT USE)_


## Persistence

If --persist=[file] is specified on the command line, it will attempt to load
and save persistent data to that file.  Everytime it gets a persistent update it will attempt to write to the file and continue on happily if it cant.  When the server receives a SIGHUP signal, it will attempt to write the latest changes to that file as well.


## HTTP Interface

Any GET request to '/data/now.(json|dat)[/URI]' will return only the portion of the tree specified in the URI.  A POST request to that will replace that portion with the data specified in JSON via POST.  If in that POST the query parameter persist=true is sent, it will persist that data forever.  Setting any value to null will prune that whole portion of the data.

Examples:

 * `GET /data/now.json/webdisplay/` will return just the webconfig portion of the tree.
 * `POST /data/now.json/webdisplay/configs/delme` with the body being valid JSON data, will update that part of the tree.
 * `POST /data/now.json/webdisplay/config/dontdelme?persist=true` will do the same as the last but persist the changes forever.


## Debugging / dumping data using wscat
If wscat is not on your system, install with:
* `npm install -g wscat`
_(The `-g` flag will do a global install and hopefully make it so wscat can be run from the command line.)_

Dump data with:
* `wscat -c http://hostname:8888/.data/` to receive continuous updates of the data in JSON format.



## Using nc
* `echo [JSON] | nc hostname 1229` to update the data with JSON.
* `cat data.json | nc hostname 1229` to update the data with the JSON file. *(The file MUST be terminated with the terminator character and most only contain one terminator character.  Currently: '\n'.)*
* `nc hostname 1230` to receive the latest data in JSON format. _(DO NOT USE)_
* `nc hostname 1337` to receive continuous updates of the data in JSON format. _(DO NOT USE)_



## Data Manager

This is the main object in this project.  It basically just stores data that is to be broadcast and handles the broadcasting of this data to the servers which can be attached to it.



## Servers

It currently has 3 server types; HTTP, Websockets (under the HTTP Server), and TCP.  The base server type from which these are derived handles logging and other glue components.  Each server takes in a configuration object which can be used to customize the instances of that server such as port and so on.  If any empty object is passed in all defaults will be used.

At this time the data is always input and output as a JSON object.  In the future this could be extended to allow other formats as well.  The HTTP Server has the capability to do content negotiation and I believe WebSockets does as well, but the TCP Server would have to include a handshake in order to achieve this.


### HTTP Server

The HTTP Server currently just serves static file content and the dynamic data (under '/.data/') as a fallback for AJAX HTTP Polling and for other uses.  It also allows updates via HTTP POSTS as well.

The data is served in JSON with a mime-type of 'application/json', though in the future may do some content negotation.  If there is a trailing '.txt' in the URI, the server will send a mime-type of 'text/plain' for compatibility with IE.

Currently the HTTP server defaults to running on port 8888.


### WebSockets Server (Under the HTTP Server)

_(DOCUMENTATION FOR PROTOCOL COMMING SOON)_

For diagnostic and debugging the 'wscat' module is recommended.  (`npm install -g wscat`)


### TCP Server

The TCP Server allows updating the dynamic data via standard JSON messages.  The protocol is a very simple input only terminated (The '\n' or 0x0A ASCII character) message passing system with each message being a JSON object with absolutely no handshake.  It may be extended in the future.

Currently three TCP Servers are run, one on port 1229 which is for input, one on port 1230 for a single output of the current data, and one on port 1337 for continuous updates of the data.

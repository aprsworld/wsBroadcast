# wsBroadcast

Broadcast data system. Receives data via TCP and broadcasts data via TCP, HTTP, and WebSockets.

Data is JSON object based with a global namespace. Objects can be made to expire, not-expire, or to be persistent between reboots.

Written in node.js.


## Installation

* Install Node.js as required by your platform.
* `npm install finalhandler http node-getopt serve-index serve-static url websocket`
* `git clone  http://github.com/aprsworld/wsBroadcast`


To execute:

* `node ws-broadcast.js --help` for usage and option information.
* `node ws-broadcast.js -x 60 --webdir WebClient` and point a web-browser at http://hostname:8888/test.html.
* `node ws-broadcast.js -x 60 --webdir WebClient  --tcp-client [server]` to mirror an existing server.

## Debugging / dumping data using wscat
If wscat is not on your system, install with:
* `npm install -g wscat`
The `-g` flag will do a global install and hopefully make it so wscat can be run from the commend line.

Dump data with:
* `wscat -c http://hostname:8888/.data/` to receive continuous updates of the data in JSON format.

## Using nc
* `cat data.json | nc hostname 1230` or `echo [JSON] | nc hostname 1230` to update the data with JSON. *(The file MUST be terminated with the terminator character and most only contain one terminator character.  Currently: '\n'.)*
* `nc hostname 1231` to receive the latest data in JSON format. _(DO NOT USE)_
* `nc hostname 1337` to receive continuous updates of the data in JSON format. _(DO NOT USE)_



## Data Manager

This is the main object in this project despite being the simplest.  It basically just stores data that is to be broadcast and handles the broadcasting of this data to the servers which can be attached to it.

## Servers

_THIS DOCUMENTATION IS OUT OF DATE_

It currently has 3 server types; HTTP, WebSockets, and TCP.  The base server type from which these are derived handles logging and other glue components.  Each server takes in a configuration object which can be used to customize the instances of that server such as port and so on.  If any empty object is passed in all defaults will be used.

At this time the data is always input and output as a JSON object.  In the future this could be extended to allow other formats as well.  The HTTP Server has the capability to do content negotiation and I believe WebSockets does as well, but the TCP Server would have to include a handshake in order to achieve this.

### HTTP Server

The HTTP Server currently just serves static file content and the dynamic data (under '/.data/') as a fallback for AJAX HTTP Polling and for other uses.  It also allows updates via HTTP POSTS as well.

The data is served in JSON with a mime-type of 'application/json', though in the future may do some content negotation.  If there is a trailing '.txt.' in the URI, the server will send a mime-type of 'text/plain' for compatibility with IE.

Currently the HTTP server defaults to running on port 8888.

### WebSockets Server

The WebSockets Server currently uses a simple protocol to subscribe and unsubscribe from receiving updates from parts of the data tree.

_(DOCUMENTATION FOR PROTOCOL COMMING SOON)_

For diagnostic and debugging the 'wscat' module is recommended.  (`npm install -g wscat`)

Currently the WebSocket server defaults to running on port 1228.

### TCP Server

The TCP Server allows updating the dynamic data via standard JSON messages.  The protocol is a very simple input only terminated (The '\n' or 0x0A ASCII character) message passing system with each message being a JSON object with absolutely no handshake.  It may be extended in the future.

Currently two TCP Servers are run, one on port 1230 which is for input, and one on port 1231 for a single output of the current data.

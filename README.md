# wsBroadcast

Node.js Broadcast System with HTTP, WebSockets, and TCP Servers.  Currently in heavy development.  At this time the code base contains some "style" issues and lacks good comments, but before initial release all of that will be cleaned up.

The initial release should also be standards compliant except where commented where a deviation was made for compatiblity reasons.

## Data Manager

_THIS DOCUMENTATION IS OUT OF DATE_

This is the main object in this project despite being the simplest.  It basically just stores data that is to be broadcast and handles the broadcasting of this data to the servers which can be attached to it.

## Servers

_THIS DOCUMENTATION IS OUT OF DATE_

It currently has 3 server types; HTTP, WebSockets, and TCP.  The base server type from which these are derived handles logging and other glue components.  Each server takes in a configuration object which can be used to customize the instances of that server such as port and so on.  If any empty object is passed in all defaults will be used.

At this time the data is always input and output as a JSON object.  In the future this could be extended to allow other formats as well.  The HTTP Server has the capability to do content negotiation and I believe WebSockets does as well, but the TCP Server would have to include a handshake in order to achieve this.

### HTTP Server

_THIS DOCUMENTATION IS OUT OF DATE_

The HTTP Server currently just serves static file content and the dynamic data (under '/.data') as a fallback for AJAX HTTP Polling and for other uses.  It is possible it may be extended to allow updates via HTTP as well.

'/.data' serves the JSON data with a mime-type of 'application/json', though in the future may do some content negotation.

'/.data.json' serves the JSON data with a mime-type of 'application/json'.

'/.data.dat' serves the JSON data, but with a mime-type of 'text/plain' for compatibility with IE.

The HTTP Server requires the 'serve-static', 'serve-index', and 'finalhandler' npm modules.

Currently the HTTP server defaults to running on port 8888.

### WebSockets Server

_THIS DOCUMENTATION IS OUT OF DATE_

The WebSockets Server currently broadcasts the dynamic data to all connected clients.  In the future it may support updating the data as well.

The WebSockets Server requires the 'ws' npm module.  (`npm install ws`)
For diagnostic and debugging the 'wscat' module is recommended.  (`npm install -g wscat`)

Currently the WebSocket server defaults to running on port 1228.

### TCP Server

_THIS DOCUMENTATION IS OUT OF DATE_

The TCP Server allows updating the dynamic data via standard JSON messages.  The protocol is a very simple input only terminated (At this time it is terminated with a '\n', 0x0A character though in the future may use the traditional null, '\0', 0x00 terminator) message passing system with each message being a JSON object with absolutely no handshake.  It may be extended in the future.

Currently two TCP Servers are run, one on port 1229 which is for input, and one on port 1230 for a single output of the current data.

## Quick and Dirty Install

* Install Node.js
* `git clone --recursive http://github.com/aprsworld/wsBroadcast`
* `npm install node-getopt` _(LIKELY BE REPLACED)_
* `npm install websocket`
* `npm install serve-static`
* `npm install serve-index`
* `npm install finalhandler`
* `npm install -g wscat` _(OPTIONAL FOR DEBUGGING)_

To execute:

* `node ws-broadcast.js --help` for usage and option information.
* `node ws-broadcast.js -x 60 --webdir WebClient` and point a web-browser at http://hostname:8888/test.html.
* `node ws-broadcast.js -x 60 --webdir WebClient  --tcp-client [server]` to mirror an existing server.

## Using wscat
* `wscat -c http://hostname:8888/.data/` to receive continuous updates of the data in JSON format.

## Using nc
* `cat data.json | nc hostname 1230` or `echo [JSON] | nc hostname 1230` to update the data with JSON. *(The file MUST be terminated with the terminator character and most only contain one terminator character.  Currently: '\n'.)*
* `nc hostname 1231` to receive the latest data in JSON format. _(DO NOT USE)_
* `nc hostname 1337` to receive continuous updates of the data in JSON format. _(DO NOT USE)_

---
Copyright (C) APRS World, LLC. 2015  
ALL RIGHTS RESERVED!  
david@aprsworld.com

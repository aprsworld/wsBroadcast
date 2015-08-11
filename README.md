# wsBroadcast

Node.js WebSockets Broadcast System.  Currently in heavy refactoring and development.  At this time the code base contains many "style" issues and lacks adequate comments, but before initial release all of that will be cleaned up.

Before the initial release it will be possible to pass in configuration parameters to the data manager and servers in order to customize the system.  The initial release should also be standards compliant except where commented where a deviation was made for compatiblity reasons and will be as compatible on the client side as humanly possible.

## Data Manager

This is the main object in this project despite being the simplest.  It basically just stores data that is to be broadcast and handles the broadcasting of this data to the servers which can be attached to it.

## Servers

It currently has 3 server types; HTTP, WebSockets, and TCP.  The base server type from which these are derived handles logging and other glue components.  Each server takes in a configuration object which can be used to customize the instances of that server such as port and so on.  If any empty object is passed in all defaults will be used.

At this time the data is always input and output as a JSON object.  In the future this could be extended to allow other formats as well.  The HTTP Server has the capability to do content negotiation and I believe WebSockets does as well, but the TCP Server would have to include a handshake in order to achieve this.

### HTTP Server

The HTTP Server currently just serves static file content and the dynamic data (under '/.data') as a fallback for AJAX HTTP Polling and for other uses.  It is possible it may be extended to allow updates via HTTP as well.

'/.data' serves the JSON data with a mime-type of 'application/json', though in the future may do some content negotation.

'/.data.json' serves the JSON data with a mime-type of 'application/json'.

'/.data.dat' serves the JSON data, but with a mime-type of 'text/plain' for compatibility with IE.

The HTTP Server requires the 'serve-static', 'serve-index', and 'finalhandler' npm modules.

Currently the HTTP server defaults to running on port 8888.

### WebSockets Server

The WebSockets Server currently broadcasts the dynamic data to all connected clients.  In the future it may support updating the data as well.

The WebSockets Server requires the 'ws' npm module.  (`npm install --save ws`)
For diagnostic and debugging the 'wscat' module is recommended.  (`npm install -g wscat`)

Currently the WebSocket server defaults to running on port 1228.

### TCP Server

The TCP Server allows updating the dynamic data via standard JSON messages.  The protocol is a very simple input only terminated (At this time it is terminated with a '\n', 0x0A character though in the future may use the traditional null, '\0', 0x00 terminator) message passing system with each message being a JSON object with absolutely no handshake.  It may be extended in the future.

Currently two TCP Servers are run, one on port 1229 which is for input, and one on port 1230 for a single output of the current data.

## WWW Static Content

The 'www/' directory currently contains some static html files for demonstration and diagnostic purposes.  'test.html' is the currently the only real file and makes use of http://github.com/gimite/web-socket-js which I've copied the resource files into 'www/res/web-socket-js/' for fallback websocket compatibility.  It also relies on JQuery and web-socket-js requires swfobject; both of which are located in the 'res/' directory.

### test.html

test.html is a simple JavaScript web client that will display the data spit out from the system into a table that is dynamically generated using JQuery.  It will attempt to use native WebSockets, then fall back to a Flash solution if that fails via the 'web-socket-js' library, and finally will fallback to HTTP Polling via AJAX if that's not possible either.

## Quick and Dirty Install

* Install Node.js
* `npm install --save ws`
* `npm install serve-static`
* `npm install serve-index`
* `npm install finalhandler`
* `npm install -g wscat` _(OPTIONAL FOR DEBUGGING)_
* `git clone http://github.com/aprsworld/wsBroadcast`

To execute:

`node ws-broadcast.js` and point a web-browser at http://hostname:8888/test.html.

## Using wscat
`wscat -c http://hostname:1228` to receive continuous updates of the data in JSON format.

## Using nc
`nc hostname 1230` to receive the latest data in JSON format.
`cat data.json | nc hostname 1229` to update the data with JSON.

Copyright (C) APRS World, LLC. 2015
ALL RIGHTS RESERVED!
david@aprsworld.com

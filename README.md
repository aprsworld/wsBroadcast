# wsBroadcast

Node.js WebSockets Broadcast System.  Currently in heavy refactoring and development. 

## Servers

It currently has 3 server types; HTTP, WebSockets, and TCP.

### HTTP Server

The HTTP Server currently just serves static file content, but in the future will serve the dynamic data as a fallback.  It is possible it may be extended to allow updates via HTTP as well.

The HTTP Server requires the 'serve-static' and 'finalhandler' npm modules.

### WebSockets Server

The WebSockets Server currently broadcasts the dynamic data to all connected clients encoded in standard JSON.  In the future it may support other formats and updating the data as well.

The WebSockets Server requires the 'ws' npm module.  (`npm install --save ws`)
For diagnostic and debugging the 'wscat' module is recommended.  (`npm install -g wscat`)

### TCP Server

The TCP Server currently is a dummy, but will allow updating the data via JSON messages.  The protocol is a very simple input only null terminated ('\0', 0x00) message passing system.  It may be extended in the future.

## WWW Static Content

The www directory currently contains some static html files for demonstration and diagnostic purposes.  'test.html' is the currently the only real file and makes use of http://github.com/gimite/web-socket-js which I've copied the resource files into 'www/res/web-socket-js' for fallback websocket compatibility.  Eventually it will support a fallback of HTTP polling for updating if that fails as well.

## Quick and Dirty Install

* Install Node.js
* `npm install --save ws`
* `npm install serve-static`
* `npm install serve-index`
* `npm install finalhandler`
* `npm install -g wscat` _(OPTIONAL FOR DEBUGGING)_
* `git clone http://github.com/aprsworld/wsBroadcast`

To execute:

`node ws-broadcast.js` and point a web-browser at http://localhost:8888/.

## Using wscat
`wscat -c http://hostname:1228`

Copyright (C) APRS World, LLC. 2015
ALL RIGHTS RESERVED!
david@aprsworld.com

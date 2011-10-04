underground = {};
underground.transport = (function() {
	var _isInit = false,
		_clientId = null,
		_worker = null,
		_port = null,
		_subscribers = {},
		_callbacks = {};

	/**
	 * Client: Creates the client that spawns the shared workers
	 */
	function _init() {
		_clientId = new Date().getTime();
		_worker = new SharedWorker('/script/lib/underground.js');
		_port = _worker.port;
		_port.onmessage = function(evt) { _handleMessage(evt.data); };
		_port.postMessage({cmd: 'connect', data: _clientId});
		window.addEventListener('pagehide', function() {
			_port.postMessage({cmd: 'disconnect', data: _clientId});
		}, false);
		_isInit = true;
	}

	function _handleMessage(msg) {
		if (msg.cmd) {
			switch(msg.cmd) {
				case 'log': console.log(msg.data); break;
				case 'numClients':
					var callback = _callbacks[msg.cmd];
					if (!callback) { return; }
					callback(msg.data);
					delete _callbacks[msg.cmd];
					break;
			}
		} else if (msg.id) {
			var subscribers = _subscribers[msg.id];
			if (!subscribers) { return; }
			subscribers.forEach(function(subscriber) {
				subscriber.apply(null, msg.data);
			});
		}
	}

	return {

		publish: function(id) {
			if (!_isInit) { _init(); }
			_port.postMessage({
				id: id,
				data: [].splice.call(arguments, 1),
				clientId: _clientId
			});
		},

		broadcast: function(id) {
			if (!_isInit) { _init(); }
			_port.postMessage({
				id: id,
				data: [].splice.call(arguments, 1),
				clientId: _clientId,
				excludeSelf: true
			});
		},

		subscribe: function(id, handler) {
			if (!_isInit) { _init(); }
			if (!_subscribers[id]) { _subscribers[id] = []; }
			_subscribers[id].push(handler);
		},

		unsubscribe: function(id, handler) {
			if (!_subscribers[id]) { return; }
			if (!handler) {
				delete _subscribers[id];
				return;
			}
			_subscribers[id] = _subscribers[id].filter(function(subscriber) {
				return (subscriber == handler);
			});
		},

		getNumClients: function(callback) {
			_callbacks['numClients'] = callback;
			_port.postMessage({cmd: 'numClients'});
		}

	}
})();

underground.worker = (function() {
	var _ports = {},
		_numPorts = 0;

	/**
	 * Processes the messages sent by the client to the worker
	 */
	function _handleMessage(port, msg) {
		if (msg.cmd) {
			// _log('Command (' + msg.cmd + ')');
			switch (msg.cmd) {
				case 'connect': _connect(port, msg.data); break;
				case 'disconnect': _disconnect(port, msg.data); break;
				case 'numClients': _numClients(port); break;
			}
		} else if (msg.id) {
			_publish(msg);
		}
	}

	/**
	 * Publishes a message to all the worker's clients
	 */
	function _publish(data) {
		_log('Publish (' + data.id + ') to ' + _numPorts + ' subscribers');
		for (var id in _ports) {
			if (data.excludeSelf && id == data.clientId) { continue; }
			_ports[id].postMessage(data);
		}
	}

	/**
	 * Logs a message to all of the worker's clients
	 */
	function _log(msg) {
		for (var id in _ports) {
			_ports[id].postMessage({
				cmd: 'log',
				data: msg
			});
		}
	}

	/**
	 * Reports the number of clients to the worker's client
	 */
	function _numClients(port) {
		port.postMessage({
			cmd: 'numClients',
			data: _numPorts
		});
	}

	/**
	 * Registers a client to the worker
	 */
	function _connect(port, clientId) {
		_ports[clientId] = port;
		_numPorts++;
	}

	/**
	 * Disconnects a client from the worker's managed list of client
	 */	
	function _disconnect(port, clientId) {
		delete _ports[clientId];
		_numPorts--;
	}
	
	return {

		connect: function(port) {
			port.onmessage = function(evt) { _handleMessage(port, evt.data); };
			port.onerror = function(evt) { _log('Error ()'); };
		}

	}
})();

onconnect = function(e) { underground.worker.connect(e.ports[0]); }

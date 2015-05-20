vmscript.watch('Config/network.json');
vmscript.watch('Config/login.json');
vmscript.watch('Config/world.json');

vms('World Server', [
	'Config/network.json',
	'Config/world.json'
], function(){
	net = require('net');
	CachedBuffer = require('./Modules/CachedBuffer.js');
	PacketCollection = require('./Modules/PacketCollection.js');
	restruct = require('./Modules/restruct');
	Database = require('./Modules/db.js');
	util = require('./Modules/util.js');
	packets = require('./Helper/packets.js');

	global.api.sendSocketToTransferQueue = function(obj){
		var key = util.toHexString(obj.hash);
		console.log("[World] Adding character transfer:", key);

		World.characterTransfer[key] = obj;
		process.api.call('Login', 'sendSocketAfterTransferQueue', [obj.hash]);
	};

	process.api.invalidateAPI(process.pid);

	function WorldInstance(){
		/*
			Array of current connected clients.
		*/
		this.clients = [];
		this.nextID = 0;

		/*
			Boolean indicating that the server is running
			and listening for incoming connections.
		*/
		this.listening = false;

		/*
			Used Later to see if config has to offer a new port to listen to.
			If is different than currently listening, re-listen the tcp server,
			to listen for the new port.
		*/
		this.listeningPort = null;

		/*
			A boolean variable to decide if we want to accept incoming connections.
		*/
		this.acceptConnections = false;

		/*
			A object of packet collection for this current instance.
		*/
		this.packetCollection = null;

		var self = this;
		/*
			A TCP server instance.
		*/
		this.instance = net.createServer(function (socket) { self.onConnection(socket); });
		this.recv = {};
		this.send = {};

		this.databaseConnected = false;

		this.characterTransfer = {};
	}

	WorldInstance.prototype.onConnection = function(socket){
		if(!this.acceptConnections) return;

		var self = this;
		socket.clientID = this.nextID;
		this.nextID++;
		socket.authenticated = false;

		this.clients.push(socket);
		CachedBuffer.call(socket, this.packetCollection);

		console.log("[World] new Connection #" + socket.clientID);

		try {
			this.onConnected(socket);
		} catch (e) {
			console.log(e);
		}

		socket.on('end', function() {
			return self.onDisconnect(socket);
		});

		// Need to find out which functions to use and make this tidyer....
		// Need to check for memory leaks and make sure we actually delete the un needed socket.
		// Need to make sure using splice won't be slower than deleting the index.
		// Should maybe look at using room or list rather than array of socket object.
		socket.on('close', function() {
			return self.onDisconnect(socket);
		});

		socket.on('disconnect', function() {
			return self.onDisconnect(socket);
		});

		socket.on('error', function(err) {
			return self.onError(err, socket);
		});
	};

	WorldInstance.prototype.onDisconnect = function(socket){
		console.log("[World] connection closed #" + socket.clientID);
		this.clients.splice(this.clients.indexOf(socket), 1);
		socket.destroy();
	};

	WorldInstance.prototype.onError = function(err, socket){
		console.log(err);
		this.clients.splice(this.clients.indexOf(socket), 1);
		socket.destroy();
	};

	WorldInstance.prototype.init = function(){
		if(this.listening) return;

		var self = this;
		this.instance.listen(config.network.ports.world, function(){
			self.listening = true;
			self.listeningPort = config.network.ports.world;
			console.log("World Server Instance listening on:", self.listeningPort);
		});

		this.packetCollection = new PacketCollection('WorldPC');

		Database(config.world.database.connection_string, function(){
			console.log("Database connected @", config.world.database.connection_string);
			vmscript.watch('Database');
			vmscript.watch('Generic');
			vmscript.on([
				'Database',
				'Generic'
			], function(){
				vmscript.watch('./Processes/World/Packets').on([
						'Packets'
					], function(){
						self.acceptConnections = true;
						process.api.run();
				});
			});
		});
	}

	if(typeof World === 'undefined')
		global.World = new WorldInstance();
	else
		global.World.__proto__ = WorldInstance.prototype;

	global.World.init();
});
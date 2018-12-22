const WebSocketServer = require('websocket').server;
const websocketPort = 3333;
//const mysql = require('mysql');
//const mysql_creds = require('./mysqlcreds.js');
//const db = mysql.createConnection( mysql_creds );
const http = require('http');
 
const server = http.createServer(function(request, response) {
    console.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(404);
    response.end();
});

server.listen(websocketPort, function() {
    console.log((new Date()) + ' Server is listening on port 3333');
});
 
const wsServer = new WebSocketServer({
    httpServer: server,
    //autoAcceptConnections: true
});


 
function originIsAllowed(origin) {
  return true;
}

function joinRoom(connection, room){
	if(room){
		room.listeners.push(connection);
		const currentChatCon = chatConnections.get(connection);
		currentChatCon.room = room;
		sendMessageToRoom(currentChatCon.name + ' has joined the room', connection);
		const participantList = currentChatCon.room.listeners.map( conn => chatConnections.get(conn).name)
		sendActionToRoom('participantJoin', {
			participantList: participantList, 
			name: currentChatCon.name, 
			joined: Date.now}, 
			currentChatCon.room
		);	
	
		sendActionToPerson('roomjoin', connection, { 
			message: `you have joined the ${currentChatCon.room.name}`,
			roomName: currentChatCon.room.name,
			participants: participantList,
			messages: currentChatCon.room.messages,
			availableRooms: getAvailableRooms()
		});
	} else {
		console.log('could not find room ' + roomID)
	}
}
function leaveRoom(connection, room, leavingServer=false){
	console.log('removing user from room');
	console.log('room id ', room.name);
	if(room){
		const listenerIndex = room.listeners.indexOf(connection);
		room.listeners.splice(listenerIndex, 1);
		const currentChatCon = chatConnections.get(connection);
		const leftRoomName = currentChatCon.room.name
		const participantList = currentChatCon.room.listeners.map( conn => chatConnections.get(conn).name)
		//sendActionToRoom(action, data, roomID, sender=systemTitle)
		sendMessageToRoom(currentChatCon.name + ' has left the ' + (leavingServer ? 'server' : 'room'), connection, undefined,false);
		sendActionToRoom('participantLeave', {
			name: currentChatCon.name, 
			reason: 'left',
			participantList: participantList
		}, currentChatCon.room);	
		if(!leavingServer){
			sendActionToPerson('roomleave', connection, { 
				message: `you have left the ${leftRoomName}`,
			});
		}
		currentChatCon.room = null;
	}	
}
function sendMessage(connection, data){
	console.log(data);
	const roomOccupants = getRoomOccupants(connection); 
	sendMessageToRoom(data.message.content, connection, data.message.sender, false);	

}
function getRoomForConnection( connection ){
	return chatConnections.get(connection).room;
}
function getRoomOccupants( connectionOrRoomID ){
	let currentRoom, currentConData;
	if(typeof connectionOrRoomID === 'string'){
		currentRoom = rooms[connectionOrRoomID];
	} else {
		currentRoom = connectionOrRoomID	
	}
	return currentRoom.listeners;
}
function removeConnections(connection){
	const receiverCon = chatConnections.get(connection);
	if(!receiverCon){ //they may not have joined anything yet
		return
	}
	if(receiverCon.room){  //they may not have joined a room yet
		const roomID = receiverCon.room;
		console.log('removing user from server');
		leaveRoom(connection, roomID, true);
	}
	chatConnections.delete(connection);
	console.log('current connections: '+chatConnections.size);
}
function getAvailableRooms(showOnlyPublic = true){
	//name: 'lobby', listeners: [], public: true, owner: systemTitle
	let roomList = Object.values(rooms);
	roomList = roomList
	.map( roomData => 
			{
				return {
					ID: roomData.id,
					name: roomData.name, 
					owner: roomData.owner, 
					occupantCount: roomData.listeners.length,
					public: roomData.public
				}
			}
		)
	if(showOnlyPublic){
		roomList = roomList.filter( room => room.public );
	}

	return roomList;
}
function addConnection(connection, data){
	console.log('addding connection with data: ', data.message)
	chatConnections.set(connection, {
		conn: connection,
		name: data.message.username, 
		room: null
	});
	sendActionToPerson('join', connection, {message: 'you have joined the server'});
}
function sendActionToPerson(action, recipientConnection, extraData={}){
	recipientConnection.send( createPacket(action, systemTitle, extraData))	
}
const systemTitle = "SYSTEM";
function sendMessageToPerson(message, destinationConnection, sourceConnection=null){
	const receiverCon = chatConnections.get(destinationConnection);
	let senderName = '';
	if(sourceConnection!==null){
		let senderCon = chatConnections.get(sourceConnection);
		senderName = senderCon.name
	}
	receiverCon.send(createPacket('message', senderName, message));
}
function sendActionToRoom(action, data, room, sender=systemTitle){
	const occupants = getRoomOccupants(room);
	occupants.forEach( listener => listener.send(createPacket(action,sender, data)))
}
function sendMessageToRoom(message, connection, sender=systemTitle, excludeSender=true){
	console.log('sending message to entire room : ' + message);
	const currentChatCon = chatConnections.get(connection);
	let currentRoom = currentChatCon.room;
	const participants = currentRoom.listeners.slice();
	if(excludeSender){
		participants.splice( participants.indexOf(connection),1);
	}
	//there will be a problem that we will only send messages to some people some time, but then it will be in the history so everyone will see it upon connection
	currentRoom.messages.push({sender, content: message});
	participants.forEach( listener => listener.send(createPacket('message',sender, message)))
}
function createPacket(type, sender, data){
	return JSON.stringify({ action: type, sender, content: data});
}

const rooms = {
	lobby: { 
		id: 'lobby',
		name: 'lobby', listeners: [], public: true, owner: systemTitle, 
		messages: [
			{sender: 'SERVER', content:'play nice!'},
			{sender: 'SERVER', content:'this means you!'}
		]
	},
	testRoom: {
		id: 'testRoom',
		name: 'test room', listeners: [], public: true, owner: 'test', 
		messages: [
			{sender: 'SERVER', content:'test message!'},
		] 
	}
}
const chatConnections = new Map();

wsServer.on('request', function(request) {
	console.log('test');
    // if (!originIsAllowed(request.origin)) {
    //   // Make sure we only accept requests from an allowed origin
    //   request.reject();
    //   console.log((new Date()) + ' Connection from origin ' + request.origin + ' rejected.');
    //   return;
    // }
    const connection = request.accept(null, request.origin);
    console.log((new Date()) + ' Connection accepted.');
    connection.on('message', function(message) {
	    console.log('Received Message: ' + message.utf8Data);
	    //connection.sendUTF(message.utf8Data);
	    const data = JSON.parse(message.utf8Data)
	    switch(data.action){
	    	case 'createaccount':
	    		console.log('create account');
	    		break;
	    	case 'join':
	    		console.log('account login');
	    		addConnection(connection, data);
	    		joinRoom(connection, rooms.lobby)
	    		break;
	    	case 'createroom':
	    		console.log('create room');
	    		break;
	    	case 'joinroom':
	    	//leaveRoom(connection, room, leavingServer=false){
	    		if(data.message.roomID === chatConnections.get(connection).room.id){
	    			console.log('already in that room, not switching');
	    			return false;
	    		}
	    		leaveRoom(connection, getRoomForConnection( connection ));
	    		console.log("join room data: ", data);
	    		joinRoom(connection, rooms[data.message.roomID]);
	    		break;
	    	case 'message':
	    		console.log('send message');
	    		sendMessage(connection, data);
	    		break;
	    }
    });
    connection.on('close', function(reasonCode, description) {
    	removeConnections(connection);
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    });
});


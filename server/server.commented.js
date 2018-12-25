//load the websocket module
const WebSocketServer = require('websocket').server;
//arbitrary port used for our websocket connection
const websocketPort = 3333;
//this will be the name of the user who owns system rooms and messages.
const systemTitle = "SYSTEM";
//websocket requires this to make its connection
const http = require('http');

//this will both be the variable that stores our room data as well as set up default rooms
const rooms = {
	lobby: { 
		//what id will we use for the room in the system
		id: 'lobby',
		//what the name of the room will be to humans
		name: 'lobby', 
		//the list of people in the room
		listeners: [], 
		//whether the room is public or not.  not used yet
		public: true, 
		//who made the room.  IE who can make changes/run it.  not really used yet
		owner: systemTitle,
		//a list of messages sent in the room.  As people send messages, this will get 
		//more data.  also serves as a default message for the room when it is created 
		messages: [
			{sender: 'SERVER', content:'play nice!'},
			{sender: 'SERVER', content:'this means you!'}
		]
	},
	//another test room
	random: {
		id: 'random',
		name: 'random', listeners: [], public: true, owner: systemTitle, 
		messages: [
			{sender: 'SERVER', content:'feel free to talk about anything here!'},
		] 
	}
}
//this will serve as a list of connected users.  we use a map object because it can
//have other objects as keys.  We will use the chatobject as the key in question.
//it will hold other data like the name of the user, their current room, etc
const chatConnections = new Map();
 
 //I believe this redirects all non-websocket requests to a 404 page.
 //ideally, after it is functional, epress or http would serve as the web server
 //for the react files as well, but for right now, it's basically react's node server
const server = http.createServer(function(request, response) {
    console.log((new Date()) + ' Received request for ' + request.url);
    response.writeHead(404);
    response.end();
});
//listen for connections on our websocket port
server.listen(websocketPort, function() {
    console.log((new Date()) + ' Server is listening on port 3333');
});
 //connect our websocket to our http server
const wsServer = new WebSocketServer({
    httpServer: server,
    //autoAcceptConnections: true
});


//code from the original example.  technically you should be more discerning as to who
//you allow to connect
function originIsAllowed(origin) {
  return true;
}

/*adds a user to the room
	input: 
		connection (websocket), the connection of the user adding to the room
		room: (object) the room that they are joining
	returns: undefined
	tasks: 
		check if the desired room exists
		add the user to the list of listeners for future messages
		change the user's current room to this room
		notify the entire room that they joined (as a message)
		notify the entire room that they joined( as an action, so their list of users update)
		notify the user that they joined the room
*/
function joinRoom(connection, room){
	if(room){
		room.listeners.push(connection);
		const currentChatCon = getUserDataForConnection(connection);
		currentChatCon.room = room;
		sendMessageToRoom(currentChatCon.name + ' has joined the room', connection);
		const participantList = currentChatCon.room.listeners.map( conn => getUserDataForConnection(conn).name)
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
/*makes a new room
	input: 
		connection (websocket), the connection of the user creating the room
		roomName: (string) the human readable name of the desired room
		isPublic: (boolean) whether the room should be public or private.  not used yet
		autoJoinRoom: (optional)(boolean)(default: true) whether or not to
		make the user join the room they just created
	returns: room(object) the room created, or false on failure
	tasks: 
		make a data safe name to be the ID
		create a new room and add it to rooms object
		forces user to join the room, if required
*/
function createRoom( connection, roomName, isPublic, autoJoinRoom=true){
	//convert the name they gave us to something that is simpler, for use as an ID
	const safeID = roomName.replace(/[^A-Za-z0-9]/g,'');
	//kinda goofy.  I'm getting the user data for the connection we currently have
	//future note, might be nice to pass that user in in the first place and it would have it's connecction data
	const roomCreator = getUserDataForConnection( connection );
	console.log('room creation: ');
	//create a new room and store it in our room creation object
	rooms[safeID] = {
		id: safeID,
		name: roomName, listeners: [], public: isPublic, owner: roomCreator.name, 
		messages: [
			{sender: 'SERVER', content:`Welcome to the ${roomName} room, created by ${roomCreator.name}`},
		] 
	}
	//if this room was created, it would have the ID now
	if(rooms.hasOwnProperty(safeID)){
		//if we wanted to make the person join the room they made, do it
		if(autoJoinRoom){
			//use our premade function to make this person join this room
			joinRoom(connection, rooms[safeID]);
		}	
		//we want the room data after this, so return it
		return rooms[safeID];	
	}

	return false;
}
/*leaves a room
	input: 
		connection (websocket), the connection of the user leaving the room
		room: (object) the room data of the room we are leaving
		leavingServer: (boolean) wether or not the user is leaving the server rather than just this room
			right now it only really omits telling the user if they aren't here any more
	returns: undefined
	tasks: 
		checks if room exists
		removes the user from the room's listener list
		sets the user's room back to null
		notifies everyone in the room that they left the room/server
		tells all clients to remove that user from their room list
		if the user is still there, notify them that they left the room
*/
function leaveRoom(connection, room, leavingServer=false){
	console.log('removing user from room');
	console.log('room id ', room.name);
	//check if room still exists, can't leave something that doesn't exist
	if(room){
		//find where the user is in the room listener list.  This has a race condition potential doing it this way
		const listenerIndex = room.listeners.indexOf(connection);
		//remove the user from the room
		room.listeners.splice(listenerIndex, 1);
		//get the connection data for this user
		const currentChatCon = getUserDataForConnection(connection);
		//find out the name of the room (technically the room they were in, which is kinda wonky to do.  lesson learned)
		const leftRoomName = currentChatCon.room.name
		//get all the people in the room that are still in the room, to notify users of remaining people.  Don't I have a function for this?
		const participantList = currentChatCon.room.listeners.map( conn => getUserDataForConnection(conn).name)
		//sendActionToRoom(action, data, roomID, sender=systemTitle)
		//notify everyone in the room that the person left either the room or the server
		sendMessageToRoom(currentChatCon.name + ' has left the ' + (leavingServer ? 'server' : 'room'), connection, undefined,false);
		//notify the clients so they update their user list
		sendActionToRoom('participantLeave', {
			name: currentChatCon.name, //the person's name
			reason: 'left', //hard coded for now.  maybe we will add kicking
			participantList: participantList //who is in the room now
		}, currentChatCon.room);	
		//check if they are still here, and if so, notify them that they left the room
		if(!leavingServer){ 
			sendActionToPerson('roomleave', connection, { 
				message: `you have left the ${leftRoomName}`,
			});
		}
		//blank out their current room.  maybe I should add this inside the if above?
		currentChatCon.room = null;
	}	
}
/*sends a message to everyone in the same room as a connection
	input: 
		connection: (websocket): the current user's connection,
		data: the data to send to everyone in the WS's current room
	returns: undefined
	tasks: 
		basically a wrapper at this point to send message to room...
		eventually will add the ability to target a specific user for private messages, maybe
*/
function sendMessage(connection, data){
	console.log(data);
	//get all the people int he room... which I then don't use?  I must have changed something
	const roomOccupants = getRoomOccupants(connection); 
	//send a message to everyone in the room
	sendMessageToRoom(data.message.content, connection, data.message.sender, false);	

}
/*get the current room for the connection
	input: 
		connection: (websocket): the current user's connection,
	returns: (object) chat room connection
*/
function getRoomForConnection( connection ){
	return getUserDataForConnection(connection).room;
}
/*get an array of all participant objects that are in the currently given connection 
	input: 
		connection: (websocket): the current user's connection,
	returns: array of room occupant objects
	tasks: 
		used to take the connection regardless of being a name or an object, but now basically only takes objects
		then returns all listeners
*/
function getRoomOccupants( connectionOrRoomID ){
	let currentRoom, currentConData;
	if(typeof connectionOrRoomID === 'string'){
		currentRoom = rooms[connectionOrRoomID];
	} else {
		currentRoom = connectionOrRoomID	
	}
	return currentRoom.listeners;
}
/*get all people connected to the server, regardless of which room they are in
	input: 
		none
	returns: array of all user connection objects
	tasks: 
		since all connections are stored in a map, and a map is iterable
		I use "for of" to iterate through, throw each person into an array, and return it
*/
function getServerOccupants(){
	const allUsers = [];
	//for of because a map is iterable, but it returns the entire thing with the current user at the lead?  I really have to look into for of more... or maps... or both
	for(let connection of chatConnections){
		allUsers.push(connection[0]);
	}
	return allUsers;
}
/*remove the user from whatever room they are in.
in the future, when they can join multiple rooms, this will have to do more
	input: 
		connection: (websocket): the current user's connection,
	returns: undefined (should probably return true/false if it worked or not)
	tasks: 
		get the current user connection data
		if they are in a room, get the room, and make them leave the room
		then delete their connection from the map
*/
function removeConnections(connection){
	const receiverCon = getUserDataForConnection(connection);
	if(!receiverCon){ //they may not have joined anything yet
		return
	}
	if(receiverCon.room){  //they may not have joined a room yet
		const roomID = receiverCon.room;
		console.log('removing user from server');
		leaveRoom(connection, roomID, true);
	}
	//method of map object
	chatConnections.delete(connection);
	console.log('current connections: '+chatConnections.size);
}
/*get all data for a particular connection based on their websocket
	input: 
		connection: (websocket): the current user's connection,
	returns: the object with all the user data
	tasks: 
		wrapper for chatConnections with some error handling
*/
function getUserDataForConnection( connection ){
	const user = chatConnections.get(connection);
	if(!user){
		return false;
	}
	return user;
}
/*get an entire list of the rooms.  can be specified to only get joinable rooms (not used currently)
	input: 
		showOnlyPublic: (optional)(boolean) whether or not to include all rooms or only joinable rooms for the current user
		//to take proper advantage of this, I would need to also pass in the user
	returns: (array) array of room objects that are available
	tasks: 
		get room list
		make a quick data packet for each one, shove them into an array
		filter out non-public ones, if necessary
*/
function getAvailableRooms(showOnlyPublic = true){
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
	//theoretically, if a room was private, you wouldn't be able to see it
	if(showOnlyPublic){
		roomList = roomList.filter( room => room.public );
	}

	return roomList;
}
/*add a connection object to our list based on our current websocket and whatever data was passed from the client
	input: 
		connection: (websocket): the current user's connection,
		data: the data to for the current user, like name
	returns: undefined
	tasks: 
		uses map to add a new connection to our list of connections
		sends an action to the person saying they joined the server (they just joined, so haven't joined the lobby yet)
*/
function addConnection(connection, data){
	console.log('addding connection with data: ', data.message)
	chatConnections.set(connection, {
		conn: connection,
		name: data.message.username, 
		room: null
	});
	sendActionToPerson('join', connection, {message: 'you have joined the server'});
}
/*sends an "action", which is not a visible message, but directs the client to do something
	input: 
		action (string): the action type to send.  interpreted by the client
		recipientConnection: (websocket): the target user's connection,
		extraData: the data to send to the person
	returns: undefined
	tasks: 
		basically wraps out send function and combines it with our packet sender
*/
function sendActionToPerson(action, recipientConnection, extraData={}){
	recipientConnection.send( createPacket(action, systemTitle, extraData))	
}
/*sends a message to a particular connection
	input: 
		message: (string) the message to send
		destinationConnection: (websocket): the person to receive the connection,
		sourceConnection: (websocket)(optional): the person sending the message, if any
	returns: undefined
	tasks: 
		figures out who is sending the message, if anyone, then sends the message
*/
function sendMessageToPerson(message, destinationConnection, sourceConnection=null){
	const receiverCon = getUserDataForConnection(destinationConnection);
	let senderName = '';
	if(sourceConnection!==null){
		let senderCon = getUserDataForConnection(sourceConnection);
		senderName = senderCon.name
	}
	receiverCon.send(createPacket('message', senderName, message));
}
/*sends an action to everyone in a particular room (or the server, if room is null)
	input: 
		connection: (websocket): the current user's connection,
		data: (object) the data that accompanies the action, like the name of the joiner, the name of the room created, etc
		room: (object) which room to send the action to
	returns: undefined
	tasks: 
		gets everyone in the room or the server (if room was null)
		goes to each connection and sends the message
*/
function sendActionToRoom(action, data, room, sender=systemTitle){
	let occupants
	if(room===null){
		occupants = getServerOccupants();
	} else {
		occupants = getRoomOccupants(room);
	}
	occupants.forEach( listener => listener.send(createPacket(action,sender, data)))
}
/*sends a message to everyone in a particular room.  sends to the current room of a particular connect at present
	input: 
		message: (string) the message to send to the room's occupants
		connection: (websocket): connection whose room we want to send messages.  this should change to a room potentially so system-wide/room wide messages from non-clients can be sent
		sender: (string)(optional) the name of the person who sent the message, or the system title if none is given
		excludeSender: (boolean)(optional) whether or not to send the message to the person sent the message. defaults to true
	returns: undefined
	tasks: 
		get the current connection data for the given websocket
		get the room data for the room that person resides inside of
		get the list of people in the room and copy it
		exclude the current person from the room list occupants if we are excluding sender
		adds the message to the current room's message queue (this should become a function later)
		go to each destination client and send them the message
*/
function sendMessageToRoom(message, connection, sender=systemTitle, excludeSender=true){
	console.log('sending message to entire room : ' + message);
	const currentChatCon = getUserDataForConnection(connection);
	let currentRoom = currentChatCon.room;
	const participants = currentRoom.listeners.slice();
	if(excludeSender){
		participants.splice( participants.indexOf(connection),1);
	}
	//there will be a problem that we will only send messages to some people some time, but then it will be in the history so everyone will see it upon connection
	currentRoom.messages.push({sender, content: message});
	participants.forEach( listener => listener.send(createPacket('message',sender, message)))
}
/*wraps all of our data for a message/action into an object and stringify it
	input: 
		type: (string) the type of packet being formed (for the destination), like roomJoin, or message
		sender: (string) the sender's name
		data: (object) the additional data to send, like the message itself, or the details of the actio
	returns: undefined
	tasks: 
		wrap everything in an object and stringify it
*/
function createPacket(type, sender, data){
	return JSON.stringify({ action: type, sender, content: data});
}

//this handles an initial connection to the websocket
wsServer.on('request', function(request) {
	console.log('test');
	//have to accept the connection or it won't work.  first param is the protocol to use, but we aren't using that.  then we specify acceping messages from the host of the incoming connection
	//ideally, when this goes live, it should be more discerning, potentially
    const connection = request.accept(null, request.origin);
    console.log((new Date()) + ' Connection accepted.');
    //add the event handler for message to this websocket connection
    connection.on('message', function(message) {
	    console.log('Received Message: ' + message.utf8Data);
	    //connection.sendUTF(message.utf8Data);
	    //break up the incoming data into json.  utf8Data is where it will be.  we aren't sending binary, yet
	    const data = JSON.parse(message.utf8Data);
	    //get the current data for the user.  I really have to go back and make use of this earlier.  That's what you get for coding while sleepy.
	    const currentUser = getUserDataForConnection(connection);
	    //decide what to do based upon the incoming action from the client
	    switch(data.action){
	    	//haven't made an account creation system yet. 
	    	case 'createaccount':
	    		console.log('create account');
	    		break;
	    	//someone joining the server.  make them default to the lobby when they join
	    	case 'join':
	    		console.log('account login');
	    		addConnection(connection, data);
	    		joinRoom(connection, rooms.lobby)
	    		break;
	    	//client is attemptint to create a room
	    	case 'createroom':
	    		console.log('create room');
	    		//all rooms will be public for now
	    		//all new rooms will be joined automatically for now
	    		const newRoomData = createRoom( connection, data.message.roomID, true, true);
	    		if(newRoomData){
	    			sendActionToRoom('roomListUpdate', { availableRooms: getAvailableRooms(true) }, null);
	    		}
	    		break;
	    	//client wants to join a particular room
	    	//first leave their current room, if they are in one
	    	//then join the new room they specified
	    	case 'joinroom':
	    	//leaveRoom(connection, room, leavingServer=false){
	    		if(data.message.roomID === getUserDataForConnection(connection).room.id){
	    			console.log('already in that room, not switching');
	    			return false;
	    		}
	    		leaveRoom(connection, getRoomForConnection( connection ));
	    		console.log("join room data: ", data);
	    		joinRoom(connection, rooms[data.message.roomID]);
	    		break;
	    	//client sent a message, relay that message to everyone else
	    	case 'message':
	    		console.log('send message');
	    		sendMessage(connection, data);
	    		break;
	    }
    });
    //add the close handler for this websocket connection from the request above
    connection.on('close', function(reasonCode, description) {
    	removeConnections(connection);
        console.log((new Date()) + ' Peer ' + connection.remoteAddress + ' disconnected.');
    });
});


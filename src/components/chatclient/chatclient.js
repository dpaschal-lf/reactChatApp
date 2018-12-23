import React, { Component } from 'react';
import './chatclient.css';
import SmartInput from '../smartinput/smartinput';

class SocketClient{
	constructor(config={}){
		const defaultOptions = {
			address: 'ws://'+window.location.hostname+':3333',
			open: ()=>{ console.log('connection opened')},
			message: ()=> { console.log('message received')},
			close: ()=>{ console.log('connection closed')}
		}
		this.options = {};
		for(let key in defaultOptions){
			this.options[key] = config[key] || defaultOptions[key];
		}
		this.connected = false;
		this.connect();
	}
	connect(){

		this.ws = new WebSocket(this.options.address);
		this.ws.onopen = this.handleOpen.bind(this);
		this.ws.onmessage = this.handleMessage.bind(this);
		this.ws.onclose = this.handleClose.bind(this);	

	}
	handleOpen(event){
		console.log('server open processed');
		this.options.open(event);
	}
	handleMessage(event){
		
		const data = JSON.parse(event.data);
		console.log('data', data);
		this.options.message(data);
	}
	handleClose(event){
		this.options.close(event);
	}
	sendMessage( action, message){
		// if(action!=='join' && !this.connected){
		// 	console.error('not connected to a server');
		// 	return false;
		// }
		const output = JSON.stringify( { action, message });
		console.log('sending message: ', output);
		this.ws.send( output );
	}
	join(username){
		this.sendMessage('join', {username});
	}
	action( action, data){
		this.sendMessage(action, data);
	}
	send(name, message){
		this.sendMessage('message', {sender: name, message })
	}
}

class ChatClient extends Component{
	constructor(props){
		super(props);
		this.handleOpen = this.handleOpen.bind(this);
		this.handleInputUpdate = this.handleInputUpdate.bind(this);
		this.handleLogin = this.handleLogin.bind(this);
		this.handleMessage = this.handleMessage.bind(this);
		this.handleMessageSend = this.handleMessageSend.bind(this);
		this.changeRoom = this.changeRoom.bind(this); 
		this.handleAddRoom = this.handleAddRoom.bind(this);
		this.handleServerClose = this.handleServerClose.bind(this);
		this.handleServerTimerCheck = this.handleServerTimerCheck.bind(this);
		const randomNames = ['Dan','Scott','Andy','George','Cody','Collette','Tim','Bill','Monique']
		this.state = {
			username: randomNames[ (randomNames.length*Math.random()>>0) ],
			mode: 'connecting',
			participants: [],
			messages: [],
			messageToSend: '',
			availableRooms: [],
			room: '',
			newRoomName: '',
			checkTimer: null,
			remainingCheckTime: 3,
			timerMessage: '',
			connectAttempts: 2
		}
		this.maxCheckTime = 3;
		this.ws = new SocketClient({
			open: this.handleOpen,
			message: this.handleMessage,
			close: this.handleServerClose
		});
		
	}
	/*controller helpers*/
	handleOpen(event){
		console.log('chat client connecting');
		this.setState({
			mode: 'login'
		})
	}
	handleInputUpdate( event ){
		const allowedAttributes = ['username','messageToSend','newRoomName'];
		const name = event.target.getAttribute('name');
		if(allowedAttributes.indexOf(name) === -1 ){
			console.log('illegal update of state');
			return;
		}
		const value = event.target.value;
		console.log(`updating ${name} with ${value}`)
		this.setState({
			[name]: value
		})
	}
	handleMessageSend(event){
		const data = {
			content: this.state.messageToSend,
			sender: this.state.username,
		}
		this.setState({
			messageToSend: ''
		})
		this.ws.sendMessage('message', data);
	}
	handleLogin(){
		this.ws.join(this.state.username);
	}
	changeRoom( newRoom ){
		this.ws.action( 'joinroom', {roomID: newRoom})
	}
	handleAddRoom(){
		this.ws.action( 'createroom', { roomID: this.state.newRoomName})
		this.setState({
			newRoomName: ''
		})
	}
	handleServerClose(){
		this.setState({
			mode: 'connectionLost',
			checkTimer: setInterval(this.handleServerTimerCheck, 1000)
		})
	}
	handleServerTimerCheck(){
		//debugger;
		const nextTime = this.state.remainingCheckTime-1;
		let remainingConnects;
		if(this.state.connectAttempts===0){
			clearInterval(this.state.checkTimer);
			this.setState({
				checkTimer: null,
				timerMessage: '',
				mode: 'connectionFailed'
			})
		}
		else if(nextTime === 0){
			clearInterval(this.state.checkTimer);
			this.setState({
				connectAttempts: this.state.connectAttempts-1,
				checkTimer : null,
				timerMessage: '',
				remainingCheckTime: this.maxCheckTime,
				mode: 'reconnect'
			});
		} else {
			this.setState({
				remainingCheckTime: nextTime,
				timerMessage: `${nextTime} seconds till next connect attempt.  (${this.state.connectAttempts} remaining}`
			})
		}

	}
	/*route controller*/
	handleMessage( data ){
		switch( data.action ){
			case 'join':
				this.setState({
					mode: 'joining'
				});
				break;
			case 'roomjoin':
				this.setState({
					mode: 'chat',
					room: data.content.roomName,
					participants: data.content.participants,
					messages: data.content.messages,
					availableRooms: data.content.availableRooms
				})
				break;
			case 'message':
				if(this.state.mode!=='chat'){
					return;
				}
				this.setState({
					messages: [...this.state.messages, {sender: data.sender, content: data.content}]
				})
			case 'participantJoin':
				this.setState({
					participants: [...this.state.participants, data.content.name]
				})
				break;
			case 'participantLeave':
				this.setState({
					participants: data.content.participantList
				})
				break;
			case 'roomListUpdate':
				this.setState({
					availableRooms: data.content.availableRooms
				})
		}
	}
	/*view helpers*/
	listParticipants(){
		return this.state.participants.map( (name, index) => <div key={index}>{name}</div>);
	}
	listMessages(){
		console.log('messages: ',this.state.messages);
		const outputArray = [];
		for( var messageI = this.state.messages.length-1; messageI>=0; messageI--){
			let messageData = this.state.messages[messageI];
			outputArray.push(
			<div key={messageI} className="messageRow">
				<span className="sender">{messageData.sender}</span>
				<span className="message">{messageData.content}</span>
			</div>);
		}
		return outputArray;

	}
	//{name, owner, occupantCount: roomData.listeners.length}
	listRooms(sortField='name', order=-1){
		return this.state.availableRooms
			.sort( (a,b)=> (a[sortField]<b[sortField] ? order : order*-1))
			.map( (room, index)=>
				<div className={'roomRow' + (room.name === this.state.room ? ' currentRoom' : '')}  key={index} onClick={(e)=>this.changeRoom(room.ID) }>
					<div className="roomName">{room.name}</div>
					<div className="roomOwner">{room.owner}</div>
					<div className="roomCount">{room.occupantCount}</div>
				</div>
			)
	}
	/*views*/
	connectionFailed(){
		return (<div>Reconnection attempt failed: <br/>
			Did you start the server? (Go to server folder and type 'node server.js')
			<br/>restart to try again</div>);
	}
	connecting(){
		return (<div>Connecting to chat server...</div>);
	}
	reconnect(){
		this.ws.connect();
		return (<div>Attempting to reconnect...</div>)
	}
	connectionLost(){
		return (<div>Lost Connection.<br/>{this.state.timerMessage}</div>)
	}
	login(){
		return (<div>
			<input type="text" value={this.state.username} name="username" onChange={this.handleInputUpdate} placeholder="username" />
			<button onClick={this.handleLogin}>login</button>
		</div>)
	}
	joining(){
		return (<div>joining server...</div>);
	}
	chat(){
		return (<div className="chatWindow">
			<div className="communication">
				<div className="messages">
					{this.listMessages()}
				</div>
				<div className="sendBar">
					{/*<input type="text" callOnPress={[{key: 13, callback: this.handleMessageSend}]} className="sendInput" name="messageToSend" onChange={this.handleInputUpdate} placeholder="enter your message here" value={this.state.messageToSend}/>*/}
					<SmartInput type="text" callOnPress={[{key: 13, callback: this.handleMessageSend}]} className="sendInput" name="messageToSend" onChange={this.handleInputUpdate} placeholder="enter your message here" value={this.state.messageToSend}/>

					<button className="sendButton" onClick={this.handleMessageSend}>SEND</button>
				</div>
			</div>
			<div className="serverData">
				<div className="people">
					{this.listParticipants()}
				</div>
				<div className="rooms">
					{this.listRooms()}
					<div className="roomAddSection">
						<input type="text" name="newRoomName" value={this.state.newRoomName} onChange={this.handleInputUpdate} placeholder="new room name"/>
						<button className="newRoomAddButton" onClick={this.handleAddRoom}>CREATE</button>

					</div>
				</div>
			</div>
		</div>)
	}


	render(){
		return this[this.state.mode]();
	}
	/*end views*/
}

export default ChatClient;
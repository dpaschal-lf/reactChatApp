import React, { Component } from 'react';
import './chatclient.css';

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
		const randomNames = ['Dan','Scott','Andy','George','Cody','Collette','Tim','Bill','Monique']
		this.state = {
			username: randomNames[ (randomNames.length*Math.random()>>0) ],
			mode: 'login',
			participants: [],
			messages: [],
			messageToSend: '',
			availableRooms: []
		}
		this.ws = new SocketClient({
			open: this.handleOpen,
			message: this.handleMessage
		});
		
	}
	/*controller helpers*/
	handleOpen(event){
		console.log('chat client connecting');
	}
	handleInputUpdate( event ){
		const allowedAttributes = ['username','messageToSend'];
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
	listRooms(){
		return this.state.availableRooms.map( (room, index)=>
		<div className="roomRow" key={index} onClick={(e)=>this.changeRoom(room.ID) }>
			<div className="roomName">{room.name}</div>
			<div className="roomOwner">{room.owner}</div>
			<div className="roomCount">{room.occupantCount}</div>
		</div>)
	}
	/*views*/
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
					<input type="text" className="sendInput" name="messageToSend" onChange={this.handleInputUpdate} placeholder="enter your message here" value={this.state.messageToSend}/>
					<button className="sendButton" onClick={this.handleMessageSend}>SEND</button>
				</div>
			</div>
			<div className="serverData">
				<div className="people">
					{this.listParticipants()}
				</div>
				<div className="rooms">
					{this.listRooms()}
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
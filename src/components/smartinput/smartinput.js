import React, { Component } from 'react';
import './smartinput.css';

class SmartInput extends Component{
	constructor(props){
		super(props);
		const pressHandlers = {};
		for( let key in props.callOnPress){
			pressHandlers[ props.callOnPress[key].key] = props.callOnPress[key];
		}
		this.state = {
			value: props.value,
			changeCallback: (props.onChange || function(){}),
			pressHandlers: pressHandlers
		}
		this.newProps = {...props};
		delete this.newProps.onChange;
		delete this.newProps.callOnPress;
		this.checkLetter = this.checkLetter.bind(this);
	}
	checkLetter(event){
		const codeAsString = event.keyCode+''
		if(this.state.pressHandlers.hasOwnProperty(codeAsString)){
			console.log('redirecting to callback')
			this.state.pressHandlers[codeAsString].callback(event);
			return false;
		}
		return true;
	}
	render(){
		return (<input onKeyDown={this.checkLetter} onChange={this.state.changeCallback} {...this.newProps} value={this.props.value}/>)
	}
}
/*
<input type="text" 
	callOnPress={[{key: 13, callback: this.handleMessageSend}]} 
	className="sendInput" name="messageToSend" 
	onChange={this.handleInputUpdate} 
	placeholder="enter your message here" 
	value={this.state.messageToSend}/>
*/


export default SmartInput;
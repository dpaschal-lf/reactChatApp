import React, { Component } from 'react';
import ChatClient from './components/chatclient/chatclient';
import './App.css';

class App extends Component {
  render() {
    return (
      <div className="App">
        <ChatClient/>
      </div>
    );
  }
}

export default App;

// Browser peer implementation
const b4a = require('b4a');
const sodium = require('sodium-universal');
const crypto = require("hypercore-crypto")

// Constants
const PORT = 8080;
const topic = 'just-chating';
const hashedTopic = b4a.alloc(32);
sodium.crypto_generichash(hashedTopic, b4a.from(topic));
const topic_key = crypto.discoveryKey(hashedTopic);

// Track connected peers
let connectedPeers = new Set(['server']);
let userName = '';
let socket = null;

// DOM elements
let statusElement, messagesElement, peerCountElement, messageInput, sendButton;

// Create a simple input box for username
function createUsernameInput() {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  overlay.style.display = 'flex';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.style.zIndex = '1000';
  
  const inputBox = document.createElement('div');
  inputBox.style.backgroundColor = '#2c3e50';
  inputBox.style.padding = '20px';
  inputBox.style.borderRadius = '8px';
  inputBox.style.width = '300px';
  
  const title = document.createElement('h2');
  title.textContent = 'Enter Your Name';
  title.style.color = '#ffffff';
  title.style.marginTop = '0';
  title.style.textAlign = 'center';
  
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Your name';
  input.style.width = '100%';
  input.style.padding = '10px';
  input.style.marginBottom = '15px';
  input.style.border = 'none';
  input.style.borderRadius = '4px';
  input.style.backgroundColor = '#34495e';
  input.style.color = '#ffffff';
  input.style.boxSizing = 'border-box';
  
  const button = document.createElement('button');
  button.textContent = 'Join Chat';
  button.style.width = '100%';
  button.style.padding = '10px';
  button.style.border = 'none';
  button.style.borderRadius = '4px';
  button.style.backgroundColor = '#3498db';
  button.style.color = '#ffffff';
  button.style.cursor = 'pointer';
  button.style.fontWeight = 'bold';
  
  inputBox.appendChild(title);
  inputBox.appendChild(input);
  inputBox.appendChild(button);
  overlay.appendChild(inputBox);
  document.body.appendChild(overlay);
  input.focus();
  
  return new Promise((resolve) => {
    const handleSubmit = () => {
      const name = input.value.trim();
      if (name) {
        document.body.removeChild(overlay);
        resolve(name);
      } else {
        input.style.border = '1px solid #e74c3c';
      }
    };
    
    button.addEventListener('click', handleSubmit);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSubmit();
    });
  });
}

// Get user name from URL hash or input box
async function getUserName() {
  let name = location.hash.substring(1);
  if (!name) {
    name = await createUsernameInput();
    if (!name) name = 'browser-' + Math.random().toString(36).substring(2, 8);
    location.hash = name;
  }
  return name;
}

// Listen for hash changes
window.onhashchange = function() {
  const newName = location.hash.substring(1);
  if (newName) {
    userName = newName;
    statusElement.textContent = `Connected as: ${newName}`;
  }
};

// Initialize DOM elements
function initDOMElements() {
  statusElement = document.getElementById('status');
  messagesElement = document.getElementById('messages');
  peerCountElement = document.getElementById('peer-count');
  messageInput = document.getElementById('message-input');
  sendButton = document.getElementById('send-button');
}

// Initialize the browser peer
async function init() {
  initDOMElements();
  
  userName = await getUserName();
  statusElement.textContent = `Connected as: ${userName}`;
  
  const publicKey = b4a.alloc(32);
  const secretKey = b4a.alloc(64);
  sodium.crypto_sign_keypair(publicKey, secretKey);
  
  // Connect to the WebSocket server
  socket = new WebSocket(`ws://localhost:${PORT}`);
  
  socket.onopen = () => {
    statusElement.textContent = `Connected as: ${userName}`;
    connectedPeers.add('server');
    updatePeerCount();
    
    const announceMsg = {
      type: 'announce',
      topic: topic,
      clientType: 'browser',
      name: userName,
      publicKey: b4a.toString(publicKey, 'hex')
    };
    
    socket.send(JSON.stringify(announceMsg));
    
    setInterval(() => {
      socket.send(JSON.stringify({
        type: 'announce',
        topic: topic,
        clientType: 'browser',
        name: userName,
        publicKey: b4a.toString(publicKey, 'hex')
      }));
    }, 30000);
  };
  
  socket.onmessage = (event) => {
    try {
      if (event.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
          try { handleMessage(JSON.parse(reader.result)); } catch (err) {}
        };
        reader.readAsText(event.data);
      } else {
        handleMessage(JSON.parse(event.data));
      }
    } catch (err) {}
  };
  
  socket.onclose = () => {
    statusElement.textContent = `Disconnected (${userName})`;
    connectedPeers.clear();
    updatePeerCount();
  };
  
  socket.onerror = (err) => {
    statusElement.textContent = `Error: ${err.message || 'Unknown error'}`;
  };
  
  // Handle messages from the server
  function handleMessage(message) {
    switch (message.type) {
      case 'peer-connected':
        addMessage(`${message.isBrowser ? 'browser' : 'Native'} peer ${message.peerId} connected`, 'system');
        connectedPeers.add(message.peerId);
        updatePeerCount();
        break;
      case 'peer-disconnected':
        addMessage(`${message.isBrowser ? 'browser' : 'Native'} peer ${message.peerId} disconnected`, 'system');
        connectedPeers.delete(message.peerId);
        updatePeerCount();
        break;
      case 'peers':
        addMessage(`Found ${message.peers.length} peers for topic ${message.topic}`, 'system');
        connectedPeers.clear();
        connectedPeers.add('server');
        message.peers.forEach(peerId => connectedPeers.add(peerId));
        updatePeerCount();
        break;
      case 'message':
        if (message.fromPeer === userName) {
          addMessage(`You: ${message.data}`, 'self');
        } else {
          addMessage(`${message.isBrowser ? 'browser' : 'Native'} peer ${message.fromPeer}: ${message.data}`, 'peer');
        }
        break;
      case 'uptime':
        if (!connectedPeers.has(message.peer)) {
          addMessage(`👋 Hi from ${message.peer}!`, 'system');
          connectedPeers.add(message.peer);
          updatePeerCount();
        }
        break;
    }
  }
  
  // Update the peer count display
  function updatePeerCount() {
    peerCountElement.textContent = `Peers: ${connectedPeers.size}`;
    statusElement.textContent = `Connected as: ${userName}`;
  }
  
  // Add a message to the messages element
  function addMessage(text, type = 'message') {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    
    const senderSpan = document.createElement('div');
    senderSpan.className = 'sender';
    senderSpan.textContent = type === 'system' ? 'System' : 
                            type === 'self' ? 'You' : 
                            type === 'peer' ? text.split(':')[0] : '';
    
    const textSpan = document.createElement('div');
    textSpan.className = 'text';
    textSpan.textContent = type === 'peer' ? text.split(':').slice(1).join(':').trim() : text;
    
    messageDiv.appendChild(senderSpan);
    messageDiv.appendChild(textSpan);
    messagesElement.appendChild(messageDiv);
    messagesElement.scrollTop = messagesElement.scrollHeight;
  }
  
  // Send a message
  function sendMessage() {
    const text = messageInput.value.trim();
    if (text) {
      socket.send(JSON.stringify({
        type: 'message',
        topic: topic,
        data: text,
        fromPeer: userName
      }));
      
      addMessage(`You: ${text}`, 'self');
      messageInput.value = '';
    }
  }
  
  // Add event listeners
  sendButton.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });
}

// Wait for DOM to be fully loaded before starting
document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    if (statusElement) statusElement.textContent = `Error: ${err.message || 'Failed to initialize'}`;
  });
});
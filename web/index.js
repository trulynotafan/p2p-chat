// ============= Backend/Network Configuration and Logic =============
const b4a = require('b4a');
const sodium = require('sodium-universal');

//Taking port as arguments
const args = process.argv.slice(2);
let port = 3000; // default

const portIndex = args.indexOf('--port');
if (portIndex !== -1 && args[portIndex + 1]) {
  port = parseInt(args[portIndex + 1], 10);
}
const topic = 'just-chating';

// Global state
let connected_peers = new Set();
let user_name = '';
let socket = null;

// Network message handler
function handle_message(message) {
  switch (message.type) {
    case 'peer-connected':
      add_message(`${message.isBrowser ? 'browser' : 'Native'} peer ${message.peerId} connected`, 'system');
      connected_peers.add(message.peerId);
      update_peer_count();
      break;
    case 'peer-disconnected':
      add_message(`${message.isBrowser ? 'browser' : 'Native'} peer ${message.peerId} disconnected`, 'system');
      connected_peers.delete(message.peerId);
      update_peer_count();
      break;
    case 'peers':
      add_message(`Found ${message.peers.length} peers for topic ${message.topic}`, 'system');
      connected_peers.clear();
      message.peers.forEach(peer_id => connected_peers.add(peer_id));
      update_peer_count();
      break;
    case 'message':
      if (message.fromPeer === user_name) {
        add_message(`You: ${message.data}`, 'self');
      } else {
        add_message(`${message.isBrowser ? 'browser' : 'Native'} peer ${message.fromPeer}: ${message.data}`, 'peer');
      }
      break;
   }
}

// Initialize WebSocket connection
async function init_websocket(public_key) {
  socket = new WebSocket(`ws://localhost:8080`);
  
  socket.onopen = () => {
    status_element.textContent = `Connected as: ${user_name}`;
    update_peer_count();
    
    const announce_msg = {
      type: 'announce',
      topic,
      isBrowser: true,
      name: user_name,
      publicKey: b4a.toString(public_key, 'hex')
    };
    
    socket.send(JSON.stringify(announce_msg));
    setInterval(() => socket.send(JSON.stringify(announce_msg)), 30000);
  };
  
  socket.onmessage = (event) => {
    try {
      if (event.data instanceof Blob) {
        const reader = new FileReader();
        reader.onload = () => {
          try { handle_message(JSON.parse(reader.result)); } catch (err) {}
        };
        reader.readAsText(event.data);
      } else {
        handle_message(JSON.parse(event.data));
      }
    } catch (err) {}
  };
  
  socket.onclose = () => {
    status_element.textContent = `Disconnected (${user_name})`;
    connected_peers.clear();
    update_peer_count();
  };
  
}

// ============= UI Elements and Handlers =============
let status_element, messages_element, peer_count_element, message_input, send_button;

// Create a username input prompt
function create_username_input() {
  const template = document.getElementById('username-prompt');
  const overlay = template.content.cloneNode(true);
  document.body.appendChild(overlay);
  
  const input = document.getElementById('username-input');
  const button = document.getElementById('username-submit');
  input.focus();
  
  return new Promise((resolve) => {
    const handle_submit = () => {
      const name = input.value.trim();
      if (name) {
        document.querySelector('.username-overlay').remove();
        resolve(name);
      } else {
        input.style.border = '1px solid #e74c3c';
      }
    };
    
    button.addEventListener('click', handle_submit);
    input.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handle_submit();
    });
  });
}

// Get user name from URL hash or input box
async function get_user_name() {
  let name = location.hash.substring(1);
  if (!name) {
    name = await create_username_input();
    if (!name) name = 'browser-' + Math.random().toString(36).substring(2, 8);
    location.hash = name;
  }
  return name;
}

// Listen for hash changes
window.onhashchange = function() {
  const new_name = location.hash.substring(1);
  if (new_name) {
    user_name = new_name;
    status_element.textContent = `Connected as: ${new_name}`;
  }
};

// Update the peer count display
function update_peer_count() {
  peer_count_element.textContent = `Peers: ${connected_peers.size}`;
  status_element.textContent = `Connected as: ${user_name}`;
}

// Add a message to the messages element
function add_message(text, type = 'message') {
  const message_div = document.createElement('div');
  message_div.className = `message ${type}`;
  
  const sender_span = document.createElement('div');
  sender_span.className = 'sender';
  sender_span.textContent = type === 'system' ? 'System' : 
                          type === 'self' ? 'You' : 
                          type === 'peer' ? text.split(':')[0] : '';
  
  const text_span = document.createElement('div');
  text_span.className = 'text';
  text_span.textContent = type === 'peer' ? text.split(':').slice(1).join(':').trim() : text;
  
  message_div.append(sender_span, text_span);
  messages_element.appendChild(message_div);
  messages_element.scrollTop = messages_element.scrollHeight;
}

// Send a message
function send_message() {
  const text = message_input.value.trim();
  if (text) {
    socket.send(JSON.stringify({
      type: 'message',
      topic,
      data: text,
      fromPeer: user_name,
      isBrowser: true
    }));
    
    add_message(`You: ${text}`, 'self');
    message_input.value = '';
  }
}

// ============= Application Initialization =============
async function init() {
  // Initialize UI elements
  status_element = document.getElementById('status');
  messages_element = document.getElementById('messages');
  peer_count_element = document.getElementById('peer-count');
  message_input = document.getElementById('message-input');
  send_button = document.getElementById('send-button');
  
  // Get username
  user_name = await get_user_name();
  status_element.textContent = `Connected as: ${user_name}`;
  
  // Initialize cryptography
  const public_key = b4a.alloc(32);
  const secret_key = b4a.alloc(64);
  sodium.crypto_sign_keypair(public_key, secret_key);
  
  // Initialize WebSocket
  await init_websocket(public_key);
  
  // Add event listeners for UI
  send_button.addEventListener('click', send_message);
  message_input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') send_message();
  });
}

// Wait for DOM to be fully loaded before starting
document.addEventListener('DOMContentLoaded', () => {
  init().catch(err => {
    if (status_element) status_element.textContent = `Error: ${err.message || 'Failed to initialize'}`;
  });
});

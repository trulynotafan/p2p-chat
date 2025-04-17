// ============= Backend/Network Configuration and Logic =============
const b4a = require('b4a')
const sodium = require('sodium-universal')
const DHT = require('@hyperswarm/dht-relay')
const Stream = require('@hyperswarm/dht-relay/ws')
const Hyperswarm = require('hyperswarm')

// Setup DHT topic
const topic = b4a.alloc(32)
sodium.crypto_generichash(topic, b4a.from('just-chating'))

function init() {
  // Create username prompt
  const overlay = document.createElement('div')
  overlay.className = 'username-overlay'
  overlay.innerHTML = `
    <div class="username-box">
      <h2>Enter Your Name</h2>
      <input type="text" id="username-input" placeholder="Type your name...">
      <button id="username-submit">Join Chat</button>
    </div>`
  document.body.appendChild(overlay)
  
  const nameInput = document.getElementById('username-input')
  const nameSubmit = document.getElementById('username-submit')
  
  function startChat(name) {
    overlay.remove()
    document.getElementById('status').textContent = name
    location.hash = name
    
    const messages = document.getElementById('messages')
    const input = document.getElementById('message-input')
    const send = document.getElementById('send-button')
    
    const socket = new WebSocket('ws://localhost:8080')
    
    // Handle incoming WebSocket messages
    socket.addEventListener('message', event => {
      try {
        const msg = JSON.parse(event.data)
        if (msg.type === 'chat' && msg.from !== name) {
          const div = document.createElement('div')
          div.textContent = `${msg.from}: ${msg.message}`
          messages.appendChild(div)
          messages.scrollTop = messages.scrollHeight
              }
            } catch (err) {
        console.error('Failed to parse message:', err)
      }
    })

    const key = { publicKey: b4a.alloc(32), secretKey: b4a.alloc(64) }
    sodium.crypto_sign_keypair(key.publicKey, key.secretKey)
    
    const swarm = new Hyperswarm({ 
      dht: new DHT(new Stream(true, socket)), 
      keyPair: key 
    })
    
    swarm.join(topic)
    swarm.on('connection', conn => {
      conn.on('data', data => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.type === 'chat' && msg.from !== name) {
            const div = document.createElement('div')
            div.textContent = `${msg.from}: ${msg.message}`
            messages.appendChild(div)
            messages.scrollTop = messages.scrollHeight
            }
          } catch (err) {
          console.error('Failed to parse peer message:', err)
        }
      })
    })
    
    function sendMessage() {
      const text = input.value.trim()
      if (text) {
        const message = JSON.stringify({ type: 'chat', from: name, message: text })
        socket.send(message)
        const div = document.createElement('div')
        div.className = 'self'
        div.textContent = `${name}: ${text}`
        messages.appendChild(div)
        messages.scrollTop = messages.scrollHeight
        input.value = ''
      }
    }
    
    // Add event listeners
    send.addEventListener('click', sendMessage)
    input.addEventListener('keypress', e => {
      if (e.key === 'Enter') sendMessage()
    })
  }
  
  // Check for existing hash
  const existingName = location.hash.slice(1)
  if (existingName) {
    nameInput.value = existingName
  }
  
  // Handle username input
  nameSubmit.addEventListener('click', () => {
    const name = nameInput.value.trim()
    if (name) startChat(name)
  })
  
  nameInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      const name = nameInput.value.trim()
      if (name) startChat(name)
    }
  })
}

document.addEventListener('DOMContentLoaded', init)

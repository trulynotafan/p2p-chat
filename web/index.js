// ============= Backend/Network Configuration and Logic =============
const b4a = require('b4a')
const sodium = require('sodium-universal')
const DHT = require('@hyperswarm/dht-relay')
const Stream = require('@hyperswarm/dht-relay/ws')
const Hyperswarm = require('hyperswarm')

const topic_hex = 'ffb09601562034ee8394ab609322173b641ded168059d256f6a3d959b2dc6021'
const topic = b4a.from(topic_hex, 'hex')

function init() {
  const overlay = document.createElement('div')
  overlay.className = 'username-overlay'
  overlay.innerHTML = `
    <div class="username-box">
      <h2>Enter Your Name</h2>
      <input type="text" id="username-input" placeholder="Type your name...">
      <button id="username-submit">Join Chat</button>
    </div>`
  document.body.appendChild(overlay)
  
  const name_input = document.getElementById('username-input')
  const name_submit = document.getElementById('username-submit')
  
  function start_chat(name) {
    overlay.remove()
    document.getElementById('status').textContent = name
    location.hash = name
    
    const messages = document.getElementById('messages')
    const input = document.getElementById('message-input')
    const send = document.getElementById('send-button')
    
    const socket = new WebSocket('ws://localhost:8080')
    
    const key = { publicKey: b4a.alloc(32), secretKey: b4a.alloc(64) }
    sodium.crypto_sign_keypair(key.publicKey, key.secretKey)
    
    const swarm = new Hyperswarm({ 
      dht: new DHT(new Stream(true, socket)), 
      keyPair: key 
    })
    
    swarm.join(topic, { server: true, client: true })
    
    function display_message(msg) {
      if (msg.type === 'chat' && msg.from !== name) {
        const div = document.createElement('div')
        div.textContent = `${msg.from}: ${msg.message}`
        messages.appendChild(div)
        messages.scrollTop = messages.scrollHeight
      }
    }
    
    socket.addEventListener('message', event => {
      try {
        display_message(JSON.parse(event.data))
      } catch {}
    })
    
    swarm.on('connection', conn => {
      conn.on('data', data => {
        try {
          display_message(JSON.parse(data.toString()))
        } catch {}
      })
    })
    
    function send_message() {
      const text = input.value.trim()
      if (text) {
        const message = JSON.stringify({
          type: 'chat',
          from: name,
          message: text
        })
        
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(message)
        }
        
        for (const conn of swarm.connections) {
          conn.write(message)
        }
        
        const div = document.createElement('div')
        div.className = 'self'
        div.textContent = `${name}: ${text}`
        messages.appendChild(div)
        messages.scrollTop = messages.scrollHeight
        input.value = ''
      }
    }
    
    send.addEventListener('click', send_message)
    input.addEventListener('keypress', e => {
      if (e.key === 'Enter') send_message()
    })
  }
  
  const existing_name = location.hash.slice(1)
  if (existing_name) {
    name_input.value = existing_name
  }
  
  name_submit.addEventListener('click', () => {
    const name = name_input.value.trim()
    if (name) start_chat(name)
  })
  
  name_input.addEventListener('keypress', e => {
    if (e.key === 'Enter') {
      const name = name_input.value.trim()
      if (name) start_chat(name)
    }
  })
}

document.addEventListener('DOMContentLoaded', init)

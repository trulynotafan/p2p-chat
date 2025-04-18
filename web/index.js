const b4a = require('b4a')
const Hyperswarm = require('hyperswarm')
const DHT = require('@hyperswarm/dht-relay')
const Stream = require('@hyperswarm/dht-relay/ws')

const args = process.argv.slice(2)
const portIndex = args.indexOf('--port')
const port = portIndex !== -1 ? parseInt(args[portIndex + 1]) : 3000

const topic_hex = 'ffb09601562034ee8394ab609322173b641ded168059d256f6a3d959b2dc6021'
const topic = b4a.from(topic_hex, 'hex')

let username = ''
const peers = new Map()

// DOM Elements
const loginDiv = document.getElementById('login')
const chatDiv = document.getElementById('chat')
const messagesDiv = document.getElementById('messages')
const messageInput = document.getElementById('messageInput')
const usernameInput = document.getElementById('username')

// Handle Enter key
usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault()
        window.setUsername()
    }
})

messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        window.sendMessage()
    }
})

window.setUsername = () => {
    username = usernameInput.value.trim()
    if (username) {
        window.location.hash = username
        loginDiv.classList.add('hidden')
        chatDiv.classList.remove('hidden')
        messageInput.focus()
        initializeChat()
    }
}

function broadcastMessage(message) {
    for (const [id, conn] of peers) {
        conn.write(message)
    }
}

window.sendMessage = () => {
    const message = messageInput.value.trim()
    if (message && peers.size > 0) {
        const fullMessage = `${username}: ${message}`
        broadcastMessage(fullMessage)
        addMessage(fullMessage, false)
        messageInput.value = ''
    }
}

function addMessage(message, isNativePeer) {
    const messageEl = document.createElement('div')
    messageEl.textContent = message
    messageEl.className = `message ${isNativePeer ? 'native-peer' : ''}`
    messagesDiv.appendChild(messageEl)
    messagesDiv.scrollTop = messagesDiv.scrollHeight
}

function initializeChat() {
    const socket = new WebSocket(`ws://localhost:8080`)

    socket.addEventListener('open', () => {
        const dht = new DHT(new Stream(true, socket))
        const swarm = new Hyperswarm({ dht })

        swarm.on('connection', (conn, info) => {
            const peerId = info.publicKey.toString('hex')
            console.log('📡 Connected to peer:', peerId)
            
            peers.set(peerId, conn)

            conn.on('data', (data) => {
                const message = b4a.toString(data)
                console.log('📩 From peer:', message)
                addMessage(message, true)
            })

            conn.on('close', () => {
                console.log('❌ Peer disconnected:', peerId)
                peers.delete(peerId)
            })
        })

        swarm.join(topic, { server: true, client: true })
    })
}

// Check for username in URL hash on load
if (window.location.hash) {
    username = window.location.hash.slice(1)
    usernameInput.value = username
    setUsername()
}

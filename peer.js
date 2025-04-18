const b4a = require('b4a')
const Hyperswarm = require('hyperswarm')
const process = require('bare-process')

const args = process.argv.slice(2)
const nameIndex = args.indexOf('--name')
const peerName = nameIndex !== -1 ? args[nameIndex + 1] : 'anonymous'

const topic_hex = 'ffb09601562034ee8394ab609322173b641ded168059d256f6a3d959b2dc6021'
const topic = b4a.from(topic_hex, 'hex')

const swarm = new Hyperswarm()
const peers = new Map()

function broadcastMessage(message) {
  for (const [id, conn] of peers) {
    conn.write(message)
  }
}

swarm.on('connection', (conn, info) => {
  const peerId = info.publicKey.toString('hex')
  console.log(`💻 Peer ${peerName} connected:`, peerId)
  peers.set(peerId, conn)

  conn.on('data', (data) => {
    console.log('💬 Received:', b4a.toString(data))
  })

  conn.on('error', (err) => {
    console.error('⚠️ Connection error:', err.message)
  })
  
  conn.on('close', () => {
    console.log('❌ Peer disconnected:', peerId)
    peers.delete(peerId)
  })
})

swarm.join(topic, { server: true, client: true })

// Handle CLI input
process.stdin.setEncoding('utf-8')
console.log(`Type your messages and press Enter to send (as ${peerName}):`)

process.stdin.on('data', (data) => {
  const message = data.trim()
  if (message && peers.size > 0) {
    const fullMessage = `${peerName}: ${message}`
    broadcastMessage(fullMessage)
  }
})

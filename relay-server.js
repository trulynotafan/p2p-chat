const { WebSocketServer } = require('ws')
const DHT = require('hyperdht')
const { relay } = require('@hyperswarm/dht-relay')
const Stream = require('@hyperswarm/dht-relay/ws')

const server = new WebSocketServer({ port: 8080 })
console.log('Relay server running on port 8080')

server.on('connection', socket => {
  const dht = new DHT()
  const stream = new Stream(false, socket)
  relay(dht, stream)

  socket.on('message', data => {
    try {
      const msg = data.toString()
      server.clients.forEach(client => {
        if (client !== socket && client.readyState === 1) {
          client.send(msg)
        }
      })
    } catch (err) {
      console.error('Message error:', err)
    }
  })

  ;[socket, stream, dht].forEach(emitter => {
    emitter.on('error', err => {
      console.error(err.message)
    })
  })
})

// Silencing a useless error
process.on('uncaughtException', err => {
  if (!err.message.includes('uint must be positive')) {
    console.error('Uncaught:', err)
    process.exit(1)
  }
})

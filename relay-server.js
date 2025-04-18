const { WebSocketServer } = require('ws')
const DHT = require('hyperdht')
const { relay } = require('@hyperswarm/dht-relay')
const Stream = require('@hyperswarm/dht-relay/ws')

const dht = new DHT()
const server = new WebSocketServer({ port: 8080 })

console.log('Relay running on ws://localhost:8080')

server.on('connection', (socket) => {
  const stream = new Stream(false, socket)
  relay(dht, stream)
})

const protomux = require('protomux')
const ws = require('bare-ws')
const dht = require('hyperdht')
const port = 8080
const topic = 'just-chating'
const label = 'Relay-Server'

const clients = new Map()
const client_names = new Map()
const announced_peers = new Set()
let client_counter = 0

async function start() {
  console.log('Relay Server Starting')
  const DHT = new dht()
  const server =  new ws.Server({ port })
  console.log('Relay Server Started and Listening on Port', port)
  server.on('connection', handle_connection)

}

function handle_connection(socket) {
  const client_id = `peer-${++client_counter}`
  clients.set(client_id, socket)
  let peer_type = 'Unknown'
  console.log(label, `New peer connected (ID: ${client_id})`)

  const mux = new protomux(socket)
  const channel = mux.createChannel({ protocol: 'dht-relay' })
  channel.open()

  socket.on('data', (data) => {
    try {
      const message = JSON.parse(data.toString())
      const is_browser = message.isBrowser == true
      peer_type = is_browser ? 'Browser' : 'Native'
      
      if (!is_browser && message.fromPeer) {
        client_names.set(client_id, message.fromPeer) //so we use actual name.
      }
      
      handle_message(message, socket, client_id, is_browser)
    } catch (err) {
      console.error(label, 'Error processing message:', err)
    }
  })


  //properly close the socket
  socket.on('close', () => {
    const client_name = client_names.get(client_id) || client_id
    clients.delete(client_id)
    client_names.delete(client_id)
    announced_peers.delete(client_id)
    console.log(label, `${peer_type} peer ${client_name} disconnected`)
  })

  // Send peer list to new client
  const peers = Array.from(clients.keys()).filter(id => id !== client_id)
  socket.write(JSON.stringify({
    type: 'peers',
    topic,
    peers,
    isBrowser: true
  }))
}

function handle_message(message, socket, current_id, is_browser = true) {
    const peer_type = is_browser ? 'Browser' : 'Native';
    const getClientName = id => client_names.get(id) || id;
  
    switch (message.type) {
      case 'announce': {
        const new_id = message.name || current_id;
  
        if (new_id !== current_id) {
          clients.delete(current_id);
          clients.set(new_id, socket);
          current_id = new_id;
        }
  
        if (message.fromPeer) {
          client_names.set(current_id, message.fromPeer);
        }
  
        if (!announced_peers.has(current_id)) {
          announced_peers.add(current_id);
          const name = getClientName(current_id);
          console.log(label, `${peer_type} peer ${name} announced for topic ${topic}`);
          broadcast_message({
            type: 'peer-connected',
            peerId: name,
            topic: message.topic || topic,
            isBrowser: is_browser
          }, current_id);
        }
        break;
      }
  
      case 'lookup': {
        const name = getClientName(current_id);
        console.log(label, `${peer_type} peer ${name} looking up topic ${topic}`);
        const peers = [...clients.keys()].filter(id => id !== current_id);
        socket.write(JSON.stringify({
          type: 'peers',
          topic: message.topic || topic,
          peers,
          isBrowser: is_browser
        }));
        break;
      }
  
      case 'message': {
        const sender = [...clients.entries()].find(([_, sock]) => sock === socket)?.[0];
        const name = message.fromPeer || getClientName(sender);
  
        if (message.fromPeer && sender) {
          client_names.set(sender, message.fromPeer);
        }
  
        console.log(label, `Message from ${peer_type} peer ${name}: ${message.data}`);
        broadcast_message({
          type: 'message',
          fromPeer: name,
          data: message.data,
          isBrowser: is_browser
        }, sender);
        break;
      }
    }
  }
  

  function broadcast_message(message, excludeClientId = null) { 
    for (const [id, client] of clients.entries()) { //So don't receive the message yourself
        if (id !== excludeClientId) {
            client.write(JSON.stringify(message));
        }
    }
  }

  
start()

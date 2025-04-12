const b4a = require('b4a');
const Protomux = require('protomux');
const ws = require('bare-ws');
const DHT = require('hyperdht');
const c = require("compact-encoding");

const PORT = 8080;
const topic = 'just-chating';

start();

async function start() {
    console.log("Relay Server Starting");

    const label = "Relay-Server";
    const wss = new ws.Server({ port: PORT });
    const clients = new Map();
    const clientNames = new Map();
    const announcedPeers = new Set(); 
    let clientCounter = 0;

    const dht = new DHT();
    await dht.ready();
    console.log("Relay Server Started and Listening on Port", PORT);

    wss.on('connection', (socket) => {
        let clientId = `peer-${++clientCounter}`;
        clients.set(clientId, socket);
        
        let peerType = "Unknown";
        
        console.log(label, `New peer connected (ID: ${clientId})`);

        const mux = new Protomux(socket);
        const channel = mux.createChannel({ protocol: 'dht-relay' });
        channel.open();

        channel.addMessage({
            encoding: c.buffer,
            onmessage: (message) => {
                console.log(label, `Received DHT relay message from peer ${clientNames.get(clientId) || clientId}`);
            }
        });

        socket.on('data', (data) => {
            try {
                const message = JSON.parse(data.toString());
                const isBrowser = message.isBrowser !== false;
                peerType = isBrowser ? 'Browser' : 'Native';
                
                if (!isBrowser && message.fromPeer) {
                    clientNames.set(clientId, message.fromPeer);
                }
                
                handleMessage(message, socket, clientId, isBrowser);
            } catch (err) {
                console.error(label, 'Error processing message:', err);
            }
        });

        socket.on('close', () => {
            const clientName = clientNames.get(clientId) || clientId;
            clients.delete(clientId);
            clientNames.delete(clientId);
            announcedPeers.delete(clientId);
            console.log(label, `${peerType} peer ${clientName} disconnected`);
        });

        // Send peer list to new client
        const peers = Array.from(clients.keys()).filter(id => id !== clientId);
        socket.write(JSON.stringify({
            type: 'peers',
            topic: topic,
            peers: peers,
            isBrowser: true
        }));
    });

    function handleMessage(message, socket, currentId, isBrowser = true) {
        switch (message.type) {
            case 'announce':
                const newClientId = message.name || currentId;

                if (newClientId !== currentId) {
                    clients.delete(currentId);
                    clients.set(newClientId, socket);
                    clientId = newClientId;
                }

                if (message.fromPeer) {
                    clientNames.set(currentId, message.fromPeer);
                }

                if (!announcedPeers.has(currentId)) {
                    announcedPeers.add(currentId);
                    const peerType = isBrowser ? 'Browser' : 'Native';
                    const clientName = clientNames.get(currentId) || currentId;
                    console.log(label, `${peerType} peer ${clientName} announced for topic ${topic}`);
                    broadcastMessage({
                        type: 'peer-connected',
                        peerId: clientName,
                        topic: message.topic || topic,
                        isBrowser: isBrowser
                    }, currentId);
                }
                break;

            case 'lookup':
                const clientName = clientNames.get(currentId) || currentId;
                console.log(label, `${isBrowser ? 'Browser' : 'Native'} peer ${clientName} looking up topic ${topic}`);
                const peers = Array.from(clients.keys()).filter(id => id !== currentId);
                socket.write(JSON.stringify({
                    type: 'peers',
                    topic: message.topic || topic,
                    peers: peers,
                    isBrowser: isBrowser
                }));
                break;

            case 'message':
                const sender = Array.from(clients.entries())
                    .find(([id, sock]) => sock === socket)?.[0];
                
                const senderName = message.fromPeer || clientNames.get(sender) || sender;
                
                if (message.fromPeer && sender) {
                    clientNames.set(sender, message.fromPeer);
                }
                
                console.log(label, `Message from ${isBrowser ? 'Browser' : 'Native'} peer ${senderName}: ${message.data}`);
                broadcastMessage({
                    type: 'message',
                    fromPeer: senderName,
                    data: message.data,
                    isBrowser: isBrowser
                }, sender);
                break;
        }
    }

    function broadcastMessage(message, excludeClientId = null) {
        for (const [id, client] of clients.entries()) {
            if (id !== excludeClientId) {
                client.write(JSON.stringify(message));
            }
        }
    }
}

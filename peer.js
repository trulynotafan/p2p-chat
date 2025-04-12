const b4a = require('b4a');
const Corestore = require('corestore');
const Hyperswarm = require('hyperswarm');
const sodium = require('sodium-universal');
const crypto = require('hypercore-crypto');
const process = require('bare-process');
const Protomux = require('protomux');
const c = require('compact-encoding');
const Hypercore = require('hypercore');
const { generateMnemonic, mnemonicToSeed } = require('bip39-mnemonic');
const fs = require('bare-fs/promises');
const ws = require('bare-ws');
const DHT = require('hyperdht');

const PORT = 8080;
const topic = 'just-chating';
const hashedTopic = b4a.alloc(32);
sodium.crypto_generichash(hashedTopic, b4a.from(topic));
const topic_key = crypto.discoveryKey(hashedTopic);

/******************************************************************************
  START
******************************************************************************/

start();
async function start() {
    const args = process.argv.slice(2);
    let name = 'client-' + Math.random().toString(36).substring(2, 8);
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--name' && i + 1 < args.length) {
            name = args[i + 1];
            break;
        }
    }
    
    const label = `\x1b[${process.pid % 2 ? 31 : 34}m[${name}]\x1b[0m`;
    console.log(label, 'start');

    // Load or generate mnemonic
    let mnemonic;
    try {
        mnemonic = await fs.readFile(`mnemonic-${name}.txt`, 'utf-8');
    } catch (err) {
        mnemonic = generateMnemonic();
        await fs.writeFile(`mnemonic-${name}.txt`, mnemonic);
    }

    const seed = await mnemonicToSeed(mnemonic);
    const seed32 = seed.slice(0, 32);
    const { publicKey, secretKey } = create_noise_keypair({ namespace: 'noisekeys', seed: seed32, name: 'noise' });
    const keyPair = { publicKey, secretKey };
    const store = new Corestore(`./storage-${name}`);
    const dht = new DHT();
    await dht.ready();
    const swarm = new Hyperswarm({ keyPair });
    swarm.on('connection', onconnection);
    const core = store.get({ name: 'test-core' });
    core.on('append', onappend);
    await core.ready();

    const socket = new ws.Socket({ port: PORT });
    const connectedPeers = new Set();

    // First log the initial topic lookup before setting up the stdin
    console.log(label, "Looking up topic " + topic);
    let lastTopicLookupLog = Date.now();
    
    // Join the topic
    const discovery = swarm.join(topic_key, { server: true, client: true });
    await discovery.flushed();
    
    // Now that we've joined and logged the initial lookup, set up stdin
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    console.log(label, "Type your message and press Enter to send:");
    
    // Set up periodic topic lookup logging
    setInterval(() => {
        const now = Date.now();
        if (now - lastTopicLookupLog >= 120000) {
            console.log(label, "Looking up topic " + topic);
            lastTopicLookupLog = now;
        }
    }, 10000);
    
    // Set up input handling
    setupCLIInput(socket, name, label);
    
    socket.on('connect', () => {
        console.log(label, '📡 Connected to WebSocket server');
        connectedPeers.add('server');

        const mux = new Protomux(socket);
        const channel = mux.createChannel({ protocol: 'dht-relay' });
        channel.open();

        channel.addMessage({
            encoding: c.buffer,
            onmessage: (message) => {
                console.log(label, 'Received DHT relay message from server');
            }
        });

        socket.write(JSON.stringify({
            type: 'announce',
            topic: topic,
            isBrowser: false
        }));
    });

    function setupCLIInput(socket, name, label) {
        process.stdin.on('data', (input) => {
            if (input.toString() === '\u0003') process.exit();
            
            const trimmedInput = input.toString().trim();
            if (trimmedInput !== '') {
                if (socket.readyState === ws.OPEN) {
                    sendMessageToAllPeers(socket, name, trimmedInput);
                    console.log(label, `You: ${trimmedInput}`);
                } else {
                    console.log(label, "Not connected to server yet. Your message will not be sent.");
                }
            }
        });
    }

    socket.on('data', (data) => {
        try {
            const dataStr = data.toString();
            if (dataStr.startsWith('{') || dataStr.startsWith('[')) {
                handleMessage(JSON.parse(dataStr));
            }
        } catch (err) {
            if (!(err instanceof SyntaxError)) {
                console.error(label, 'Error processing message:', err);
            }
        }
    });

    socket.on('close', () => {
        console.log(label, '❌ Disconnected from WebSocket server');
        connectedPeers.delete('server');
    });

    async function onconnection(socket, info) {
        const peerName = info.publicKey.toString('hex').slice(0, 8);
        console.log(label, `📡 Peer ${peerName} connected`);
    
        socket.on('close', () => {
            console.log(label, `❌ Peer ${peerName} disconnected`);
        });
    
        const replicationStream = Hypercore.createProtocolStream(socket);
        const mux = Hypercore.getProtocolMuxer(replicationStream);
        store.replicate(replicationStream);
        replicationStream.on('error', (err) => {
            console.log(label, '❌ Replication error:', err.message);
        });
    
        make_protocol({
            mux,
            opts: { protocol: 'peer-type' },
            cb: async () => {
                const channel = create_and_open_channel({ mux, opts: { protocol: 'peer-type' } });
                if (!channel) return;
                const message = channel.addMessage({
                    encoding: c.string,
                    onmessage: async (msg) => {
                        console.log(label, `Peer ${peerName} is a ${msg} peer`);
                        handle_connection(socket, store);
                    }
                });
                message.send('client');
            }
        });
    
        make_protocol({
            mux,
            opts: { protocol: 'book/announce' },
            cb: async () => {
                const channel = create_and_open_channel({
                    mux,
                    opts: { protocol: 'book/announce' }
                });
                if (!channel) return;
    
                channel.addMessage({
                    encoding: c.string,
                    onmessage: async (peerBookKey) => {
                        console.log(label, `📖 Received book key from peer ${peerName}:`, peerBookKey);
                        try {
                            const peerCore = store.get(b4a.from(peerBookKey, 'hex'));
                            await peerCore.ready();
                            peerCore.replicate(replicationStream);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                            const length = peerCore.length;
                            console.log(label, `Found ${length} previous entries from peer ${peerName}`);
                            for (let i = 0; i < length; i++) {
                                try {
                                    const data = await peerCore.get(i);
                                    console.log(label, '📚', JSON.parse(data.toString()));
                                } catch (err) {
                                    console.log(label, '❌ Error reading entry:', err);
                                }
                            }
                        } catch (err) {
                            console.log(label, '❌ Error accessing peer core:', err);
                        }
                    }
                });
            }
        });
    }

    async function onappend() {
        const L = core.length;
        core.get(L - 1).then(data => {
            console.log(label, '📬', JSON.parse(data.toString())); 
        });
    }

    function handleMessage(data) {
        switch (data.type) {
            case 'peer-connected':
                console.log(label, "Peer " + data.peerId + " connected");
                connectedPeers.add(data.peerId);
                break;
            case 'peer-disconnected':
                console.log(label, "Peer " + data.peerId + " disconnected");
                connectedPeers.delete(data.peerId);
                break;
            case 'peers':
                console.log(label, "Found " + data.peers.length + " peers");
                connectedPeers.clear();
                connectedPeers.add('server');
                data.peers.forEach(peerId => {
                    console.log(label, "Adding peer " + peerId + " to connected peers");
                    connectedPeers.add(peerId);
                });
                break;
            case 'message':
                console.log(label, `Message from ${data.isBrowser ? 'browser' : 'native'} peer ${data.fromPeer}: ${data.data}`);
                break;
        }
    }

    // Function to send a message to all connected peers
    function sendMessageToAllPeers(socket, fromPeer, message) {
        if (socket.readyState === ws.OPEN) {
            socket.write(JSON.stringify({
                type: 'message',
                fromPeer: fromPeer,
                data: message,
                isBrowser: false  
            }));
        }
    }
}


/******************************************************************************
  HELPER
******************************************************************************/

function create_noise_keypair({namespace, seed, name}) {
    const noiseSeed = deriveSeed(seed, namespace, name);
    const publicKey = b4a.alloc(32);
    const secretKey = b4a.alloc(64);
    if (noiseSeed) sodium.crypto_sign_seed_keypair(publicKey, secretKey, noiseSeed);
    else sodium.crypto_sign_keypair(publicKey, secretKey);
    return { publicKey, secretKey };
}

function deriveSeed(primaryKey, namespace, name) {
    if (!b4a.isBuffer(namespace)) namespace = b4a.from(namespace);
    if (!b4a.isBuffer(name)) name = b4a.from(name);
    if (!b4a.isBuffer(primaryKey)) primaryKey = b4a.from(primaryKey);
    const out = b4a.alloc(32);
    sodium.crypto_generichash_batch(out, [namespace, name, primaryKey]);
    return out;
}

async function make_protocol({ mux, opts, cb }) {
    mux.pair(opts, cb);
    const opened = await mux.stream.opened;
    if (opened) cb();
}

function create_and_open_channel({ mux, opts }) {
    const channel = mux.createChannel(opts);
    if (!channel) return;
    channel.open();
    return channel;
}

function handle_connection(socket, store) {
    const peerId = socket.remotePublicKey ? socket.remotePublicKey.toString('hex').slice(0, 8) : 'unknown';
    const replicationStream = Hypercore.createProtocolStream(socket);
    const mux = Hypercore.getProtocolMuxer(replicationStream);
    store.replicate(replicationStream);
    replicationStream.on('error', err => console.error(`Replication error with ${peerId}:`, err));
}

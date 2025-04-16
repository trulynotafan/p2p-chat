const b4a = require('b4a');
const hyperswarm = require('hyperswarm');
const sodium = require('sodium-universal');
const crypto = require('hypercore-crypto');
const process = require('bare-process');
const protomux = require('protomux');
const { generateMnemonic, mnemonicToSeed } = require('bip39-mnemonic')
const fs = require('bare-fs/promises');
const ws = require('bare-ws');
const dht = require('hyperdht');

const port = 8080;
const topic = 'just-chating';
const hashed_topic = b4a.alloc(32);
sodium.crypto_generichash(hashed_topic, b4a.from(topic));
const topic_key = crypto.discoveryKey(hashed_topic);

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
    const { public_key, secret_key } = create_noise_keypair({ namespace: 'noisekeys', seed: seed32, name: 'noise' });
    const key_pair = { publicKey: public_key, secretKey: secret_key };
    const DHT = new dht();
    const swarm = new hyperswarm({ key_pair });
    swarm.on('connection', on_connection);
    
    

    const socket =  new ws.Socket({ port });

    const connected_peers = new Set();

    socket.on('error', () => {
        console.log(label, 'WebSocket not connected');
        process.exit(1);
    });

    const discovery = swarm.join(topic_key, { server: true, client: true });
    await discovery.flushed();
    
    //process stdn, to get input from the user.. 
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    console.log(label, 'Type your message and press Enter to send:');
    
    
    // Set up input handling
    setup_cli_input(socket, name, label);
    
    socket.on('connect', () => {
        const mux = protomux(socket);
        const channel = mux.createChannel({ protocol: 'dht-relay' });
        channel.open();

        socket.write(JSON.stringify({
            type: 'announce',
            topic,
            isBrowser: false
        }));
    });

    function setup_cli_input(socket, name, label) {
        process.stdin.on('data', (input) => {
          if (input.toString() === '\u0003') process.exit();
      
          const msg = input.toString().trim();
          if (msg && socket.readyState === ws.OPEN) {
            send_message_to_all_peers(socket, name, msg);
            console.log(label, `You: ${msg}`);
          }
        });
      }
      

    socket.on('data', (data) => {
        try {
            const data_str = data.toString();
            if (data_str.startsWith('{') || data_str.startsWith('[')) {
                handle_message(JSON.parse(data_str));
            }
        } catch (err) {
            if (!(err instanceof SyntaxError)) {
                console.error(label, 'Error processing message:', err);
            }
        }
    });

    socket.on('close', () => {
  console.log(label, 'Disconnected from WebSocket server');
    });

    async function on_connection(socket) {
        const peer_id = socket.remotePublicKey ? socket.remotePublicKey.toString('hex').slice(0, 8) : 'unknown';
        console.log(`Peer ${peer_id} connected`);
    
        socket.on('close', () => {
            console.log(`Peer ${peer_id} disconnected`);
        });
    }

   
    function handle_message(data) {
        switch (data.type) {
            case 'peer-connected':
                console.log(label, 'Peer ' + data.peerId + ' connected');
                connected_peers.add(data.peerId);
                break;
            case 'peer-disconnected':
                console.log(label, 'Peer ' + data.peerId + ' disconnected');
                connected_peers.delete(data.peerId);
                break;
            case 'peers':
                console.log(label, 'Found ' + data.peers.length + ' peers');
                connected_peers.clear();
                connected_peers.add('server');
                data.peers.forEach(peer_id => {
                    console.log(label, 'Adding peer ' + peer_id + ' to connected peers');
                    connected_peers.add(peer_id);
                });
                break;
            case 'message':
                console.log(label, `Message from ${data.isBrowser ? 'browser' : 'native'} peer ${data.fromPeer}: ${data.data}`);
                break;
        }
    }

    // Function to send a message to all connected peers
    function send_message_to_all_peers(socket, from_peer, message) {
        if (socket.readyState === ws.OPEN) {
            socket.write(JSON.stringify({
                type: 'message',
                fromPeer: from_peer,
                data: message,
                isBrowser: false  
            }));
        }
    }
}


/******************************************************************************
  HELPER
******************************************************************************/

function create_noise_keypair({ namespace, seed, name }) {
    const noise_seed = derive_seed(seed, namespace, name);
    const public_key = b4a.alloc(32);
    const secret_key = b4a.alloc(64);
    if (noise_seed) sodium.crypto_sign_seed_keypair(public_key, secret_key, noise_seed);
    else sodium.crypto_sign_keypair(public_key, secret_key);
    return { public_key, secret_key };
}

function derive_seed(primary_key, namespace, name) {
    if (!b4a.isBuffer(namespace)) namespace = b4a.from(namespace);
    if (!b4a.isBuffer(name)) name = b4a.from(name);
    if (!b4a.isBuffer(primary_key)) primary_key = b4a.from(primary_key);
    const out = b4a.alloc(32);
    sodium.crypto_generichash_batch(out, [namespace, name, primary_key]);
    return out;
}


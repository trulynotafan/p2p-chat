const b4a = require('b4a');
const hyperswarm = require('hyperswarm');
const sodium = require('sodium-universal');
const crypto = require('hypercore-crypto');
const process = require('bare-process');
const ws = require('bare-ws');

// Configure basic settings
const port = 8080;
const topic = 'just-chating';
const hashed_topic = b4a.alloc(32);
sodium.crypto_generichash(hashed_topic, b4a.from(topic));
const topic_key = crypto.discoveryKey(hashed_topic);

// Start the application
start();

async function start() {
    // Parse name from command line arguments or generate a random one
    const args = process.argv.slice(2);
    let name = 'client-' + Math.random().toString(36).substring(2, 7);
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--name' && i + 1 < args.length) {
            name = args[i + 1];
            break;
        }
    }
    
    console.log(`[${name}] Starting...`);

    // Generate keypair
    const key_pair = generate_keypair();
    const swarm = new hyperswarm({ keyPair: key_pair });
    
    // Connect to websocket server
    const socket = new ws.Socket({ port });
    socket.on('error', () => {
        console.log(`[${name}] WebSocket connection failed`);
        process.exit(1);
    });

    // Join the swarm with the topic
    swarm.join(topic_key, { server: true, client: true });
    console.log(`[${name}] Joined swarm with topic: ${topic}`);
    
    // Handle incoming messages
    socket.on('data', (data) => {
        try {
            const message = JSON.parse(data.toString());
            if (message.type === 'chat' && message.from !== name) {
                console.log(`[${message.from}]: ${message.message}`);
            }
        } catch (err) {
            // Silently ignore parsing errors
        }
    });

    // Set up input handling for user messages
    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    console.log(`[${name}] Type your message and press Enter to send:`);
    
    process.stdin.on('data', (input) => {
        if (input.toString() === '\u0003') process.exit();
        
        const msg = input.toString().trim();
        if (msg && socket.readyState === ws.OPEN) {
            socket.write(JSON.stringify({
                type: 'chat',
                from: name,
                message: msg
            }));
            console.log(`[${name}]: ${msg}`);
        }
    });

    // Handle socket events
    socket.on('connect', () => {
        console.log(`[${name}] Connected to server`);
    });
    
    socket.on('close', () => {
        console.log(`[${name}] Disconnected from server`);
    });
}

// Helper function to generate a keypair
function generate_keypair() {
    const public_key = b4a.alloc(32);
    const secret_key = b4a.alloc(64);
    sodium.crypto_sign_keypair(public_key, secret_key);
    return { publicKey: public_key, secretKey: secret_key };
}

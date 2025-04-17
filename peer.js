const b4a = require('b4a');
const hyperswarm = require('hyperswarm');
const sodium = require('sodium-universal');
const process = require('bare-process');

const topic_hex = 'ffb09601562034ee8394ab609322173b641ded168059d256f6a3d959b2dc6021'
const topic = b4a.from(topic_hex, 'hex')

start();

async function start() {
    const args = process.argv.slice(2);
    let name = 'client-' + Math.random().toString(36).substring(2, 7);
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--name' && i + 1 < args.length) {
            name = args[i + 1];
            break;
        }
    }
    
    console.log(`[${name}] Starting...`);

    const key_pair = generate_keypair();
    const swarm = new hyperswarm({ keyPair: key_pair });
    
    swarm.join(topic, { server: true, client: true });
    console.log(`[${name}] Joined swarm with topic: ${topic_hex}`);
    
    swarm.on('connection', (conn, info) => {
        console.log(`[${name}] Peer connected`);
        
        conn.on('data', (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.type === 'chat' && message.from !== name) {
                    console.log(`[${message.from}]: ${message.message}`);
                }
            } catch {}
        });
    })

    process.stdin.setEncoding('utf8');
    process.stdin.resume();
    console.log(`[${name}] Type your message and press Enter to send:`);
    
    process.stdin.on('data', (input) => {
        if (input.toString() === '\u0003') process.exit();
        
        const msg = input.toString().trim();
        if (msg) {
            const message = JSON.stringify({
                type: 'chat',
                from: name,
                message: msg
            });
            
            // Broadcast to all peers 
            for (const conn of swarm.connections) {
                conn.write(message);
            }
            console.log(`[${name}]: ${msg}`);
        }
    });
}

function generate_keypair() {
    const public_key = b4a.alloc(32);
    const secret_key = b4a.alloc(64);
    sodium.crypto_sign_keypair(public_key, secret_key);
    return { publicKey: public_key, secretKey: secret_key };
}

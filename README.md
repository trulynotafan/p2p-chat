# P2P exchange between Native and Borwser Peers Relayed via hyper-dht using Hyperswarm, Corestore and Hypercore. Using bare (p2p friendly) runtime.


# Installation
1. [Node Package Manager](https://nodejs.org/en/download)
2. Bare runtime `npm install -g bare`
3. Install all the packages using `npm install`

# RUN
Relay server: `npm run start`
This will initialize the relay-server on port 8080.

# Peers
For broswer peers: `npm run dev`
This will bundle up the index.js and will initiate the web client.
After the bundling you can also run `npm run web` to start the web client on the port.
You can just type your name into the input feild to start. 


For native peers: `bare peer.js --name (any-name)`
e.g `bare peer.js --name afaan`
This will start the naive peers. Currently native peers are only sending a hardcoded native message to other peers. I'll change that in the future.

You can run as much native or borwser peers as you want just dont forget to close the relay server. 




 Right now, it uses a random 32bytes Hardcoded Topic to connect all peers to the same network. You can change it if you want.

### 4. reset
if you want to start over, just delete the storage folder:
e.g.: `npm run reset`

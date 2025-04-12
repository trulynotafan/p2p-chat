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
Then you can send the messages by typing it into the input feild.


For native peers: `bare peer.js --name (any-name)`
e.g `bare peer.js --name afaan`
This will start the naive peers. You can type anything into the terminal and it will be sent to all the other browser/native peers.

You can run as much native or borwser peers as you want just dont forget to close the relay server. 




 Right now, it uses a random 32bytes Hardcoded Topic to connect all peers to the same network. You can change it if you want.

### 4. reset
if you want to start over, just delete the storage folder:
e.g.: `npm run reset`
This will delete the storage of the client. For browser just refresh or disconect (I'm working on proper history managment system.)

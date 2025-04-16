# p2p-chat

# prerequisites
1. [npm](https://nodejs.org/en/download) 
2. [bare](https://bare.pears.com/) 

# Setup 

1. `npm install` (to install dependencies)  
2.  `npm start` (to start the relay server) 
3. For cli peers `npm run bare -- --name anyname` e.g: `npm run bare -- --name afaan`
4. For browser peers `npm run build` (to build all the js files)
5. then `npm run web -- --port anyport` e.g: `npm run web -- --port 3001`

When two or more peers connect, you can start chating:

1. By typing in the terminal for cli peers.
2. By typing in the input feild for browser peers. 

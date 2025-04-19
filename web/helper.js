const b4a = require('b4a')
const sodium = require('sodium-universal')

async function extension_pbkdf2_sha512_async(out, password, salt, iterations, keylen) {
  if (out.length < keylen) throw new Error('Output buffer too small')
  
  const blockSize = 128
  const hashLen = 64
  const blocks = Math.ceil(keylen / hashLen)
  
  const block = b4a.alloc(hashLen)
  const blockSalt = b4a.alloc(salt.length + 4)
  b4a.copy(salt, blockSalt)
  
  for (let i = 1; i <= blocks; i++) {
    blockSalt[salt.length] = (i >> 24) & 0xff
    blockSalt[salt.length + 1] = (i >> 16) & 0xff
    blockSalt[salt.length + 2] = (i >> 8) & 0xff
    blockSalt[salt.length + 3] = i & 0xff
    
    const hmac = new HMAC(password)
    hmac.update(blockSalt)
    hmac.final(block)
    
    const tempBlock = b4a.from(block)
    
    for (let j = 1; j < iterations; j++) {
      const hmac = new HMAC(password)
      hmac.update(block)
      hmac.final(block)
      
      for (let k = 0; k < hashLen; k++) {
        tempBlock[k] ^= block[k]
      }
      
      if (j % 100 === 0) {
        await new Promise(resolve => setTimeout(resolve, 0))
      }
    }
    
    const offset = (i - 1) * hashLen
    const size = Math.min(hashLen, keylen - offset)
    b4a.copy(tempBlock.slice(0, size), out, offset)
  }
  
  return out
}

class HMAC {
  constructor(key, hash = 'sha512') {
    this.blockSize = 128
    this.hashSize = 64
    this.hash = hash
    
    if (key.length > this.blockSize) {
      const tempKey = b4a.alloc(this.hashSize)
      sodium.crypto_generichash(tempKey, key)
      key = tempKey
    }
    
    this.ipad = b4a.alloc(this.blockSize)
    this.opad = b4a.alloc(this.blockSize)
    
    for (let i = 0; i < key.length; i++) {
      this.ipad[i] = key[i] ^ 0x36
      this.opad[i] = key[i] ^ 0x5c
    }
    
    for (let i = key.length; i < this.blockSize; i++) {
      this.ipad[i] = 0x36
      this.opad[i] = 0x5c
    }
    
    this.initialized = false
    this.finalized = false
    this.buffer = []
  }
  
  init() {
    this.initialized = true
    this.finalized = false
    this.buffer = [this.ipad]
    return this
  }
  
  update(data) {
    if (!this.initialized) this.init()
    if (this.finalized) throw new Error('HMAC already finalized')
    
    this.buffer.push(data)
    return this
  }
  
  final(out) {
    if (!this.initialized) this.init()
    if (this.finalized) throw new Error('HMAC already finalized')
    
    const combined = b4a.concat(this.buffer)
    
    const innerHash = b4a.alloc(this.hashSize)
    sodium.crypto_generichash(innerHash, combined)
    
    const outerCombined = b4a.concat([this.opad, innerHash])
    sodium.crypto_generichash(out, outerCombined)
    
    this.finalized = true
    return out
  }
  
  static sha512(key) {
    return new HMAC(key, 'sha512')
  }
}

module.exports = {
  extension_pbkdf2_sha512_async,
  HMAC
} 
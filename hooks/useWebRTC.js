import { useState, useRef, useCallback } from 'react'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
}

export const WebRTC = (socket,roomId)=>{
    const [connections, setConnections] = useState(new Map())
    const [dataChannels, setDataChannels] = useState(new Map())


    const createPeerConnection = useCallback((userId) => {
    const peerConnection = new RTCPeerConnection(ICE_SERVERS)
    
    // Create data channel for file transfer
    const dataChannel = peerConnection.createDataChannel('fileTransfer', {
      ordered: true
    })
    
    setupDataChannel(dataChannel, userId)
    
    peerConnection.ondatachannel = (event) => {
      const channel = event.channel
      setupDataChannel(channel, userId)
    }
    
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket) {
        socket.emit('ice-candidate', {
          target: userId,
          candidate: event.candidate
        })
      }
    }
    
    peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', peerConnection.connectionState)
      if (peerConnection.connectionState === 'failed') {
        // Attempt to restart ICE
        peerConnection.restartIce()
      }
    }
    
    return peerConnection
  }, [socket])

  const setupDataChannel = (channel, userId) => {
    channel.binaryType = 'arraybuffer'
    
    channel.onopen = () => {
      console.log('Data channel opened with', userId)
      setDataChannels(prev => new Map(prev.set(userId, channel)))
    }
    
    channel.onerror = (error) => {
      console.error('Data channel error:', error)
    }
    
    channel.onclose = () => {
      console.log('Data channel closed with', userId)
      setDataChannels(prev => {
        const newMap = new Map(prev)
        newMap.delete(userId)
        return newMap
      })
    }
  }

}
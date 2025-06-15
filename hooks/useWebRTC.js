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



  const sendFile = async (file, targetUserId) => {
    const channel = dataChannels.get(targetUserId)
    if (!channel || channel.readyState !== 'open') {
      console.error('Data channel not ready')
      return
    }

    // Send file metadata
    const fileInfo = {
      type: 'file-start',
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    }
    channel.send(JSON.stringify(fileInfo))

    // Send file in chunks
    const chunkSize = 16384 // 16KB it is
    const fileReader = new FileReader()
    let offset = 0

    const readSlice = () => {
      const slice = file.slice(offset, offset + chunkSize)
      fileReader.readAsArrayBuffer(slice)
    }

    fileReader.onload = (e) => {
      channel.send(e.target.result)
      offset += e.target.result.byteLength
      
      const progress = (offset / file.size) * 100
      setTransferProgress(prev => new Map(prev.set(targetUserId, progress)))

      if (offset < file.size) {
        readSlice()
      } else {
        channel.send(JSON.stringify({ type: 'file-end' }))
        setTransferProgress(prev => {
          const newMap = new Map(prev)
          newMap.delete(targetUserId)
          return newMap
        })
      }
    }

    readSlice()
  }

  const connectToPeer = async (userId) => {
    const peerConnection = createPeerConnection(userId)
    setConnections(prev => new Map(prev.set(userId, peerConnection)))
    
    const offer = await peerConnection.createOffer()
    await peerConnection.setLocalDescription(offer)
    
    if (socket) {
      socket.emit('offer', {
        target: userId,
        offer: offer
      })
    }
  }

  const handleOffer = async (offer, senderId) => {
    const peerConnection = createPeerConnection(senderId)
    setConnections(prev => new Map(prev.set(senderId, peerConnection)))
    
    await peerConnection.setRemoteDescription(offer)
    const answer = await peerConnection.createAnswer()
    await peerConnection.setLocalDescription(answer)
    
    if (socket) {
      socket.emit('answer', {
        target: senderId,
        answer: answer
      })
    }
  }

  const handleAnswer = async (answer, senderId) => {
    const peerConnection = connections.get(senderId)
    if (peerConnection) {
      await peerConnection.setRemoteDescription(answer)
    }
  }

  const handleIceCandidate = async (candidate, senderId) => {
    const peerConnection = connections.get(senderId)
    if (peerConnection) {
      await peerConnection.addIceCandidate(candidate)
    }
  }

}
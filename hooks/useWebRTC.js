import { useState, useRef, useCallback } from 'react'

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
}

export const useWebRTC = (socket,roomId)=>{
  const [connections, setConnections] = useState(new Map())
  const [dataChannels, setDataChannels] = useState(new Map())
  const [transferProgress, setTransferProgress] = useState(new Map())
  const [isReceiving, setIsReceiving] = useState(false)
  const [receivingFile, setReceivingFile] = useState(null)
  const [receivedFiles, setReceivedFiles] = useState([]) // List of received files
  
  const receivedBuffers = useRef(new Map())
  const receivedSize = useRef(new Map())
  const fileMetadata = useRef(new Map()) // Store file metadata per user
  const completedFiles = useRef(new Map()) // Store completed file blobs

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
    
    channel.onmessage = (event) => {
      handleDataChannelMessage(event.data, userId)
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

  const handleDataChannelMessage = (data, userId) => {
    if (typeof data === 'string') {
      const message = JSON.parse(data)
      
      if (message.type === 'file-start') {
        const fileInfo = {
          name: message.fileName,
          size: message.fileSize,
          type: message.fileType
        }
        
        // Store file metadata for this user
        fileMetadata.current.set(userId, fileInfo)
        
        setIsReceiving(true)
        setReceivingFile(fileInfo)
        receivedBuffers.current.set(userId, [])
        receivedSize.current.set(userId, 0)
        setTransferProgress(prev => new Map(prev.set(userId, 0)))
      } else if (message.type === 'file-end') {
        const buffers = receivedBuffers.current.get(userId)
        const metadata = fileMetadata.current.get(userId)
        
        if (buffers && metadata) {
          const blob = new Blob(buffers, { type: metadata.type })
          const fileId = `${userId}-${Date.now()}`
          
          // Store the completed file
          completedFiles.current.set(fileId, blob)
          
          // Add to received files list
          const receivedFile = {
            id: fileId,
            name: metadata.name,
            size: metadata.size,
            type: metadata.type,
            sender: userId,
            receivedAt: new Date(),
            downloaded: false
          }
          
          setReceivedFiles(prev => [receivedFile, ...prev])
          
          // Cleanup transfer data
          receivedBuffers.current.delete(userId)
          receivedSize.current.delete(userId)
          fileMetadata.current.delete(userId)
          setTransferProgress(prev => {
            const newMap = new Map(prev)
            newMap.delete(userId)
            return newMap
          })
          setIsReceiving(false)
          setReceivingFile(null)
        }
      }
    } else {
      // Binary data (file chunk)
      const metadata = fileMetadata.current.get(userId)
      
      if (metadata) {
        const buffers = receivedBuffers.current.get(userId) || []
        buffers.push(data)
        receivedBuffers.current.set(userId, buffers)
        
        const currentSize = receivedSize.current.get(userId) || 0
        const newSize = currentSize + data.byteLength
        receivedSize.current.set(userId, newSize)
        
        const progress = (newSize / metadata.size) * 100
        setTransferProgress(prev => new Map(prev.set(userId, progress)))
      }
    }
  }

  const downloadFile = (blob, fileName) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const downloadReceivedFile = (fileId) => {
    const blob = completedFiles.current.get(fileId)
    const fileInfo = receivedFiles.find(f => f.id === fileId)
    
    if (blob && fileInfo) {
      downloadFile(blob, fileInfo.name)
      
      // Mark as downloaded
      setReceivedFiles(prev => 
        prev.map(file => 
          file.id === fileId ? { ...file, downloaded: true } : file
        )
      )
    }
  }

  const deleteReceivedFile = (fileId) => {
    // Remove from completed files    
    // Remove from received files list
    completedFiles.current.delete(fileId)
    setReceivedFiles(prev => prev.filter(file => file.id !== fileId))
  }

  const clearAllReceivedFiles = () => {
    // Clear all completed files
    completedFiles.current.clear()
    
    // Clear received files list
    setReceivedFiles([])
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

  return {
    connections,
    dataChannels,
    transferProgress,
    isReceiving,
    receivingFile,
    receivedFiles,
    sendFile,
    connectToPeer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    downloadReceivedFile,
    deleteReceivedFile,
    clearAllReceivedFiles
  }
}
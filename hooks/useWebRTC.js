import { useState, useRef, useCallback } from 'react'

const MAX_BUFFERED_AMOUNT = 1024 * 1024 // 1MB
const BUFFER_THRESHOLD = 512 * 1024 // 512KB

const ICE_SERVERS = {
  iceServers: [
    // Google STUN servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    
    // Backup STUN server
    { urls: 'stun:stun.stunprotocol.org:3478' },
    
    // Free TURN server
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10,
}

export const useWebRTC = (socket, roomId) => {
  const [connections, setConnections] = useState(new Map())
  const [dataChannels, setDataChannels] = useState(new Map())
  const [activeTransfers, setActiveTransfers] = useState(new Map())
  const [receivedFiles, setReceivedFiles] = useState([])
  
  const receivedBuffers = useRef(new Map())
  const receivedSize = useRef(new Map())
  const fileMetadata = useRef(new Map())
  const completedFiles = useRef(new Map())
  const activeTransferControllers = useRef(new Map())
  const currentSendingTransfer = useRef(new Map())

  const createPeerConnection = useCallback((userId) => {
    console.log('Creating peer connection for user:', userId)
    
    const peerConnection = new RTCPeerConnection(ICE_SERVERS)
    
    // Connection state tracking
    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state with ${userId}:`, peerConnection.connectionState)
      
      if (peerConnection.connectionState === 'failed') {
        console.log('Connection failed, will attempt reconnection')
        // Don't automatically restart ICE immediately, let the app handle it
      }
    }
    
    // ICE connection state tracking
    peerConnection.oniceconnectionstatechange = () => {
      console.log(`ICE connection state with ${userId}:`, peerConnection.iceConnectionState)
    }
    
    // Create data channel for file transfer
    const dataChannel = peerConnection.createDataChannel('fileTransfer', {
      ordered: true
    })
    
    setupDataChannel(dataChannel, userId)
    
    // Handle incoming data channels
    peerConnection.ondatachannel = (event) => {
      console.log('Received data channel from:', userId)
      const channel = event.channel
      setupDataChannel(channel, userId)
    }
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket) {
        console.log('Sending ICE candidate to', userId)
        socket.emit('ice-candidate', {
          target: userId,
          candidate: event.candidate
        })
      }
    }
    
    return peerConnection
  }, [socket])

  const generateTransferId = () => {
    return `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  const setupDataChannel = (channel, userId) => {
    channel.binaryType = 'arraybuffer'
    
    channel.onopen = () => {
      console.log('✅ Data channel opened with', userId)
      setDataChannels(prev => new Map(prev.set(userId, channel)))
    }
    
    channel.onmessage = (event) => {
      handleDataChannelMessage(event.data, userId)
    }

    channel.onerror = (error) => {
      console.error('❌ Data channel error with', userId, ':', error)
    }
    
    channel.onclose = () => {
      console.log('📪 Data channel closed with', userId)
      setDataChannels(prev => {
        const newMap = new Map(prev)
        newMap.delete(userId) 
        return newMap
      })
    }
  }

  const handleDataChannelMessage = (data, userId) => {
    if (typeof data === 'string') {
      try {
      const message = JSON.parse(data)
      
      if (message.type === 'file-start') {
        const transferId = message.transferId;
        const fileInfo = {
          name: message.fileName,
          size: message.fileSize,
          type: message.fileType,
          transferId: transferId,
          sender: userId
        }
        
        fileMetadata.current.set(transferId, fileInfo)
        
        setActiveTransfers(prev => new Map(prev.set(transferId, {
          id: transferId,
          type: 'receiving',
          fileName: message.fileName,
          fileSize: message.fileSize,
          progress: 0,
          userId: userId,
          status: 'active'
        })))
        
        receivedBuffers.current.set(transferId, [])
        receivedSize.current.set(transferId, 0)

      } else if (message.type === 'file-chunk-header') {
        currentSendingTransfer.current.set(userId, message.transferId)
        
      } else if (message.type === 'file-end') {
        const transferId = message.transferId
        const buffers = receivedBuffers.current.get(transferId)
        const metadata = fileMetadata.current.get(transferId)
        
        if (buffers && metadata) {
          const blob = new Blob(buffers, { type: metadata.type })
          const fileId = `${userId}-${Date.now()}`
          
          completedFiles.current.set(fileId, blob)
          
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
          
          receivedBuffers.current.delete(transferId)
          receivedSize.current.delete(transferId)
          fileMetadata.current.delete(transferId)
          currentSendingTransfer.current.delete(userId)
          
          setActiveTransfers(prev => {
            const newMap = new Map(prev)
            newMap.delete(transferId)
            return newMap
          })
        }
      } else if (message.type === 'file-cancel') {
        const transferId = message.transferId
        
        receivedBuffers.current.delete(transferId)
        receivedSize.current.delete(transferId)
        fileMetadata.current.delete(transferId)
        
        setActiveTransfers(prev => {
          const newMap = new Map(prev)
          const transfer = newMap.get(transferId)
          if (transfer) {
            newMap.set(transferId, { ...transfer, status: 'cancelled' })
            setTimeout(() => {
              setActiveTransfers(current => {
                const updated = new Map(current)
                updated.delete(transferId)
                return updated
              })
            }, 2000)
          }
          return newMap
        }) 
        } 
        }catch (error) {
        console.error('Error parsing message:', error)
      }
    } else {
      // Binary data handling (same as before)
      const transferId = currentSendingTransfer.current.get(userId)
      
      if (transferId) {
        const metadata = fileMetadata.current.get(transferId)
        
        if (metadata) {
          const buffers = receivedBuffers.current.get(transferId) || []
          buffers.push(data)
          receivedBuffers.current.set(transferId, buffers)
          
          const currentSize = receivedSize.current.get(transferId) || 0
          const newSize = currentSize + data.byteLength
          receivedSize.current.set(transferId, newSize)
          
          const progress = (newSize / metadata.size) * 100
          
          setActiveTransfers(prev => {
            const newMap = new Map(prev)
            const transfer = newMap.get(transferId)
            if (transfer) {
              newMap.set(transferId, { ...transfer, progress })
            }
            return newMap
          })
        }
      }
    }
  }

  const cancelTransfer = (transferId) => {
    const transfer = activeTransfers.get(transferId)
    if (!transfer) return
    
    const controller = activeTransferControllers.current.get(transferId)
    if (controller) {
      controller.cancelled = true
      activeTransferControllers.current.delete(transferId)
    }
    
    const channel = dataChannels.get(transfer.userId)
    if (channel && channel.readyState === 'open') {
      try {
        channel.send(JSON.stringify({
          type: 'file-cancel',
          transferId: transferId
        }))
      } catch (error) {
        console.error('Error sending cancel message:', error)
      }
    }
    
    setActiveTransfers(prev => {
      const newMap = new Map(prev)
      const currentTransfer = newMap.get(transferId)
      if (currentTransfer) {
        newMap.set(transferId, { ...currentTransfer, status: 'cancelled' })
        setTimeout(() => {
          setActiveTransfers(current => {
            const updated = new Map(current)
            updated.delete(transferId)
            return updated
          })
        }, 2000)
      }
      return newMap
    })
    
    if (transfer.type === 'receiving') {
      receivedBuffers.current.delete(transferId)
      receivedSize.current.delete(transferId)
      fileMetadata.current.delete(transferId)
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
      
      setReceivedFiles(prev => 
        prev.map(file => 
          file.id === fileId ? { ...file, downloaded: true } : file
        )
      )
    }
  }

  const deleteReceivedFile = (fileId) => {
    completedFiles.current.delete(fileId)
    setReceivedFiles(prev => prev.filter(file => file.id !== fileId))
  }

  const clearAllReceivedFiles = () => {
    completedFiles.current.clear()
    setReceivedFiles([])
  }

  const sendFile = async (file, targetUserId) => {
    const channel = dataChannels.get(targetUserId)
    if (!channel || channel.readyState !== 'open') {
      console.error('Data channel not ready for user:', targetUserId)
      return
    }

    const transferId = generateTransferId()
    
    setActiveTransfers(prev => new Map(prev.set(transferId, {
      id: transferId,
      type: 'sending',
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
      userId: targetUserId,
      status: 'active'
    })))

    const controller = { cancelled: false }
    activeTransferControllers.current.set(transferId, controller)

    try{
    const fileInfo = {
      type: 'file-start',
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      transferId: transferId
    }
    channel.send(JSON.stringify(fileInfo))

    const chunkSize = 16384 // 16KB
    let offset = 0

    const sendNextChunk = () => {
        if (controller.cancelled) {
          activeTransferControllers.current.delete(transferId)
          return
        }
        
        if (offset >= file.size) {
          try {
            channel.send(JSON.stringify({ 
              type: 'file-end',
              transferId: transferId 
            }))
          } catch (error) {
            console.error('Error sending file-end:', error)
          }
          
          setActiveTransfers(prev => {
            const newMap = new Map(prev)
            newMap.delete(transferId)
            return newMap
          })
          
          activeTransferControllers.current.delete(transferId)
          return
        }

        if (channel.bufferedAmount > MAX_BUFFERED_AMOUNT) {
          setTimeout(() => {
            if (!controller.cancelled) {
              sendNextChunk()
            }
          }, 100)
          return
        }

      const slice = file.slice(offset, offset + chunkSize)
      const reader = new FileReader()
      
      reader.onload = (e) => {
        if (controller.cancelled) return
        
        try {
           channel.send(JSON.stringify({
              type: 'file-chunk-header',
              transferId: transferId
            }))
            
            // Send binary data
            channel.send(e.target.result)
            offset += e.target.result.byteLength
            
            const progress = Math.min((offset / file.size) * 100, 100)
            
            // Update progress
            setActiveTransfers(prev => {
              const newMap = new Map(prev)
              const transfer = newMap.get(transferId)
              if (transfer) {
                newMap.set(transferId, { ...transfer, progress })
              }
              return newMap
            })
            
            // Continue with next chunk
            if (offset < file.size && !controller.cancelled) {
              setTimeout(sendNextChunk, 10)
            } else if (offset >= file.size) {
              // Send completion message
              channel.send(JSON.stringify({ 
                type: 'file-end',
                transferId: transferId 
              }))
              
              setActiveTransfers(prev => {
                const newMap = new Map(prev)
                newMap.delete(transferId)
                return newMap
              })
              
              activeTransferControllers.current.delete(transferId)
            }
        } catch (error) {
          console.error('Error sending chunk:', error)
          controller.cancelled = true
          activeTransferControllers.current.delete(transferId)
          setActiveTransfers(prev => {
            const newMap = new Map(prev)
            newMap.delete(transferId)
            return newMap
          })
        }
      }
      
      reader.onerror = (error) => {
        console.error('FileReader error:', error)
        controller.cancelled = true
        activeTransferControllers.current.delete(transferId)
      }
      
      reader.readAsArrayBuffer(slice)
    }
    sendNextChunk()
    }catch(error){
      console.error('Error starting file transfer:', error)
      activeTransferControllers.current.delete(transferId)
      setActiveTransfers(prev => {
        const newMap = new Map(prev)
        newMap.delete(transferId)
        return newMap
      })
    }
  }

  const connectToPeer = async (userId) => {
    try {
      console.log('Connecting to peer:', userId)
      
      // Don't create duplicate connections
      if (connections.has(userId)) {
        console.log('Connection already exists for:', userId)
        return
      }
      
      const peerConnection = createPeerConnection(userId)
      setConnections(prev => new Map(prev.set(userId, peerConnection)))
      
      const offer = await peerConnection.createOffer({
        offerToReceiveAudio: false,
        offerToReceiveVideo: false
      })
      
      await peerConnection.setLocalDescription(offer)
      
      if (socket) {
        console.log('Sending offer to:', userId)
        socket.emit('offer', {
          target: userId,
          offer: offer
        })
      }
    } catch (error) {
      console.error('Error connecting to peer:', userId, error)
    }
  }

  const handleOffer = async (offer, senderId) => {
    try {
      console.log('Handling offer from:', senderId)
      
      let peerConnection = connections.get(senderId)
      if (!peerConnection) {
        peerConnection = createPeerConnection(senderId)
        setConnections(prev => new Map(prev.set(senderId, peerConnection)))
      }
      
      await peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
      
      const answer = await peerConnection.createAnswer()
      await peerConnection.setLocalDescription(answer)
      
      if (socket) {
        console.log('Sending answer to:', senderId)
        socket.emit('answer', {
          target: senderId,
          answer: answer
        })
      }
    } catch (error) {
      console.error('Error handling offer from:', senderId, error)
    }
  }

  const handleAnswer = async (answer, senderId) => {
    try {
      console.log('Handling answer from:', senderId)
      const peerConnection = connections.get(senderId)
      if (peerConnection) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
      } else {
        console.error('No peer connection found for:', senderId)
      }
    } catch (error) {
      console.error('Error handling answer from:', senderId, error)
    }
  }

  const handleIceCandidate = async (candidate, senderId) => {
    try {
      const peerConnection = connections.get(senderId)
      if (peerConnection) {
        if (peerConnection.remoteDescription) {
          await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
          console.log('Added ICE candidate from:', senderId)
        } else {
          console.log('Queueing ICE candidate from:', senderId, '(no remote description yet)')
          // Queue for later
          setTimeout(async () => {
            if (peerConnection.remoteDescription) {
              try {
                await peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
                console.log('Added queued ICE candidate from:', senderId)
              } catch (err) {
                console.error('Error adding queued ICE candidate:', err)
              }
            }
          }, 1000)
        }
      } else {
        console.error('No peer connection found for ICE candidate from:', senderId)
      }
    } catch (error) {
      console.error('Error handling ICE candidate from:', senderId, error)
    }
  }

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('Cleaning up WebRTC connections')
    connections.forEach((connection) => {
      connection.close()
    })
    setConnections(new Map())
    setDataChannels(new Map())
    setActiveTransfers(new Map())
    
    // Clear all refs
    receivedBuffers.current.clear()
    receivedSize.current.clear()
    fileMetadata.current.clear()
    activeTransferControllers.current.clear()
    currentSendingTransfer.current.clear()
  }, [connections])

  return {
    connections,
    dataChannels,
    activeTransfers,
    receivedFiles,
    sendFile,
    cancelTransfer,
    connectToPeer,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    downloadReceivedFile,
    deleteReceivedFile,
    clearAllReceivedFiles,
    cleanup
  }
}
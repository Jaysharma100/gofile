import { useState, useRef, useCallback } from 'react'

const MAX_BUFFERED_AMOUNT = 1024 * 1024 // 1MB
const BUFFER_THRESHOLD = 512 * 1024 // 512KB

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]
}

export const useWebRTC = (socket,roomId)=>{
  const [connections, setConnections] = useState(new Map())
  const [dataChannels, setDataChannels] = useState(new Map())
  const [activeTransfers, setActiveTransfers] = useState(new Map())
  const [receivedFiles, setReceivedFiles] = useState([]) // List of received files
  
  const receivedBuffers = useRef(new Map())
  const receivedSize = useRef(new Map())
  const fileMetadata = useRef(new Map()) // Store file metadata per user
  const completedFiles = useRef(new Map()) // Store completed file blobs
  const activeTransferControllers = useRef(new Map())
  // Add this to track which transfer is currently being sent to each user
  const currentSendingTransfer = useRef(new Map()) // userId -> transferId

  const createPeerConnection = useCallback((userId) => {
    const peerConnection = new RTCPeerConnection(ICE_SERVERS)
    
    // Create data channel for file transfer
    const dataChannel = peerConnection.createDataChannel('fileTransfer', {
      ordered: true,
      maxRetransmits: 3
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

  const generateTransferId = () => {
    return `transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

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
        const transferId = message.transferId;
        const fileInfo = {
          name: message.fileName,
          size: message.fileSize,
          type: message.fileType,
          transferId: transferId,
          sender: userId
        }
        
        // Store file metadata for this user
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

      }else if (message.type === 'file-chunk-header') {
        // This message tells us which transfer the next binary chunk belongs to
        currentSendingTransfer.current.set(userId, message.transferId)
        
      }else if (message.type === 'file-end') {
        const transferId = message.transferId
        const buffers = receivedBuffers.current.get(transferId)
        const metadata = fileMetadata.current.get(transferId)
        
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
          receivedBuffers.current.delete(transferId)
          receivedSize.current.delete(transferId)
          fileMetadata.current.delete(transferId)
          currentSendingTransfer.current.delete(userId)
          
          // Remove from active transfers
          setActiveTransfers(prev => {
            const newMap = new Map(prev)
            newMap.delete(transferId)
            return newMap
          })
        }
      } else if (message.type === 'file-cancel') {
        const transferId = message.transferId
        
        // Cleanup receiving transfer
        receivedBuffers.current.delete(transferId)
        receivedSize.current.delete(transferId)
        fileMetadata.current.delete(transferId)
        
        // Update active transfers
        setActiveTransfers(prev => {
          const newMap = new Map(prev)
          const transfer = newMap.get(transferId)
          if (transfer) {
            newMap.set(transferId, { ...transfer, status: 'cancelled' })
            // Remove after a short delay to show cancelled status
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
        
      } else if (message.type === 'progress-update') {
        const transferId = message.transferId
        const progress = message.progress
        
        // Update sending progress
        setActiveTransfers(prev => {
          const newMap = new Map(prev)
          const transfer = newMap.get(transferId)
          if (transfer && transfer.type === 'sending') {
            newMap.set(transferId, { ...transfer, progress })
          }
          return newMap
        })
      }
    } else {
      // Binary data (file chunk)
      // Get the correct transfer ID from the header message
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
          
          // Update progress for the specific transfer
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
    
    // Cancel the transfer controller if it's a sending transfer
    const controller = activeTransferControllers.current.get(transferId)
    if (controller) {
      controller.cancelled = true
      activeTransferControllers.current.delete(transferId)
    }
    
    // Send cancel message to peer
    const channel = dataChannels.get(transfer.userId)
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify({
        type: 'file-cancel',
        transferId: transferId
      }))
    }
    
    // Update local state
    setActiveTransfers(prev => {
      const newMap = new Map(prev)
      const currentTransfer = newMap.get(transferId)
      if (currentTransfer) {
        newMap.set(transferId, { ...currentTransfer, status: 'cancelled' })
        // Remove after showing cancelled status
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
    
    // Cleanup if receiving
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
      
      // Mark as downloaded
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
      console.error('Data channel not ready')
      return
    }

    const transferId = generateTransferId()
    
    // Add to active transfers
    setActiveTransfers(prev => new Map(prev.set(transferId, {
      id: transferId,
      type: 'sending',
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
      userId: targetUserId,
      status: 'active'
    })))

    // Create transfer controller
    const controller = { cancelled: false }
    activeTransferControllers.current.set(transferId, controller)

    // Send file metadata
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
      if (controller.cancelled || offset >= file.size) {
        if (controller.cancelled) {
          // Transfer was cancelled
          activeTransferControllers.current.delete(transferId)
          return
        }
        
        if (offset >= file.size) {
          // Transfer complete
          channel.send(JSON.stringify({ 
            type: 'file-end',
            transferId: transferId 
          }))
          
          // Remove from active transfers
          setActiveTransfers(prev => {
            const newMap = new Map(prev)
            newMap.delete(transferId)
            return newMap
          })
          
          activeTransferControllers.current.delete(transferId)
        }
        return
      }

      // Check if buffer is getting full
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
          if (channel.bufferedAmount <= BUFFER_THRESHOLD) {
            // Send header before binary data to identify which transfer this chunk belongs to
            channel.send(JSON.stringify({
              type: 'file-chunk-header',
              transferId: transferId
            }))
            
            // Send the actual binary chunk
            channel.send(e.target.result)
            offset += e.target.result.byteLength
            
            // Update progress
            const progress = (offset / file.size) * 100
            setActiveTransfers(prev => {
              const newMap = new Map(prev)
              const transfer = newMap.get(transferId)
              if (transfer) {
                newMap.set(transferId, { ...transfer, progress })
              }
              return newMap
            })
            
            // Send progress update to receiver
            channel.send(JSON.stringify({
              type: 'progress-update',
              transferId: transferId,
              progress: progress
            }))
            
            if (offset < file.size && !controller.cancelled) {
              requestAnimationFrame(sendNextChunk)
            } else if (offset >= file.size) {
              // Transfer complete
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
          } else {
            setTimeout(() => {
              if (!controller.cancelled) {
                sendNextChunk()
              }
            }, 50)
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
        setActiveTransfers(prev => {
          const newMap = new Map(prev)
          newMap.delete(transferId)
          return newMap
        })
      }
      
      reader.readAsArrayBuffer(slice)
    }
    sendNextChunk()
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
    clearAllReceivedFiles
  }
}
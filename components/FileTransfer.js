import { useState, useEffect, useRef } from 'react'
import { useSocket } from '../hooks/useSocket'
import { useWebRTC } from '../hooks/useWebRTC'

const FileTransfer =() =>{
    const [roomId, setRoomId] = useState('')
    const [isInRoom, setIsInRoom] = useState(false)
    const [connectedUsers, setConnectedUsers] = useState([])

    const { socket, isConnected } = useSocket()

    const {
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
  } = useWebRTC(socket, roomId)

    const generateRoomId = () => {
        return Math.random().toString(36).substring(2, 8).toUpperCase()
    }

    const joinRoom = () => {
        if (socket && roomId.trim()) {
        socket.emit('join-room', roomId.trim())
        setIsInRoom(true)
        }
    }

    const leaveRoom = () => {
        setIsInRoom(false)
        setConnectedUsers([])
        setRoomId('')
    }

    const handleFileSelect = (file) => {
        setSelectedFile(file)
    }

    // Handle drag events
    const handleDragOver = (e) => {
        e.preventDefault()
        setDragOver(true)
    }

    const handleDragLeave = (e) => {
        e.preventDefault()
        setDragOver(false)
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setDragOver(false)
        const files = e.dataTransfer.files
        if (files.length > 0) {
        handleFileSelect(files[0])
        }
    }

    // Send file to specific user
    const sendFileToUser = (userId) => {
        if (selectedFile && dataChannels.has(userId)) {
        sendFile(selectedFile, userId)
        }
    }

    // Socket event listeners
    useEffect(() => {
        if (!socket) return

        socket.on('room-users', (users) => {
        setConnectedUsers(users)
        // Connect to existing users
        users.forEach(userId => {
            connectToPeer(userId)
        })
        })

        socket.on('user-joined', (userId) => {
        setConnectedUsers(prev => [...prev, userId])
        })

        socket.on('user-left', (userId) => {
        setConnectedUsers(prev => prev.filter(id => id !== userId))
        })

        socket.on('offer', ({ offer, sender }) => {
        handleOffer(offer, sender)
        })

        socket.on('answer', ({ answer, sender }) => {
        handleAnswer(answer, sender)
        })

        socket.on('ice-candidate', ({ candidate, sender }) => {
        handleIceCandidate(candidate, sender)
        })

        return () => {
        socket.off('room-users')
        socket.off('user-joined')
        socket.off('user-left')
        socket.off('offer')
        socket.off('answer')
        socket.off('ice-candidate')
        }
    }, [socket, connectToPeer, handleOffer, handleAnswer, handleIceCandidate])

    const formatFileSize = (bytes) => {
        if (bytes === 0) return '0 Bytes'
        const k = 1024
        const sizes = ['Bytes', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    const formatDate = (date) => {
        return new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        month: 'short',
        day: 'numeric'
        }).format(date)
    }

    const getFileIcon = (type) => {
        if (type.startsWith('image/')) return '🖼️'
        if (type.startsWith('video/')) return '🎥'
        if (type.startsWith('audio/')) return '🎵'
        if (type.includes('pdf')) return '📄'
        return '📁'
    }

    const getFileIconClass = (type) => {
        if (type.startsWith('image/')) return 'image'
        if (type.startsWith('video/')) return 'video'
        if (type.startsWith('audio/')) return 'audio'
        if (type.includes('pdf')) return 'pdf'
        return 'default'
    }

    if (!isConnected) {
        return (
        <div className="loading-screen">
            <div className="loading-content">
            <div className="spinner"></div>
            <p className="loading-text">Connecting to server...</p>
            </div>
        </div>
        )
    }

    return (
        <div className="file-transfer-container">
        <div className="header">
            <h1>P2P File Transfer</h1>
            <p>Share files directly between browsers using WebRTC</p>
        </div>

        {!isInRoom ? (
            <div className="card">
            <h2>Join or Create Room</h2>
            <div className="room-form">
                <input
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                placeholder="Enter Room ID"
                className="room-input"
                maxLength={6}
                />
                <button
                onClick={() => setRoomId(generateRoomId())}
                className="btn btn-secondary"
                >
                Generate
                </button>
                <button
                onClick={joinRoom}
                disabled={!roomId.trim()}
                className="btn btn-primary"
                >
                Join Room
                </button>
            </div>
            <p className="room-hint">
                Share the Room ID with others to start transferring files
            </p>
            </div>
        ) : (
            <div className="file-transfer-container">
                <div className="card">
                    <div className="room-info">
                    <div className="room-details">
                        <h2>Room: {roomId}</h2>
                        <p>
                        {connectedUsers.length} user{connectedUsers.length !== 1 ? 's' : ''} connected
                        </p>
                    </div>
                    <button
                        onClick={leaveRoom}
                        className="btn btn-danger"
                    >
                        Leave Room
                    </button>
                    </div>
                </div>

                <div className="card">
                    <h3>Select File to Send</h3>
                    <div
                    className={`file-drop-zone ${dragOver ? 'drag-over' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    >
                    {selectedFile ? (
                        <div className="selected-file">
                        <h4>{selectedFile.name}</h4>
                        <p>{formatFileSize(selectedFile.size)}</p>
                        <button
                            onClick={() => setSelectedFile(null)}
                            className="remove-file-btn"
                        >
                            Remove
                        </button>
                        </div>
                    ) : (
                        <div>
                        <div className="file-hint">
                            Drag and drop a file here or click to select
                        </div>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="btn btn-primary"
                        >
                            Choose File
                        </button>
                        </div>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        onChange={(e) => e.target.files[0] && handleFileSelect(e.target.files[0])}
                        className="file-input"
                    />
                    </div>
                </div>

                <div className="card">
                    <h3>Connected Users</h3>
                    {connectedUsers.length === 0 ? (
                    <p className="no-users">No other users in the room</p>
                    ) : (
                    <div className="user-list">
                        {connectedUsers.map((userId) => (
                        <div key={userId} className="user-item">
                            <div className="user-info">
                            <div className="user-avatar">
                                {userId.slice(-2).toUpperCase()}
                            </div>
                            <div className="user-details">
                                <h4>User {userId.slice(-4)}</h4>
                                <div className="user-status">
                                {dataChannels.has(userId) ? '🟢 Connected' : '🟡 Connecting...'}
                                </div>
                            </div>
                            </div>
                            <button
                            onClick={() => sendFileToUser(userId)}
                            disabled={!selectedFile || !dataChannels.has(userId)}
                            className="btn btn-success"
                            >
                            Send File
                            </button>
                        </div>
                        ))}
                    </div>
                    )}
                </div>
                {/* recive logic soon */}
            </div>
            )}
        </div>
    )
}
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
                className="btn"
                >
                Generate
                </button>
                <button
                onClick={joinRoom}
                disabled={!roomId.trim()}
                className="btn"
                >
                Join Room
                </button>
            </div>
            <p className="room-hint">
                Share the Room ID with others to start transferring files
            </p>
            </div>
        ) : (
            <div className="filetransfersection">
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
            </div>
            )}
        </div>
    )
}
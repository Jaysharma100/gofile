import { useState, useEffect, useRef } from 'react'
import { useSocket } from '../hooks/useSocket'

const FileTransfer =() =>{
    const [roomId, setRoomId] = useState('')
    const [isInRoom, setIsInRoom] = useState(false)
    const [connectedUsers, setConnectedUsers] = useState([])

    const { socket, isConnected } = useSocket()

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
                file transfer will happen here.
            </div>
            )}
        </div>
    )
}
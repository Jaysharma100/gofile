import { useState, useEffect, useRef } from 'react'
import { useSocket } from '../hooks/useSocket'
import { useWebRTC } from '../hooks/useWebRTC'
import pic from '../public/image.png'
import Image from 'next/image'

import {
    WhatsappShareButton,
    TelegramShareButton,
    EmailShareButton,
    TwitterShareButton,
    FacebookShareButton,
    LinkedinShareButton,
    WhatsappIcon,
    TelegramIcon,
    EmailIcon,
    TwitterIcon,
    FacebookIcon,
    LinkedinIcon
} from 'react-share'

const FileTransfer =() =>{
    const [roomId, setRoomId] = useState('')
    const [userName, setUserName] = useState('')
    const [isInRoom, setIsInRoom] = useState(false)
    const [connectedUsers, setConnectedUsers] = useState([])
    const [selectedFile, setSelectedFile] = useState(null)
    const [showShareModal, setShowShareModal] = useState(false)
    const [shareLink, setShareLink] = useState('')
    const [linkCopied, setLinkCopied] = useState(false)
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef(null)
    const { socket, isConnected } = useSocket()

    const {
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
    } = useWebRTC(socket, roomId)

    const generateGuestName = () => {
        const randomString = Math.random().toString(36).substring(2, 8).toUpperCase()
        return `Guest-${randomString}`
    }
    useEffect(() => {
        if (!userName) {
            setUserName(generateGuestName())
        }
    }, [userName])

    const getUserName = (userId) => {
        const user = connectedUsers.find(u => u.id === userId)
        return user ? user.name : `User ${userId.slice(-4)}`
    }


    const generateRoomId = () => {
        return Math.random().toString(36).substring(2, 8).toUpperCase()
    }

    const joinRoom = () => {
        if (socket && roomId.trim()) {
            const finalUserName = userName.trim() || generateGuestName()
            setUserName(finalUserName)
            
            socket.emit('join-room', {
                roomId: roomId.trim(),
                userName: finalUserName
            })
            setIsInRoom(true)
        }
    }

    const leaveRoom = () => {
        setIsInRoom(false)
        setConnectedUsers([])
        setRoomId('')
    }

    const generateShareLink = () => {
        const baseUrl = window.location.origin
        const shareUrl = `${baseUrl}/?room=${roomId}`
        setShareLink(shareUrl)
        setShowShareModal(true)
        setLinkCopied(false)
    }

    const copyShareLink = async () => {
        try {
            await navigator.clipboard.writeText(shareLink)
            setLinkCopied(true)
            setTimeout(() => setLinkCopied(false), 2000)
        } catch (err) {
            console.error('Failed to copy link:', err)
            const textArea = document.createElement('textarea')
            textArea.value = shareLink
            document.body.appendChild(textArea)
            textArea.select()
            document.execCommand('copy')
            document.body.removeChild(textArea)
            setLinkCopied(true)
            setTimeout(() => setLinkCopied(false), 2000)
        }
    }

    const closeShareModal = () => {
        setShowShareModal(false)
        setLinkCopied(false)
    }

    const handleFileSelect = (file) => {
        setSelectedFile(file)
    }

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
        users.forEach(user => {
            connectToPeer(user.id)
        })
        })

        socket.on('user-joined', (user) => {
        setConnectedUsers(prev => [...prev, user])
        })

        socket.on('user-left', (user) => {
        setConnectedUsers(prev => prev.filter(id => id !== user))
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
    //transfers arrays
    const sendingTransfers = Array.from(activeTransfers.values()).filter(t => t.type === 'sending')
    const receivingTransfers = Array.from(activeTransfers.values()).filter(t => t.type === 'receiving')

    const shareTitle = `Join my file transfer room (${roomId})`
    const shareDescription = `Click this link to join my secure file transfer room and share files instantly! Room ID: ${roomId}`

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
            <Image src={pic} alt="GoFile" className='logo' />
            <p>Share files directly between browsers using WebRTC</p>
        </div>

        {!isInRoom ? (
            <div className="card">
            <h2>Join or Create Room</h2>
            <div className="room-form">
                <input
                    type="text"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    placeholder={generateGuestName()}
                    className="name-input"
                    maxLength={20}
                />
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
                Enter your name and share the Room ID with others to start transferring files
            </p>
            </div>
        ) : (
            <div className="file-transfer-container">
                <div className="card">
                    <div className="room-info">
                        <div className="room-details">
                            <h2>Room: {roomId}</h2>
                            <p className="user-info">You are: <strong>{userName}</strong></p>
                            <p>
                            {connectedUsers.length} user{connectedUsers.length !== 1 ? 's' : ''} connected
                            </p>
                        </div>
                        <div className="room-actions">
                            <button
                                onClick={generateShareLink}
                                className="btn btn-share"
                                title="Share room link"
                            >
                                🔗 Share Room
                            </button>
                            <button
                                onClick={leaveRoom}
                                className="btn btn-danger"
                            >
                                Leave Room
                            </button>
                        </div>
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
                            {connectedUsers.map((user) => (
                                <div key={user.id} className="user-item">
                                    <div className="user-info">
                                        <div className="user-avatar">
                                            {user.name.slice(0, 2).toUpperCase()}
                                        </div>
                                        <div className="user-details">
                                            <h4>{user.name}</h4>
                                            <div className="user-status">
                                                {dataChannels.has(user.id) ? '🟢 Connected' : '🟡 Connecting...'}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => sendFileToUser(user.id)}
                                        disabled={!selectedFile || !dataChannels.has(user.id)}
                                        className="btn btn-success"
                                    >
                                        Send File
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {sendingTransfers.length > 0 && (
                    <div className="card">
                        <h3>Sending Files ({sendingTransfers.length})</h3>
                        <div className="transfer-list">
                            {sendingTransfers.map((transfer) => (
                                <div key={transfer.id} className="transfer-item sending">
                                    <div className="transfer-info">
                                        <div className="transfer-header">
                                            <div className="transfer-details">
                                                <span className="transfer-name">
                                                    📤 {transfer.fileName}
                                                </span>
                                                <span className="transfer-target">
                                                    to {getUserName(transfer.userId)}
                                                </span>
                                            </div>
                                            <div className="transfer-actions">
                                                <span className="transfer-progress">
                                                    {Math.round(transfer.progress)}%
                                                </span>
                                                <button
                                                    onClick={() => cancelTransfer(transfer.id)}
                                                    className="btn btn-cancel"
                                                    disabled={transfer.status === 'cancelled'}
                                                    title="Cancel transfer"
                                                >
                                                    {transfer.status === 'cancelled' ? '❌' : '❌'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="transfer-meta">
                                            <span>{formatFileSize(transfer.fileSize)}</span>
                                            <span className={`transfer-status ${transfer.status}`}>
                                                {transfer.status === 'cancelled' ? 'Cancelled' : 
                                                    transfer.progress === 100 ? 'Completed' : 'Sending...'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="progress-bar">
                                        <div
                                            className={`progress-fill sending ${transfer.status === 'cancelled' ? 'cancelled' : ''}`}
                                            style={{ width: `${transfer.progress}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Receiving Transfers */}
                {receivingTransfers.length > 0 && (
                    <div className="card">
                        <h3>Receiving Files ({receivingTransfers.length})</h3>
                        <div className="transfer-list">
                            {receivingTransfers.map((transfer) => (
                                <div key={transfer.id} className="transfer-item receiving">
                                    <div className="transfer-info">
                                        <div className="transfer-header">
                                            <div className="transfer-details">
                                                <span className="transfer-name">
                                                    📥 {transfer.fileName}
                                                </span>
                                                <span className="transfer-source">
                                                    from {getUserName(transfer.userId)}
                                                </span>
                                            </div>
                                            <div className="transfer-actions">
                                                <span className="transfer-progress">
                                                    {Math.round(transfer.progress)}%
                                                </span>
                                                <button
                                                    onClick={() => cancelTransfer(transfer.id)}
                                                    className="btn btn-cancel"
                                                    disabled={transfer.status === 'cancelled'}
                                                    title="Cancel transfer"
                                                >
                                                    {transfer.status === 'cancelled' ? '❌' : '❌'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="transfer-meta">
                                            <span>{formatFileSize(transfer.fileSize)}</span>
                                            <span className={`transfer-status ${transfer.status}`}>
                                                {transfer.status === 'cancelled' ? 'Cancelled' : 
                                                    transfer.progress === 100 ? 'Completed' : 'Receiving...'}
                                            </span>
                                        </div>
                                    </div>
                                    <div className="progress-bar">
                                        <div
                                            className={`progress-fill receiving ${transfer.status === 'cancelled' ? 'cancelled' : ''}`}
                                            style={{ width: `${transfer.progress}%` }}
                                        ></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {receivedFiles.length > 0 && (
                        <div className="card">
                            <div className="received-files-header">
                                <h3>Received Files ({receivedFiles.length})</h3>
                                <button
                                    onClick={clearAllReceivedFiles}
                                    className="btn btn-sm btn-secondary"
                                >
                                    Clear All
                                </button>
                            </div>
                            <div className="received-files-list">
                                {receivedFiles.map((file) => (
                                    <div key={file.id} className="received-file-item">
                                        <div className="file-info">
                                            <div className={`file-icon ${getFileIconClass(file.type)}`}>
                                                {getFileIcon(file.type)}
                                            </div>
                                            <div className="file-details">
                                                <div className="file-name">{file.name}</div>
                                                <div className="file-meta">
                                                    {formatFileSize(file.size)} • From {getUserName(file.sender)} • {formatDate(file.receivedAt)}
                                                </div>
                                                {file.downloaded && (
                                                    <div className="file-downloaded">✓ Downloaded</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="file-actions">
                                            <button
                                                onClick={() => downloadReceivedFile(file.id)}
                                                className={`btn btn-download ${file.downloaded ? 'downloaded' : ''}`}
                                            >
                                                {file.downloaded ? 'Download Again' : 'Download'}
                                            </button>
                                            <button
                                                onClick={() => deleteReceivedFile(file.id)}
                                                className="delete-btn"
                                                title="Delete file"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {showShareModal && (
                <div className="modal-overlay" onClick={closeShareModal}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Share Room Link</h3>
                            <button className="modal-close" onClick={closeShareModal}>
                                ✕
                            </button>
                        </div>
                        <div className="modal-body">
                            <p>Share this link with others to invite them to your room:</p>
                            <div className="share-link-container">
                                <input
                                    type="text"
                                    value={shareLink}
                                    readOnly
                                    className="share-link-input"
                                />
                                <button
                                    onClick={copyShareLink}
                                    className={`btn ${linkCopied ? 'btn-success' : 'btn-primary'}`}
                                >
                                    {linkCopied ? '✓ Copied!' : '📋 Copy'}
                                </button>
                            </div>
                            <div className="social-share-section">
                                <h4>Share via:</h4>
                                <div className="social-share-buttons">
                                    <WhatsappShareButton
                                        url={shareLink}
                                        title={shareDescription}
                                        className="social-share-button"
                                    >
                                        <WhatsappIcon size={40} round />
                                        <span>WhatsApp</span>
                                    </WhatsappShareButton>

                                    <TelegramShareButton
                                        url={shareLink}
                                        title={shareDescription}
                                        className="social-share-button"
                                    >
                                        <TelegramIcon size={40} round />
                                        <span>Telegram</span>
                                    </TelegramShareButton>

                                    <EmailShareButton
                                        url={shareLink}
                                        subject={shareTitle}
                                        body={shareDescription}
                                        className="social-share-button"
                                    >
                                        <EmailIcon size={40} round />
                                        <span>Email</span>
                                    </EmailShareButton>

                                    <TwitterShareButton
                                        url={shareLink}
                                        title={shareDescription}
                                        className="social-share-button"
                                    >
                                        <TwitterIcon size={40} round />
                                        <span>Twitter</span>
                                    </TwitterShareButton>

                                    <FacebookShareButton
                                        url={shareLink}
                                        quote={shareDescription}
                                        className="social-share-button"
                                    >
                                        <FacebookIcon size={40} round />
                                        <span>Facebook</span>
                                    </FacebookShareButton>

                                    <LinkedinShareButton
                                        url={shareLink}
                                        title={shareTitle}
                                        summary={shareDescription}
                                        className="social-share-button"
                                    >
                                        <LinkedinIcon size={40} round />
                                        <span>LinkedIn</span>
                                    </LinkedinShareButton>
                                </div>
                            </div>
                            <p className="share-hint">
                                When someone clicks this link, they will be taken to your room and can join instantly!
                            </p>
                        </div>
                    </div>
                </div>
            )}

        <div className="footer">
            <div className="footer-content">
                <div className="footer-text">
                <span>Made by</span>
                <strong>Jay Sharma</strong>
                </div>
                <div className="footer-links">
                <a 
                    href="https://github.com/jaysharma100/gofile" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="footer-link github"
                >
                    GitHub
                </a>
                <a 
                    href="https://www.linkedin.com/in/jaysharma100/" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="footer-link linkedin"
                >
                    LinkedIn
                </a>
                </div>
            </div>
            </div>
        </div>
    )
}

export default FileTransfer
import { Server } from 'socket.io'

const SocketHandler = (req, res) => {
  if (res.socket.server.io) {
    console.log('Socket is already running')
  } else {
    console.log('Socket is initializing')
    const io = new Server(res.socket.server, {
      path: '/api/socket',
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    })
    res.socket.server.io = io

    const rooms = new Map()
    const userNames = new Map()

    io.on('connection', (socket) => {
      console.log('New client connected:', socket.id)

      socket.on('join-room', (data) => {
        const roomId = typeof data === 'string' ? data : data.roomId
        const userName = typeof data === 'string' ? `User-${socket.id.slice(-4)}` : data.userName
        
        socket.join(roomId)
        userNames.set(socket.id, userName)
        
        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Set())
        }

        const userObj = { id: socket.id, name: userName }
        rooms.get(roomId).add(JSON.stringify(userObj))

        socket.to(roomId).emit('user-joined', userObj)

        const usersInRoom = Array.from(rooms.get(roomId))
          .map(userStr => JSON.parse(userStr))
          .filter(user => user.id !== socket.id)

        socket.emit('room-users', usersInRoom)
        console.log(`User ${userName} (${socket.id}) joined room ${roomId}`)
      })

      // WebRTC signaling
      socket.on('offer', (data) => {
        socket.to(data.target).emit('offer', {
          offer: data.offer,
          sender: socket.id
        })
      })

      socket.on('answer', (data) => {
        socket.to(data.target).emit('answer', {
          answer: data.answer,
          sender: socket.id
        })
      })

      socket.on('ice-candidate', (data) => {
        socket.to(data.target).emit('ice-candidate', {
          candidate: data.candidate,
          sender: socket.id
        })
      })

      socket.on('file-offer', (data) => {
        socket.to(data.target).emit('file-offer', {
          fileName: data.fileName,
          fileSize: data.fileSize,
          fileType: data.fileType,
          sender: socket.id,
          senderName: userNames.get(socket.id)
        })
      })

      socket.on('file-answer', (data) => {
        socket.to(data.target).emit('file-answer', {
          accepted: data.accepted,
          sender: socket.id
        })
      })
      

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id)
        
        const userName = userNames.get(socket.id)
        userNames.delete(socket.id)

        rooms.forEach((users, roomId) => {
          const userObj = JSON.stringify({ id: socket.id, name: userName })
          if (users.has(userObj)) {
            users.delete(userObj)
            if (users.size === 0) {
              rooms.delete(roomId)
            } else {
              socket.to(roomId).emit('user-left', socket.id)
            }
          }
        })
      })
    })
  }
  res.end()
}

export default SocketHandler
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

    io.on('connection', (socket) => {
      console.log('New client connected:', socket.id)

      socket.on('join-room', (roomId) => {
        socket.join(roomId)
        
        if (!rooms.has(roomId)) {
          rooms.set(roomId, new Set())
        }
        rooms.get(roomId).add(socket.id)

        socket.to(roomId).emit('user-joined', socket.id)

        const usersInRoom = Array.from(rooms.get(roomId))
        socket.emit('room-users', usersInRoom.filter(id => id !== socket.id))
        
        console.log(`User ${socket.id} joined room ${roomId}`)
      })

      

      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id)
        
        rooms.forEach((users, roomId) => {
          if (users.has(socket.id)) {
            users.delete(socket.id)
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
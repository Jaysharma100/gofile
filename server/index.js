const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

const rooms = new Map();
const userNames = new Map();

io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join-room', (data) => {
    const roomId = typeof data === 'string' ? data : data.roomId;
    const userName = typeof data === 'string' ? `User-${socket.id.slice(-4)}` : data.userName;

    socket.join(roomId);
    userNames.set(socket.id, userName);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }

    const userObj = { id: socket.id, name: userName };
    rooms.get(roomId).add(JSON.stringify(userObj));

    socket.to(roomId).emit('user-joined', userObj);

    const usersInRoom = Array.from(rooms.get(roomId))
      .map(userStr => JSON.parse(userStr))
      .filter(user => user.id !== socket.id);

    socket.emit('room-users', usersInRoom);
    console.log(`User ${userName} (${socket.id}) joined room ${roomId}`);
  });

  // WebRTC and file signaling
  socket.on('offer', data => socket.to(data.target).emit('offer', { ...data, sender: socket.id }));
  socket.on('answer', data => socket.to(data.target).emit('answer', { ...data, sender: socket.id }));
  socket.on('ice-candidate', data => socket.to(data.target).emit('ice-candidate', { ...data, sender: socket.id }));
  socket.on('file-offer', data => socket.to(data.target).emit('file-offer', { ...data, sender: socket.id, senderName: userNames.get(socket.id) }));
  socket.on('file-answer', data => socket.to(data.target).emit('file-answer', { ...data, sender: socket.id }));

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    const userName = userNames.get(socket.id);
    userNames.delete(socket.id);

    rooms.forEach((users, roomId) => {
      const userObj = JSON.stringify({ id: socket.id, name: userName });
      if (users.has(userObj)) {
        users.delete(userObj);
        if (users.size === 0) {
          rooms.delete(roomId);
        } else {
          socket.to(roomId).emit('user-left', socket.id);
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => console.log(`WebSocket server listening on port ${PORT}`));

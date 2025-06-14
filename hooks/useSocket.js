import { useEffect, useState } from 'react'
import { io } from 'socket.io-client'

let socket

export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const socketInitializer = async () => {
      await fetch('/api/socket')
      socket = io({
        path: '/api/socket',
      })

      socket.on('connect', () => {
        console.log('Connected to server')
        setIsConnected(true)
      })

      socket.on('disconnect', () => {
        console.log('Disconnected from server')
        setIsConnected(false)
      })
    }

    if (!socket) {
      socketInitializer()
    }

    return () => {
      if (socket) {
        socket.disconnect()
        socket = null
      }
    }
  }, [])

  return { socket, isConnected }
}
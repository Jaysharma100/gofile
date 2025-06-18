import { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'

export const useSocket = () => {
  const [isConnected, setIsConnected] = useState(false)
  const socketRef = useRef(null)
  const reconnectTimeoutRef = useRef(null)

  useEffect(() => {
    const connectSocket = () => {
      if (socketRef.current?.connected) {
        return // Already connected
      }

      console.log('Initializing socket connection...')
      socketRef.current = io('https://gofile-x1mf.onrender.com', {
        path: '/socket.io',
        transports: ['websocket', 'polling'], // Allow fallback to polling
        timeout: 20000,
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        maxReconnectionAttempts: 5
      })

      socketRef.current.on('connect', () => {
        console.log('✅ Connected to server with ID:', socketRef.current.id)
        setIsConnected(true)
        
        // Clear any reconnection timeout
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current)
          reconnectTimeoutRef.current = null
        }
      })

      socketRef.current.on('disconnect', (reason) => {
        console.log('❌ Disconnected from server. Reason:', reason)
        setIsConnected(false)
        
        // Attempt to reconnect after a delay if not a manual disconnect
        if (reason !== 'io client disconnect') {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log('Attempting to reconnect...')
            if (socketRef.current && !socketRef.current.connected) {
              socketRef.current.connect()
            }
          }, 2000)
        }
      })

      socketRef.current.on('connect_error', (error) => {
        console.error('❌ Connection error:', error.message)
        setIsConnected(false)
      })

      socketRef.current.on('reconnect', (attemptNumber) => {
        console.log(`✅ Reconnected after ${attemptNumber} attempts`)
        setIsConnected(true)
      })

      socketRef.current.on('reconnect_error', (error) => {
        console.error('❌ Reconnection error:', error.message)
      })

      socketRef.current.on('reconnect_failed', () => {
        console.error('❌ Failed to reconnect after maximum attempts')
        setIsConnected(false)
      })
    }

    connectSocket()

    // Cleanup function
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      
      if (socketRef.current) {
        console.log('Cleaning up socket connection')
        socketRef.current.disconnect()
        socketRef.current = null
      }
      setIsConnected(false)
    }
  }, [])

  return { 
    socket: socketRef.current, 
    isConnected 
  }
}
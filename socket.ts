import { io, type Socket } from "socket.io-client"

class SocketManager {
  private socket: Socket | null = null
  private url: string

  constructor(url: string) {
    this.url = url
  }

  connect(token?: string) {
    if (this.socket?.connected) {
      return this.socket
    }

    this.socket = io(this.url, {
      auth: {
        token,
      },
      transports: ["websocket", "polling"],
    })

    this.socket.on("connect", () => {
      console.log("Connected to server")
    })

    this.socket.on("disconnect", () => {
      console.log("Disconnected from server")
    })

    this.socket.on("error", (error) => {
      console.error("Socket error:", error)
    })

    return this.socket
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect()
      this.socket = null
    }
  }

  emit(event: string, data: any) {
    if (this.socket?.connected) {
      this.socket.emit(event, data)
    }
  }

  on(event: string, callback: (data: any) => void) {
    if (this.socket) {
      this.socket.on(event, callback)
    }
  }

  off(event: string, callback?: (data: any) => void) {
    if (this.socket) {
      this.socket.off(event, callback)
    }
  }

  getSocket() {
    return this.socket
  }
}

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000"
export const socketManager = new SocketManager(SOCKET_URL)
export default socketManager

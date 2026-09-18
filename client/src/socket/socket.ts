import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function connectSocket() {
  if (!socket) {
    socket = io(import.meta.env.VITE_API_URL, {
      transports: ["websocket"],
      withCredentials: true,
    });
  }
  return socket;
}

export function getSocket() {
  if (!socket) throw new Error("Socket not connected");
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}

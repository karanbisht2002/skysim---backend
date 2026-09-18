import type { Server, Socket } from "socket.io";

export function registerSocketEvents(io: Server, socket: Socket) {
 
  socket.on("join_ticket", ({ ticketId }) => {
  socket.join(`ticket:${ticketId}`);
  console.log(`📥 ${socket.id} joined ticket:${ticketId}`);
});

socket.on("leave_ticket", ({ ticketId }) => {
  socket.leave(`ticket:${ticketId}`);
  console.log(`📤 ${socket.id} left ticket:${ticketId}`);
});

  socket.on("ping", () => {
    socket.emit("pong");
  });
}

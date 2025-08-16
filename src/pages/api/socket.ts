//src/pages/api/socket.ts
// src/pages/api/socket.ts
import { Server as SocketIOServer } from "socket.io";
import type { NextApiRequest, NextApiResponse } from "next";

type NextApiResponseWithSocket = NextApiResponse & {
  socket: {
    server: {
      io?: SocketIOServer;
    };
  };
};

const socketHandler = (req: NextApiRequest, res: NextApiResponseWithSocket) => {
  if (res.socket.server.io) {
    console.log("Socket is already running");
    return res.end();
  }

  console.log("Starting Socket.IO server...");
  const io = new SocketIOServer(res.socket.server as any, {
    path: "/api/socket.io",
    addTrailingSlash: false,
  });

  res.socket.server.io = io;

  io.on("connection", (socket) => {
    console.log("Client connected:", socket.id);

    socket.on("join", ({ roomId }: { roomId: string }) => {
      socket.join(roomId);
      const clients = io.sockets.adapter.rooms.get(roomId) || new Set();
      socket.to(roomId).emit("peer-joined", { socketId: socket.id });
      socket.emit("peers-in-room", {
        peers: Array.from(clients).filter((id) => id !== socket.id),
      });
    });

    socket.on("signal", ({ roomId, to, data }) => {
      if (to) {
        io.to(to).emit("signal", { from: socket.id, data });
      } else {
        socket.to(roomId).emit("signal", { from: socket.id, data });
      }
    });

    socket.on("leave", ({ roomId }: { roomId: string }) => {
      socket.leave(roomId);
      socket.to(roomId).emit("peer-left", { socketId: socket.id });
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
    });
  });

  return res.end();
};

export default socketHandler;

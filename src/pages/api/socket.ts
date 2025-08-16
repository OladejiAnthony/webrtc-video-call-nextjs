//src/pages/api/socket.ts
import { Server as SocketIOServer } from "socket.io";
import type { NextApiRequest, NextApiResponse } from "next";

export const config = {
  api: {
    bodyParser: false,
  },
};

type NextApiResponseWithSocket = NextApiResponse & {
  socket: {
    server: {
      io?: SocketIOServer;
    };
  };
};

const socketHandler = (req: NextApiRequest, res: NextApiResponseWithSocket) => {
  if (!res.socket) {
    console.log("No socket available");
    return res.status(500).end();
  }

  if (!res.socket?.server?.io) {
    console.log("Starting Socket.IO server...");
    const io = new SocketIOServer(res.socket.server as any, {
      path: "/api/socket.io",
      addTrailingSlash: false,
      cors: {
        origin: process.env.NEXT_PUBLIC_VERCEL_URL
          ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
          : "http://localhost:3000",
        methods: ["GET", "POST"],
      },
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
  } else {
    console.log("Socket is already running");
  }

  res.end();
};

export default socketHandler;

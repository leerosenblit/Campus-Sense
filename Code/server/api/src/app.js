import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { createServer } from "http";
import { Server } from "socket.io";

import authRoutes from "./routes/auth.js";
import roomRoutes from "./routes/rooms.js";
import ticketRoutes from "./routes/tickets.js";
import analyticsRoutes from "./routes/analytics.js";
import internalRoutes from "./routes/internal.js";

/** Build the Express app + Socket.IO server WITHOUT listening, so tests can use it
 *  directly (supertest) and index.js can listen on a real port. */
export function createApp() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: "*" } });

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));

  // Rate-limit the unauthenticated student ticket form per IP (book §4.5.3).
  const ticketLimiter = rateLimit({ windowMs: 60_000, max: 20 });

  app.use("/auth", authRoutes);
  app.use("/rooms", roomRoutes);
  app.use("/tickets", ticketLimiter, ticketRoutes(io));
  app.use("/analytics", analyticsRoutes);
  app.use("/internal", internalRoutes(io)); // engine -> server (loopback only in prod)

  io.on("connection", (socket) => {
    console.log("dashboard connected:", socket.id);
  });

  // Centralised error handler -> meaningful status codes (book §5.3.2).
  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: "internal error" });
  });

  return { app, httpServer, io };
}

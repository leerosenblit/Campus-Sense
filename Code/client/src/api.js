import { io } from "socket.io-client";

// Auth token kept in memory (not localStorage) to reduce XSS risk (book §5.4).
let token = null;
export const setToken = (t) => { token = t; };
export const getToken = () => token;

const BASE = "/api";

export async function apiFetch(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, { ...opts, headers });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

export async function login(email, password) {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(data.token);
  return data;
}

// Shared WebSocket connection for live room + ticket updates (book §5.3.3).
export const socket = io("/", { autoConnect: true });

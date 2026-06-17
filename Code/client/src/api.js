import { io } from "socket.io-client";

// Auth token kept in memory (not localStorage) to reduce XSS risk (book §5.4).
let token = null;
let role = null;
export const setToken = (t) => { token = t; };
export const getToken = () => token;
export const setRole = (r) => { role = r; };
export const getRole = () => role;
export const isLoggedIn = () => Boolean(token);

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
  setRole(data.role);
  return data;
}

// Shared WebSocket connection for live room + ticket updates (book §5.3.3).
export const socket = io("/", { autoConnect: true });

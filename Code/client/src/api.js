import { io } from "socket.io-client";

// Session is persisted in localStorage so a refresh doesn't log the user out.
// (Trade-off vs. in-memory: a JWT in localStorage is readable by XSS. Acceptable
// for this prototype; a hardened build would use an httpOnly cookie + CSRF token.)
const KEY = "cs-session";

function loadSession() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

let session = loadSession(); // { token, role, email }

function saveSession(s) {
  session = s;
  if (s && s.token) localStorage.setItem(KEY, JSON.stringify(s));
  else localStorage.removeItem(KEY);
}

export const getToken = () => session.token || null;
export const getRole = () => session.role || null;
export const getEmail = () => session.email || null;
export const isLoggedIn = () => Boolean(session.token);

export function logout() {
  saveSession({});
  // Drop any role-scoped socket state by reconnecting fresh.
  try { socket.disconnect(); socket.connect(); } catch { /* noop */ }
}

const BASE = "/api";

export async function apiFetch(path, opts = {}) {
  const headers = { "Content-Type": "application/json", ...(opts.headers || {}) };
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  const res = await fetch(BASE + path, { ...opts, headers });
  if (res.status === 401) {
    // Token missing/expired — clear the stale session so guards redirect to login.
    logout();
    throw new Error("session expired");
  }
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

export async function login(email, password) {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  saveSession({ token: data.token, role: data.role, email: data.email });
  return data;
}

// Shared WebSocket connection for live room + ticket updates (book §5.3.3).
export const socket = io("/", { autoConnect: true });

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api.js";
import ThemeToggle from "../components/ThemeToggle.jsx";

// Where each role lands after logging in.
const HOME_FOR = { cleaner: "/cleaner" };

export default function LoginPage() {
  const [email, setEmail] = useState("manager@afeka.ac.il");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { role } = await login(email, password);
      navigate(HOME_FOR[role] || "/map", { replace: true });
    } catch (err) {
      setError(err.message === "session expired" ? "Invalid credentials" : err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 px-4">
      <div className="absolute top-4 right-4">
        <ThemeToggle className="text-slate-500 dark:text-slate-300" />
      </div>
      <form onSubmit={submit} className="card p-8 w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-1">Campus-Sense</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Operations sign-in</p>
        <label className="block text-xs font-medium text-slate-500 mb-1">Email</label>
        <input
          className="w-full border rounded-lg p-2 mb-3 bg-transparent border-slate-300 dark:border-slate-700"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@afeka.ac.il"
          autoComplete="username"
        />
        <label className="block text-xs font-medium text-slate-500 mb-1">Password</label>
        <input
          type="password"
          className="w-full border rounded-lg p-2 mb-4 bg-transparent border-slate-300 dark:border-slate-700"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          autoComplete="current-password"
        />
        {error && <p className="text-red-600 dark:text-red-400 text-sm mb-3">{error}</p>}
        <button
          disabled={busy}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium transition-colors disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Log in"}
        </button>
        <p className="text-xs text-slate-400 mt-4 text-center">
          Demo: manager@afeka.ac.il · cleaner@afeka.ac.il — password <code>campus123</code>
        </p>
      </form>
    </div>
  );
}

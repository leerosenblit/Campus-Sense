import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../api.js";

export default function LoginPage() {
  const [email, setEmail] = useState("manager@afeka.ac.il");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    try {
      await login(email, password);
      navigate("/map");
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <form onSubmit={submit} className="bg-white p-8 rounded-xl shadow w-80">
        <h1 className="text-xl font-bold mb-6">Campus-Sense Login</h1>
        <input
          className="w-full border rounded p-2 mb-3"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email"
        />
        <input
          type="password"
          className="w-full border rounded p-2 mb-3"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
        />
        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
        <button className="w-full bg-blue-600 text-white py-2 rounded">Log in</button>
      </form>
    </div>
  );
}

import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../api.js";

// Student QR reporting form (book §4.4.3, §4.5.3, Use Case C).
// Room id comes from the QR (?room=ficus-301). No login. 3 taps to submit (NFR5).
const PROBLEMS = [
  { value: "projector", label: "Projector" },
  { value: "ac", label: "AC" },
  { value: "lights", label: "Lights" },
  { value: "spill", label: "Spill" },
  { value: "other", label: "Other" },
];

export default function ReportPage() {
  const [params] = useSearchParams();
  const room = params.get("room") || "";
  const [type, setType] = useState("");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    try {
      await apiFetch("/tickets", {
        method: "POST",
        body: JSON.stringify({ room_id: room, type, source: "qr", note }),
      });
      setSent(true);
    } catch (e) {
      setError(e.message);
    }
  };

  if (!room) return <p className="p-6">Invalid QR code: no room specified.</p>;
  if (sent)
    return (
      <div className="p-6 text-center">
        <h1 className="text-2xl font-bold text-green-600">Thanks! ✅</h1>
        <p className="mt-2">Your report for {room} was submitted.</p>
      </div>
    );

  return (
    <div className="max-w-sm mx-auto p-6">
      <h1 className="text-xl font-bold">Report a problem</h1>
      <p className="text-slate-500 mb-4">Room: {room}</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {PROBLEMS.map((p) => (
          <button
            key={p.value}
            onClick={() => setType(p.value)}
            className={`py-3 rounded border ${type === p.value ? "bg-blue-600 text-white border-blue-600" : "bg-white"}`}
          >
            {p.label}
          </button>
        ))}
      </div>
      <textarea
        className="w-full border rounded p-2 mb-4"
        placeholder="Optional comment"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <button
        disabled={!type}
        onClick={submit}
        className="w-full bg-blue-600 text-white py-3 rounded font-medium disabled:opacity-50"
      >
        Send
      </button>
    </div>
  );
}

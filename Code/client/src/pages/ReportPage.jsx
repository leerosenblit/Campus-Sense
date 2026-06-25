import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiFetch } from "../api.js";
import { buildingLabel } from "../labels.js";
import { TICKET_ICON, CheckCircleIcon } from "../icons.jsx";

// Student QR reporting form (book §4.4.3, §4.5.3, Use Case C).
// Room id comes from the QR (?room=ficus-301). No login. 3 taps to submit (NFR5).
const PROBLEMS = [
  { value: "projector", label: "Projector" },
  { value: "ac", label: "Air conditioning" },
  { value: "lights", label: "Lighting" },
  { value: "spill", label: "Spill" },
  { value: "other", label: "Other" },
];

// "ficus-301" -> "Ficus · 301"
function prettyRoom(id) {
  const [b, ...rest] = id.split("-");
  return `${buildingLabel(b)} · ${rest.join("-")}`;
}

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

  if (!room)
    return <p className="p-6 dark:text-slate-100">Invalid QR code: no room specified.</p>;

  if (sent)
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-100 dark:bg-slate-950">
        <CheckCircleIcon size={56} className="text-green-500" />
        <h1 className="text-2xl font-bold mt-3 dark:text-slate-100">Thanks!</h1>
        <p className="mt-1 text-slate-600 dark:text-slate-300">
          Your report for {prettyRoom(room)} was submitted.
        </p>
      </div>
    );

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-start justify-center">
      <div className="w-full max-w-sm p-6">
        <h1 className="text-xl font-bold dark:text-slate-100">Report a problem</h1>
        <p className="text-slate-500 dark:text-slate-400 mb-4">{prettyRoom(room)}</p>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {PROBLEMS.map((p) => {
            const Icon = TICKET_ICON[p.value];
            const active = type === p.value;
            return (
              <button
                key={p.value}
                onClick={() => setType(p.value)}
                className={`flex flex-col items-center gap-2 py-4 rounded-xl border transition-colors ${
                  active
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
                }`}
              >
                {Icon && <Icon size={22} />}
                <span className="text-sm">{p.label}</span>
              </button>
            );
          })}
        </div>
        <textarea
          className="w-full border rounded-lg p-2 mb-4 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 dark:text-slate-100"
          placeholder="Optional comment"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && <p className="text-red-600 dark:text-red-400 text-sm mb-2">{error}</p>}
        <button
          disabled={!type}
          onClick={submit}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-medium transition-colors disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

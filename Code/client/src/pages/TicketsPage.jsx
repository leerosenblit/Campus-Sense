import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { apiFetch, socket } from "../api.js";
import {
  buildingLabel,
  ticketTypeLabel,
  ticketSourceLabel,
  timeAgo,
} from "../labels.js";
import { TICKET_ICON, DotsIcon } from "../icons.jsx";

const COLUMNS = [
  { key: "open", label: "Open", accent: "text-rose-500" },
  { key: "in_progress", label: "In Progress", accent: "text-amber-500" },
  { key: "resolved", label: "Done", accent: "text-emerald-500" },
];

// urgent = auto-detected hazards (spills).
const URGENT = new Set(["spill"]);

function roomLabel(rooms, id) {
  const r = rooms[id];
  return r ? `${r.name} · ${buildingLabel(r.building)}` : id;
}

// Kanban board with drag-and-drop (book §4.4.1, §5.4.2). We use the maintained
// React-18 fork @hello-pangea/dnd of react-beautiful-dnd.
export default function TicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [rooms, setRooms] = useState({});

  const load = () => apiFetch("/tickets").then(setTickets).catch(() => {});
  useEffect(() => {
    load();
    apiFetch("/rooms")
      .then((rs) => setRooms(Object.fromEntries(rs.map((r) => [r.id, r]))))
      .catch(() => {});
    const onChange = () => load();
    socket.on("ticket:new", onChange);
    socket.on("ticket:update", onChange);
    return () => {
      socket.off("ticket:new", onChange);
      socket.off("ticket:update", onChange);
    };
  }, []);

  const onDragEnd = (result) => {
    const { destination, draggableId } = result;
    if (!destination) return;
    const newStatus = destination.droppableId;
    const id = Number(draggableId);
    const ticket = tickets.find((t) => t.id === id);
    if (!ticket || ticket.status === newStatus) return;
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t)));
    apiFetch(`/tickets/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    }).catch(load);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-1">Maintenance Tickets</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Drag a card between columns to update its status.
      </p>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {COLUMNS.map((col) => {
            const items = tickets.filter((t) => t.status === col.key);
            return (
              <Droppable droppableId={col.key} key={col.key}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={`rounded-xl p-3 min-h-[200px] transition-colors ${
                      snapshot.isDraggingOver
                        ? "bg-blue-50 dark:bg-blue-500/10"
                        : "bg-slate-100 dark:bg-slate-900/60"
                    }`}
                  >
                    <h3 className="font-semibold mb-3 flex items-center gap-2">
                      <span className={col.accent}>●</span>
                      {col.label}
                      <span className="text-slate-400 text-sm">({items.length})</span>
                    </h3>
                    {items.map((t, idx) => {
                      const Icon = TICKET_ICON[t.type] || DotsIcon;
                      const urgent = URGENT.has(t.type) || t.source === "anomaly";
                      return (
                        <Draggable draggableId={String(t.id)} index={idx} key={t.id}>
                          {(prov, snap) => (
                            <div
                              ref={prov.innerRef}
                              {...prov.draggableProps}
                              {...prov.dragHandleProps}
                              className={`card p-3 mb-2 cursor-grab border-l-4 ${
                                urgent ? "border-l-rose-500" : "border-l-slate-300 dark:border-l-slate-700"
                              } ${snap.isDragging ? "ring-2 ring-blue-400" : ""}`}
                            >
                              <div className="flex items-center gap-2 font-medium text-sm">
                                <Icon size={16} />
                                {ticketTypeLabel(t.type)}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                                {roomLabel(rooms, t.room_id)}
                              </div>
                              {t.note && (
                                <div className="text-xs text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">
                                  “{t.note}”
                                </div>
                              )}
                              <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2">
                                <span>
                                  {ticketSourceLabel(t.source)}
                                  {t.confidence ? ` · ${Math.round(t.confidence * 100)}%` : ""}
                                </span>
                                <span>{timeAgo(t.created_at)}</span>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      );
                    })}
                    {items.length === 0 && (
                      <p className="text-xs text-slate-400 px-1">Nothing here.</p>
                    )}
                    {provided.placeholder}
                  </div>
                )}
              </Droppable>
            );
          })}
        </div>
      </DragDropContext>
    </div>
  );
}

import { useEffect, useState } from "react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import { apiFetch, socket } from "../api.js";

const COLUMNS = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
];

// Kanban board with drag-and-drop (book §4.4.1, §5.4.2). The book named
// react-beautiful-dnd; we use its maintained React-18 fork @hello-pangea/dnd
// (the original is abandoned and breaks under StrictMode).
export default function TicketsPage() {
  const [tickets, setTickets] = useState([]);

  const load = () => apiFetch("/tickets").then(setTickets).catch(() => {});
  useEffect(() => {
    load();
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
    // Optimistic update, then persist.
    setTickets((prev) => prev.map((t) => (t.id === id ? { ...t, status: newStatus } : t)));
    apiFetch(`/tickets/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    }).catch(load);
  };

  return (
    <div>
      <h2 className="text-2xl font-bold mb-6">Maintenance Tickets</h2>
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-3 gap-4">
          {COLUMNS.map((col) => (
            <Droppable droppableId={col.key} key={col.key}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={`rounded-lg p-3 min-h-[200px] transition-colors ${
                    snapshot.isDraggingOver ? "bg-blue-50" : "bg-slate-50"
                  }`}
                >
                  <h3 className="font-semibold mb-3">
                    {col.label}{" "}
                    <span className="text-slate-400 text-sm">
                      ({tickets.filter((t) => t.status === col.key).length})
                    </span>
                  </h3>
                  {tickets
                    .filter((t) => t.status === col.key)
                    .map((t, idx) => (
                      <Draggable draggableId={String(t.id)} index={idx} key={t.id}>
                        {(prov, snap) => (
                          <div
                            ref={prov.innerRef}
                            {...prov.draggableProps}
                            {...prov.dragHandleProps}
                            className={`bg-white rounded shadow p-3 mb-2 text-sm cursor-grab ${
                              snap.isDragging ? "ring-2 ring-blue-400" : ""
                            }`}
                          >
                            <div className="font-medium capitalize">
                              {t.type.replace("_", " ")} · {t.room_id}
                            </div>
                            <div className="text-xs text-slate-500">
                              {t.source}
                              {t.confidence ? ` (${Math.round(t.confidence * 100)}%)` : ""}
                            </div>
                          </div>
                        )}
                      </Draggable>
                    ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}

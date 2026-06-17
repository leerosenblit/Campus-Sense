import { NavLink, Outlet } from "react-router-dom";

const tabs = [
  { to: "/map", label: "Live Map" },
  { to: "/tickets", label: "Tickets" },
  { to: "/analytics", label: "Analytics" },
];

export default function Layout() {
  return (
    <div className="min-h-screen flex bg-slate-100 text-slate-800">
      <aside className="w-64 bg-slate-800 text-white p-6 flex flex-col">
        <h1 className="text-xl font-bold mb-8 border-b border-slate-600 pb-3">
          Campus-Sense
        </h1>
        <nav className="flex flex-col gap-2">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded ${isActive ? "bg-blue-600" : "hover:bg-slate-700"}`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto text-xs text-slate-400">Operations Dashboard</div>
      </aside>
      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

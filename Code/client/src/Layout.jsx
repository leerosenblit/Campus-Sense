import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { getRole, getEmail, logout } from "./api.js";
import { MapIcon, TicketIcon, ChartIcon, CalendarIcon, LogOutIcon } from "./icons.jsx";
import ThemeToggle from "./components/ThemeToggle.jsx";

const ALL_TABS = [
  { to: "/map", label: "Live Map", icon: MapIcon },
  { to: "/tickets", label: "Tickets", icon: TicketIcon },
  { to: "/schedule", label: "Class Schedule", icon: CalendarIcon, roles: ["operations_manager"] },
  { to: "/analytics", label: "Analytics", icon: ChartIcon, roles: ["operations_manager"] },
];

const ROLE_LABEL = {
  operations_manager: "Operations Manager",
  it_admin: "IT Admin",
  cleaner: "Cleaner",
};

export default function Layout() {
  const role = getRole();
  const email = getEmail();
  const navigate = useNavigate();
  const tabs = ALL_TABS.filter((t) => !t.roles || t.roles.includes(role));

  const onLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-100">
      <aside className="w-64 bg-slate-900 text-slate-100 p-5 flex flex-col dark:bg-slate-900 dark:border-r dark:border-slate-800">
        <div className="flex items-center justify-between mb-8 border-b border-slate-700 pb-3">
          <div className="flex items-center gap-2 min-w-0">
            {/* Logo from client/public/logo.png; hidden until that file exists. */}
            <img
              src="/logo.png"
              alt=""
              className="h-7 w-7 rounded object-contain shrink-0"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
            <h1 className="text-xl font-bold tracking-tight truncate">Campus-Sense</h1>
          </div>
          <ThemeToggle className="text-slate-300" />
        </div>

        <nav className="flex flex-col gap-1">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"
                }`
              }
            >
              <t.icon size={18} />
              {t.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto pt-4 border-t border-slate-700">
          <div className="text-sm font-medium truncate">{email}</div>
          <div className="text-xs text-slate-400 mb-3">{ROLE_LABEL[role] || role}</div>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <LogOutIcon size={18} /> Log out
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}

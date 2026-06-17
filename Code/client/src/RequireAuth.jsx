import { Navigate, Outlet } from "react-router-dom";
import { isLoggedIn } from "./api.js";

// Route guard for staff-only pages (FR7). Redirects to /login when not authenticated.
// (Token is in memory, so a hard refresh logs out — acceptable for the prototype.)
export default function RequireAuth() {
  return isLoggedIn() ? <Outlet /> : <Navigate to="/login" replace />;
}

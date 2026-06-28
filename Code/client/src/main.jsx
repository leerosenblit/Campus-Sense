import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./theme.js"; // applies saved/OS theme before first paint (no flash)
import "./index.css";

import Layout from "./Layout.jsx";
import RequireAuth from "./RequireAuth.jsx";
import MapPage from "./pages/MapPage.jsx";
import TicketsPage from "./pages/TicketsPage.jsx";
import SchedulePage from "./pages/SchedulePage.jsx";
import AnalyticsPage from "./pages/AnalyticsPage.jsx";
import CleanerPage from "./pages/CleanerPage.jsx";
import ReportPage from "./pages/ReportPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        {/* Public student QR form — no login (book §4.5.3) */}
        <Route path="/report" element={<ReportPage />} />
        <Route path="/login" element={<LoginPage />} />
        {/* Authenticated areas (FR7) */}
        <Route element={<RequireAuth />}>
          {/* Cleaner mobile view — its own full-screen mobile layout, no sidebar */}
          <Route path="/cleaner" element={<CleanerPage />} />
          {/* Manager / IT desktop dashboard */}
          <Route element={<Layout />}>
            <Route path="/map" element={<MapPage />} />
            <Route path="/tickets" element={<TicketsPage />} />
            <Route path="/schedule" element={<SchedulePage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/map" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

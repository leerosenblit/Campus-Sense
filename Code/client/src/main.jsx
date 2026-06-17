import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./index.css";

import Layout from "./Layout.jsx";
import MapPage from "./pages/MapPage.jsx";
import TicketsPage from "./pages/TicketsPage.jsx";
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
        {/* Cleaner mobile view */}
        <Route path="/cleaner" element={<CleanerPage />} />
        {/* Manager dashboard */}
        <Route element={<Layout />}>
          <Route path="/map" element={<MapPage />} />
          <Route path="/tickets" element={<TicketsPage />} />
          <Route path="/analytics" element={<AnalyticsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/map" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);

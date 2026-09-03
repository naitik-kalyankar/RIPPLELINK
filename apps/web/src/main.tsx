import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ToastProvider } from "@/components/ui/toast";
import { isTauri } from "@/platform";
import App from "./App";
import "./index.css";

// The desktop window is transparent (see tauri.conf.json) so AppShell's own rounded corner
// (its bg-background box) can reveal real desktop behind it — but only if nothing painted
// underneath it is opaque. body's default background would otherwise fill that gap with a
// solid square, defeating the whole point. Every page-level wrapper already sets its own
// bg-background, so body doesn't need one — this only strips it inside the Tauri build, where
// it'd otherwise show through the rounded corners.
if (isTauri()) document.body.classList.add("tauri-transparent-bg");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>
);

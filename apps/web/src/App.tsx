import { Route, Routes } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ClippingScopeProvider } from "@/lib/clippingScope";
import { AppShell } from "@/components/layout/AppShell";
import { DashboardPage } from "@/pages/DashboardPage";
import { ReelsPage } from "@/pages/ReelsPage";
import { InstagramAccountsPage } from "@/pages/InstagramAccountsPage";
import { ClippingPage } from "@/pages/ClippingPage";
import { UploadQueuePage } from "@/pages/UploadQueuePage";
import { SettingsPage } from "@/pages/SettingsPage";

export default function App() {
  return (
    <TooltipProvider delayDuration={200}>
      <ClippingScopeProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="/reels" element={<ReelsPage />} />
            <Route path="/instagram-accounts" element={<InstagramAccountsPage />} />
            <Route path="/clipping" element={<ClippingPage />} />
            <Route path="/upload-queue" element={<UploadQueuePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Routes>
      </ClippingScopeProvider>
    </TooltipProvider>
  );
}

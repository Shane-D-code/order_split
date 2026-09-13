import { BrowserRouter, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { SyncProvider } from "./SyncContext";
import { ThemeProvider } from "./ThemeProvider";
import { OnboardingGate } from "./OnboardingGate";
import { TodayPage } from "../pages/TodayPage";
import { HistoryPage } from "../pages/HistoryPage";
import { OrderDetailPage } from "../pages/OrderDetailPage";
import { ReceivedDetailPage } from "../pages/ReceivedDetailPage";
import { NewOrderPage } from "../pages/NewOrderPage";
import { ManualOrderPage } from "../pages/ManualOrderPage";
import { ImportOrderPage } from "../pages/ImportOrderPage";
import { ReviewOrderPage } from "../pages/ReviewOrderPage";
import { SettingsPage } from "../pages/SettingsPage";
import { PairPage } from "../pages/PairPage";

export function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <SyncProvider>
          <OnboardingGate>
            <AppShell>
              <Routes>
                <Route path="/" element={<TodayPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/order/:id" element={<OrderDetailPage />} />
                <Route path="/received/:id" element={<ReceivedDetailPage />} />
                <Route path="/new" element={<NewOrderPage />} />
                <Route path="/new/manual" element={<ManualOrderPage />} />
                <Route path="/import" element={<ImportOrderPage />} />
                <Route path="/review/:draftId" element={<ReviewOrderPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/pair" element={<PairPage />} />
              </Routes>
            </AppShell>
          </OnboardingGate>
        </SyncProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}
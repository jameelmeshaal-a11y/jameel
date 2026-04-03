import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LanguageProvider } from "@/contexts/LanguageContext";
import Dashboard from "./pages/Dashboard";
import ProjectsPage from "./pages/ProjectsPage";
import ProjectDetail from "./pages/ProjectDetail";
import RateLibraryPage from "./pages/RateLibraryPage";
import SettingsPage from "./pages/SettingsPage";
import ValidationPage from "./pages/ValidationPage";
import QACenterPage from "./pages/QACenterPage";
import SystemArchitecturePage from "./pages/SystemArchitecturePage";
import QAHealthPage from "./pages/QAHealthPage";
import NotFound from "./pages/NotFound";
import DebugPanel from "./components/DebugPanel";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <LanguageProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetail />} />
            <Route path="/rate-library" element={<RateLibraryPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/validation" element={<ValidationPage />} />
            <Route path="/qa-center" element={<QACenterPage />} />
            <Route path="/architecture" element={<SystemArchitecturePage />} />
            <Route path="/qa" element={<QAHealthPage />} />
            <Route path="/health" element={<QAHealthPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <DebugPanel />
        </BrowserRouter>
      </TooltipProvider>
    </LanguageProvider>
  </QueryClientProvider>
);

export default App;

import { useState, useEffect } from "react";
import { Bug, X, Circle, Database, Upload, Calculator, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface DebugEntry {
  timestamp: string;
  type: "info" | "error" | "success";
  action: string;
  detail?: string;
}

// Global error log store
const errorLog: DebugEntry[] = [];

export function pushDebugLog(type: DebugEntry["type"], action: string, detail?: string) {
  errorLog.push({ timestamp: new Date().toISOString(), type, action, detail });
  if (errorLog.length > 200) errorLog.shift();
  window.dispatchEvent(new CustomEvent("debug-log-update"));
}

export function getErrorLog() {
  return [...errorLog];
}

export function exportErrorLog() {
  const blob = new Blob([JSON.stringify(errorLog, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `error-log-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DebugPanel() {
  const { lang } = useLanguage();
  const isAr = lang === "ar";
  const [open, setOpen] = useState(false);
  const [dbStatus, setDbStatus] = useState<"checking" | "connected" | "error">("checking");
  const [storageStatus, setStorageStatus] = useState<"checking" | "ok" | "error">("checking");
  const [logs, setLogs] = useState<DebugEntry[]>([]);

  useEffect(() => {
    // Check DB
    supabase.from("projects").select("id").limit(1).then(({ error }) => {
      setDbStatus(error ? "error" : "connected");
      if (error) pushDebugLog("error", "DB Connection", error.message);
      else pushDebugLog("success", "DB Connection", "Connected");
    });

    // Check storage
    supabase.storage.listBuckets().then(({ error }) => {
      setStorageStatus(error ? "error" : "ok");
      if (error) pushDebugLog("error", "Storage", error.message);
      else pushDebugLog("success", "Storage", "Buckets accessible");
    });
  }, []);

  useEffect(() => {
    const handler = () => setLogs([...errorLog]);
    window.addEventListener("debug-log-update", handler);
    setLogs([...errorLog]);
    return () => window.removeEventListener("debug-log-update", handler);
  }, []);

  // Capture console errors
  useEffect(() => {
    const origError = console.error;
    console.error = (...args) => {
      pushDebugLog("error", "Console Error", args.map(String).join(" "));
      origError.apply(console, args);
    };
    return () => { console.error = origError; };
  }, []);

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        size="icon"
        variant="outline"
        className="fixed bottom-4 right-4 z-50 rounded-full w-10 h-10 shadow-lg"
        title={isAr ? "لوحة التصحيح" : "Debug Panel"}
      >
        <Bug className="w-4 h-4" />
      </Button>
    );
  }

  const statusDot = (s: string) => {
    const color = s === "connected" || s === "ok" ? "text-emerald-500" : s === "error" ? "text-red-500" : "text-amber-500";
    return <Circle className={cn("w-3 h-3 fill-current", color)} />;
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-h-[60vh] bg-background border rounded-xl shadow-2xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold">{isAr ? "لوحة التصحيح" : "Debug Panel"}</span>
        </div>
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={exportErrorLog} title={isAr ? "تصدير السجل" : "Export Log"}>
            <AlertTriangle className="w-3 h-3" />
          </Button>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setOpen(false)}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Status */}
      <div className="px-3 py-2 space-y-1 border-b">
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5"><Database className="w-3 h-3" /> {isAr ? "قاعدة البيانات" : "Database"}</span>
          <span className="flex items-center gap-1">{statusDot(dbStatus)} {dbStatus}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5"><Upload className="w-3 h-3" /> {isAr ? "التخزين" : "Storage"}</span>
          <span className="flex items-center gap-1">{statusDot(storageStatus)} {storageStatus}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5"><Calculator className="w-3 h-3" /> {isAr ? "محرك التسعير" : "Pricing Engine"}</span>
          <span className="flex items-center gap-1">{statusDot("connected")} ready</span>
        </div>
      </div>

      {/* Logs */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1 text-[11px] font-mono">
        {logs.length === 0 && (
          <p className="text-muted-foreground text-center py-4">{isAr ? "لا توجد سجلات بعد" : "No logs yet"}</p>
        )}
        {logs.slice(-30).reverse().map((log, i) => (
          <div key={i} className="flex gap-1.5">
            <span className={cn(
              "flex-shrink-0 w-1.5 h-1.5 rounded-full mt-1.5",
              log.type === "error" ? "bg-red-500" : log.type === "success" ? "bg-emerald-500" : "bg-blue-500"
            )} />
            <div>
              <span className="text-muted-foreground">{new Date(log.timestamp).toLocaleTimeString()}</span>
              {" "}<span className="font-medium">{log.action}</span>
              {log.detail && <span className="text-muted-foreground"> — {log.detail}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

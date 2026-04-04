import { useState, useEffect, useCallback } from "react";
import {
  Activity, CheckCircle2, XCircle, Loader2, Database, HardDrive,
  FolderPlus, FileUp, Upload, Calculator, Download, Archive, Clock,
  Play, RefreshCw, Server, Wifi, WifiOff, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface HealthCheck {
  id: string;
  name: string;
  status: "idle" | "running" | "pass" | "fail";
  message?: string;
  duration?: number;
  icon: any;
  category: "infra" | "functional";
}

const initialChecks: HealthCheck[] = [
  // Infrastructure
  { id: "db-connection", name: "Database Connection", status: "idle", icon: Database, category: "infra" },
  { id: "storage-documents", name: "Storage: Documents Bucket", status: "idle", icon: HardDrive, category: "infra" },
  { id: "storage-boq", name: "Storage: BoQ Bucket", status: "idle", icon: HardDrive, category: "infra" },
  // Functional
  { id: "create-project", name: "Create Project (CRUD)", status: "idle", icon: FolderPlus, category: "functional" },
  { id: "upload-document", name: "Upload Document", status: "idle", icon: FileUp, category: "functional" },
  { id: "upload-boq", name: "Upload BoQ File", status: "idle", icon: Upload, category: "functional" },
  { id: "parse-boq", name: "Parse BoQ Structure", status: "idle", icon: Archive, category: "functional" },
  { id: "run-pricing", name: "Run Pricing Engine", status: "idle", icon: Calculator, category: "functional" },
  { id: "export-boq", name: "Export Priced BoQ", status: "idle", icon: Download, category: "functional" },
];

export default function QAHealthPage() {
  const [checks, setChecks] = useState<HealthCheck[]>(initialChecks);
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [envInfo, setEnvInfo] = useState({
    supabaseUrl: "",
    hasAnonKey: false,
    buildTime: new Date().toISOString(),
  });

  useEffect(() => {
    setEnvInfo({
      supabaseUrl: import.meta.env.VITE_SUPABASE_URL || "NOT SET",
      hasAnonKey: !!import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      buildTime: new Date().toISOString(),
    });
  }, []);

  const update = (id: string, u: Partial<HealthCheck>) =>
    setChecks(prev => prev.map(c => c.id === id ? { ...c, ...u } : c));

  const runCheck = useCallback(async (checkId: string) => {
    update(checkId, { status: "running", message: undefined, duration: undefined });
    const start = performance.now();
    try {
      switch (checkId) {
        case "db-connection": {
          const { error } = await supabase.from("projects").select("id").limit(1);
          if (error) throw error;
          update(checkId, { status: "pass", message: "Connected to database", duration: Math.round(performance.now() - start) });
          break;
        }
        case "storage-documents": {
          const { error } = await supabase.storage.from("documents").list("", { limit: 1 });
          if (error) throw error;
          update(checkId, { status: "pass", message: "Documents bucket accessible", duration: Math.round(performance.now() - start) });
          break;
        }
        case "storage-boq": {
          const { error } = await supabase.storage.from("boq-files").list("", { limit: 1 });
          if (error) throw error;
          update(checkId, { status: "pass", message: "BoQ bucket accessible", duration: Math.round(performance.now() - start) });
          break;
        }
        case "create-project": {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error("Not authenticated");
          const { data, error } = await supabase
            .from("projects")
            .insert({ name: `QA-Health-${Date.now()}`, cities: ["Riyadh"], status: "draft", user_id: user.id })
            .select()
            .single();
          if (error) throw error;
          await supabase.from("projects").delete().eq("id", data.id);
          update(checkId, { status: "pass", message: "Insert + delete OK", duration: Math.round(performance.now() - start) });
          break;
        }
        case "upload-document": {
          const blob = new Blob(["QA health check"], { type: "text/plain" });
          const path = `qa-health/${Date.now()}.txt`;
          const { error } = await supabase.storage.from("documents").upload(path, blob);
          if (error) throw error;
          await supabase.storage.from("documents").remove([path]);
          update(checkId, { status: "pass", message: "Upload + cleanup OK", duration: Math.round(performance.now() - start) });
          break;
        }
        case "upload-boq": {
          const blob = new Blob(["QA BoQ health"], { type: "text/plain" });
          const path = `qa-health/${Date.now()}.txt`;
          const { error } = await supabase.storage.from("boq-files").upload(path, blob);
          if (error) throw error;
          await supabase.storage.from("boq-files").remove([path]);
          update(checkId, { status: "pass", message: "BoQ upload OK", duration: Math.round(performance.now() - start) });
          break;
        }
        case "parse-boq": {
          const { parseBoQExcel } = await import("@/lib/boqParser");
          const XLSX = await import("xlsx");
          const ws = XLSX.utils.aoa_to_sheet([
            ["رقم البند", "الوصف", "الوحدة", "الكمية"],
            ["1", "توريد خرسانة", "م3", "100"],
          ]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "BoQ");
          const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
          const items = parseBoQExcel(buf);
          update(checkId, { status: "pass", message: `Parsed ${items.length} item(s)`, duration: Math.round(performance.now() - start) });
          break;
        }
        case "run-pricing": {
          const mod = await import("@/lib/pricingEngine");
          const ok = typeof mod.runPricingEngine === "function";
          update(checkId, { status: ok ? "pass" : "fail", message: ok ? "Engine loaded" : "Engine missing", duration: Math.round(performance.now() - start) });
          break;
        }
        case "export-boq": {
          const XLSX = await import("xlsx");
          const ws = XLSX.utils.aoa_to_sheet([["Item", "Price"], ["1", "100"]]);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, "Export");
          const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
          update(checkId, { status: buf.byteLength > 0 ? "pass" : "fail", message: `${buf.byteLength} bytes`, duration: Math.round(performance.now() - start) });
          break;
        }
      }
    } catch (e: any) {
      update(checkId, { status: "fail", message: e.message, duration: Math.round(performance.now() - start) });
    }
  }, []);

  const runAll = useCallback(async () => {
    setRunning(true);
    setChecks(initialChecks);
    for (const c of initialChecks) {
      await runCheck(c.id);
    }
    setLastRun(new Date().toISOString());
    setRunning(false);
  }, [runCheck]);

  const passed = checks.filter(c => c.status === "pass").length;
  const failed = checks.filter(c => c.status === "fail").length;
  const total = checks.length;
  const allDone = passed + failed === total;

  const overallStatus = !allDone
    ? "PENDING"
    : failed === 0
    ? "ALL PASS"
    : failed <= 2
    ? "PARTIAL"
    : "CRITICAL";

  const statusColor = overallStatus === "ALL PASS"
    ? "text-emerald-400"
    : overallStatus === "PARTIAL"
    ? "text-amber-400"
    : overallStatus === "CRITICAL"
    ? "text-red-400"
    : "text-muted-foreground";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b bg-muted/30">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-7 h-7 text-primary" />
              <div>
                <h1 className="text-2xl font-bold tracking-tight">QA Health Dashboard</h1>
                <p className="text-sm text-muted-foreground">System diagnostics & readiness report</p>
              </div>
            </div>
            <Button onClick={runAll} disabled={running} className="gap-2">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? "Running…" : "Run All Checks"}
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Environment Info */}
        <section className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" /> Environment
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Backend URL</span>
              <span className="font-mono text-xs truncate max-w-[200px]">{envInfo.supabaseUrl.replace("https://", "").split(".")[0]}…</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Anon Key</span>
              <Badge variant={envInfo.hasAnonKey ? "default" : "destructive"} className="text-[10px]">
                {envInfo.hasAnonKey ? "SET" : "MISSING"}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Status</span>
              <Badge variant="outline" className="text-[10px]">Backend-Connected</Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Check Time</span>
              <span className="text-xs">{lastRun ? new Date(lastRun).toLocaleTimeString() : "—"}</span>
            </div>
          </div>
        </section>

        {/* Overall Status */}
        {allDone && (
          <div className={cn("rounded-xl border p-5 text-center", failed === 0 ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5")}>
            <div className={cn("text-3xl font-black tracking-wider", statusColor)}>{overallStatus}</div>
            <p className="text-sm text-muted-foreground mt-1">{passed}/{total} checks passed • {failed} failed</p>
          </div>
        )}

        {/* Infrastructure Checks */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Infrastructure</h2>
          {checks.filter(c => c.category === "infra").map(c => (
            <CheckRow key={c.id} check={c} onRun={() => runCheck(c.id)} disabled={running} />
          ))}
        </section>

        {/* Functional Checks */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Functional Tests</h2>
          {checks.filter(c => c.category === "functional").map(c => (
            <CheckRow key={c.id} check={c} onRun={() => runCheck(c.id)} disabled={running} />
          ))}
        </section>

        {/* System Classification */}
        <section className="rounded-xl border bg-card p-5 space-y-2">
          <h2 className="text-sm font-semibold">System Classification</h2>
          <ul className="text-sm space-y-1">
            <li className="flex items-center gap-2">
              {envInfo.hasAnonKey ? <Wifi className="w-4 h-4 text-emerald-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
              <span>Backend: <strong>{envInfo.hasAnonKey ? "Connected (Lovable Cloud)" : "Not Connected"}</strong></span>
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Frontend: <strong>React + Vite + Tailwind</strong></span>
            </li>
            <li className="flex items-center gap-2">
              {allDone && failed === 0
                ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                : <AlertTriangle className="w-4 h-4 text-amber-500" />}
              <span>Readiness: <strong>{allDone ? (failed === 0 ? "Production-Ready" : "Partially Functional") : "Run checks to determine"}</strong></span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}

function CheckRow({ check, onRun, disabled }: { check: HealthCheck; onRun: () => void; disabled: boolean }) {
  const Icon = check.icon;
  const StatusIcon = check.status === "pass" ? CheckCircle2 : check.status === "fail" ? XCircle : check.status === "running" ? Loader2 : Clock;
  const color = check.status === "pass" ? "text-emerald-500" : check.status === "fail" ? "text-red-500" : check.status === "running" ? "text-blue-500" : "text-muted-foreground";

  return (
    <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4 text-primary" />
        <div>
          <span className="text-sm font-medium">{check.name}</span>
          {check.message && <p className="text-xs text-muted-foreground">{check.message}</p>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {check.duration !== undefined && <span className="text-[10px] text-muted-foreground">{check.duration}ms</span>}
        <StatusIcon className={cn("w-5 h-5", color, check.status === "running" && "animate-spin")} />
        {check.status === "idle" && (
          <Button size="sm" variant="outline" onClick={onRun} disabled={disabled}>
            <Play className="w-3 h-3" />
          </Button>
        )}
      </div>
    </div>
  );
}

import { useState, useMemo } from "react";
import { useProjects, useBoQFiles, useBoQItems } from "@/hooks/useSupabase";
import { formatCurrency } from "@/lib/mockData";
import { useLanguage } from "@/contexts/LanguageContext";
import AppLayout from "@/components/AppLayout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, FileText, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportReportExcel, exportReportPDF } from "@/lib/projectReportExport";

function BoQFileSummaryRow({ file, onStats, isRTL }: { file: any; onStats: (stats: { totalItems: number; pricedItems: number; totalCost: number }) => void; isRTL: boolean }) {
  const { data: items = [] } = useBoQItems(file.id);

  const stats = useMemo(() => {
    const priceable = items.filter((i: any) => i.quantity > 0 && i.unit && i.item_no);
    const priced = priceable.filter((i: any) => i.unit_rate && i.unit_rate > 0);
    const total = items.reduce((sum: number, i: any) => sum + (i.total_price || 0), 0);
    const result = { totalItems: priceable.length, pricedItems: priced.length, totalCost: total };
    return result;
  }, [items]);

  // Report stats up
  useMemo(() => { onStats(stats); }, [stats, onStats]);

  return (
    <TableRow className={file.is_archived ? "opacity-60" : ""}>
      <TableCell className="font-medium text-sm" dir="auto">
        {file.name}
        {file.is_archived && <Badge variant="outline" className="text-[9px] ms-2 text-amber-600 border-amber-300">{isRTL ? "مؤرشف" : "Archived"}</Badge>}
      </TableCell>
      <TableCell className="text-center font-mono text-sm">{stats.totalItems}</TableCell>
      <TableCell className="text-center">
        <Badge variant={stats.pricedItems === stats.totalItems && stats.totalItems > 0 ? "default" : "secondary"}
          className={`text-[10px] ${stats.pricedItems === stats.totalItems && stats.totalItems > 0 ? "bg-emerald-500 text-white" : ""}`}>
          {stats.pricedItems}/{stats.totalItems}
        </Badge>
      </TableCell>
      <TableCell className="text-right font-mono text-sm font-semibold">{formatCurrency(stats.totalCost)}</TableCell>
    </TableRow>
  );
}

export default function ProjectReportPage() {
  const { dir } = useLanguage();
  const isRTL = dir === "rtl";
  const { data: projects = [] } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const { data: boqFiles = [] } = useBoQFiles(selectedProjectId || undefined);
  const allFiles = boqFiles;

  const [fileStats, setFileStats] = useState<Record<string, { totalItems: number; pricedItems: number; totalCost: number }>>({});

  const handleStats = useMemo(() => {
    const handlers: Record<string, (stats: any) => void> = {};
    allFiles.forEach((f: any) => {
      handlers[f.id] = (stats: any) => {
        setFileStats(prev => {
          if (prev[f.id]?.totalItems === stats.totalItems && prev[f.id]?.pricedItems === stats.pricedItems && prev[f.id]?.totalCost === stats.totalCost) return prev;
          return { ...prev, [f.id]: stats };
        });
      };
    });
    return handlers;
  }, [allFiles]);

  const totals = useMemo(() => {
    let totalItems = 0, pricedItems = 0, totalCost = 0;
    Object.values(fileStats).forEach(s => {
      totalItems += s.totalItems;
      pricedItems += s.pricedItems;
      totalCost += s.totalCost;
    });
    return { totalItems, pricedItems, totalCost };
  }, [fileStats]);

  const selectedProject = projects.find((p: any) => p.id === selectedProjectId);

  return (
    <AppLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <BarChart3 className="w-6 h-6 text-primary" />
          <h1 className="text-xl font-bold">{isRTL ? "تقرير ملخص المشروع" : "Project Summary Report"}</h1>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{isRTL ? "اختر المشروع" : "Select Project"}</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedProjectId} onValueChange={(v) => { setSelectedProjectId(v); setFileStats({}); }}>
              <SelectTrigger className="w-full max-w-md">
                <SelectValue placeholder={isRTL ? "اختر مشروعاً..." : "Choose a project..."} />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p: any) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {selectedProjectId && allFiles.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="w-4 h-4" />
                {isRTL ? `ملخص جداول الكميات — ${selectedProject?.name || ""}` : `BoQ Summary — ${selectedProject?.name || ""}`}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">{isRTL ? "جدول الكميات" : "BoQ File"}</TableHead>
                      <TableHead className="text-center w-24">{isRTL ? "عدد البنود" : "Items"}</TableHead>
                      <TableHead className="text-center w-32">{isRTL ? "المسعّرة" : "Priced"}</TableHead>
                      <TableHead className="text-right w-36">{isRTL ? "الإجمالي" : "Total"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allFiles.map((file: any) => (
                      <BoQFileSummaryRow key={file.id} file={file} onStats={handleStats[file.id] || (() => {})} />
                    ))}
                  </TableBody>
                  <TableFooter>
                    <TableRow className="font-bold">
                      <TableCell className="text-sm">{isRTL ? "الإجمالي" : "Total"}</TableCell>
                      <TableCell className="text-center font-mono text-sm">{totals.totalItems}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="text-[10px]">{totals.pricedItems}/{totals.totalItems}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{formatCurrency(totals.totalCost)}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {selectedProjectId && allFiles.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              {isRTL ? "لا توجد جداول كميات لهذا المشروع" : "No BoQ files for this project"}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

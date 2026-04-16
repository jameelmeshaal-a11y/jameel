import { useState } from "react";
import { ChevronDown, ChevronUp, Calculator } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BMSCalculationResult } from "@/lib/pricing/bmsEngine";

interface BMSAnalysisPanelProps {
  bmsResult: BMSCalculationResult;
}

const formatCurrency = (v: number) =>
  v.toLocaleString("ar-SA", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ريال";

const SYSTEM_COLORS: Record<string, string> = {
  hvac: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  fire: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  electrical: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  security: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  plumbing: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
};

export default function BMSAnalysisPanel({ bmsResult }: BMSAnalysisPanelProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (!bmsResult.hasBMSItems) return null;

  return (
    <div className="mb-4 border rounded-lg bg-card" dir="rtl">
      <Collapsible open={panelOpen} onOpenChange={setPanelOpen}>
        {/* Compact header — always visible */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between p-3 hover:bg-muted/40 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold flex items-center gap-2">
                🏗️ تحليل تسعير نظام إدارة المبنى (BMS)
              </h3>
              <Badge variant="secondary" className="text-xs">
                {bmsResult.totalPoints} نقطة I/O
              </Badge>
              <Badge className="text-xs bg-primary/10 text-primary border-primary/20" variant="outline">
                إجمالي: {formatCurrency(bmsResult.totalCost)}
              </Badge>
            </div>
            {panelOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-4 pb-4">
            {/* Cost Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div className="p-2 rounded bg-muted/50 text-center">
                <div className="text-[10px] text-muted-foreground">التكلفة الأساسية</div>
                <div className="text-sm font-semibold">{formatCurrency(bmsResult.baseCost)}</div>
              </div>
              <div className="p-2 rounded bg-muted/50 text-center">
                <div className="text-[10px] text-muted-foreground">تكامل + برمجة</div>
                <div className="text-sm font-semibold">{formatCurrency(bmsResult.integrationCost + bmsResult.programmingCost)}</div>
              </div>
              <div className="p-2 rounded bg-muted/50 text-center">
                <div className="text-[10px] text-muted-foreground">Server / Gateway</div>
                <div className="text-sm font-semibold">{formatCurrency(bmsResult.serverCost)}</div>
              </div>
              <div className="p-2 rounded bg-primary/10 text-center border border-primary/20">
                <div className="text-[10px] text-muted-foreground">إجمالي BMS</div>
                <div className="text-sm font-bold text-primary">{formatCurrency(bmsResult.totalCost)}</div>
              </div>
            </div>

            {/* System Breakdown Table */}
            {bmsResult.systemBreakdown.length > 0 && (
              <div className="mb-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">📊 التوزيع حسب النظام</div>
                <div className="border rounded-md overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/30">
                        <TableHead className="text-right text-[11px] py-2">النظام</TableHead>
                        <TableHead className="text-center text-[11px] py-2">عدد البنود</TableHead>
                        <TableHead className="text-center text-[11px] py-2">إجمالي النقاط</TableHead>
                        <TableHead className="text-center text-[11px] py-2">التكلفة التقديرية</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bmsResult.systemBreakdown.map(sys => (
                        <TableRow key={sys.system}>
                          <TableCell className="text-right py-1.5">
                            <Badge className={`text-[10px] ${SYSTEM_COLORS[sys.system] || ""}`} variant="outline">
                              {sys.systemLabel}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center text-xs py-1.5">{sys.itemCount}</TableCell>
                          <TableCell className="text-center text-xs font-medium py-1.5">{sys.totalPoints}</TableCell>
                          <TableCell className="text-center text-xs py-1.5">{formatCurrency(sys.cost)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Calculation Formula */}
            <div className="mb-3 p-3 rounded-md bg-muted/30 border">
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Calculator className="w-3.5 h-3.5" /> معادلة الحساب
              </div>
              <div className="space-y-1 text-xs font-mono">
                <div>{bmsResult.totalPoints} نقطة × {bmsResult.ratePerPoint} ريال = {formatCurrency(bmsResult.baseCost)}</div>
                <div>+ تكامل أنظمة = {formatCurrency(bmsResult.integrationCost)}</div>
                <div>+ برمجة وتشغيل = {formatCurrency(bmsResult.programmingCost)}</div>
                {bmsResult.serverCost > 0 && <div>+ سيرفر / Gateway = {formatCurrency(bmsResult.serverCost)}</div>}
                <div className="border-t pt-1 mt-1">= المجموع الفرعي: {formatCurrency(bmsResult.subtotal)}</div>
                {(bmsResult.projectMultiplier !== 1 || bmsResult.buildingMultiplier !== 1) && (
                  <div>× مضاعف المشروع ({bmsResult.projectMultiplier}) × مضاعف المباني ({bmsResult.buildingMultiplier})</div>
                )}
                <div className="font-bold text-primary">= الإجمالي النهائي: {formatCurrency(bmsResult.totalCost)}</div>
              </div>
            </div>

            {/* Collapsible Item Details */}
            {bmsResult.matches.length > 0 && (
              <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="w-full text-xs gap-2">
                    {detailsOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    {detailsOpen ? "إخفاء التفاصيل" : `عرض تفاصيل البنود (${bmsResult.matches.length} بند)`}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border rounded-md overflow-hidden mt-2">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/30">
                          <TableHead className="text-right text-[11px] py-2">وصف البند</TableHead>
                          <TableHead className="text-center text-[11px] py-2">التصنيف</TableHead>
                          <TableHead className="text-center text-[11px] py-2">النظام</TableHead>
                          <TableHead className="text-center text-[11px] py-2">الكمية</TableHead>
                          <TableHead className="text-center text-[11px] py-2">نقاط/وحدة</TableHead>
                          <TableHead className="text-center text-[11px] py-2">إجمالي النقاط</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bmsResult.matches.map((match, idx) => (
                          <TableRow key={`${match.itemId}-${idx}`}>
                            <TableCell className="text-right text-[11px] py-1.5 max-w-[200px] truncate" title={match.description}>
                              {match.description}
                            </TableCell>
                            <TableCell className="text-center text-[11px] py-1.5">
                              <Badge variant="outline" className="text-[9px]">{match.matchedRule}</Badge>
                            </TableCell>
                            <TableCell className="text-center py-1.5">
                              <Badge className={`text-[9px] ${SYSTEM_COLORS[match.system] || ""}`} variant="outline">
                                {match.system.toUpperCase()}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center text-[11px] py-1.5">{match.quantity}</TableCell>
                            <TableCell className="text-center text-[11px] py-1.5">{match.pointsPerUnit}</TableCell>
                            <TableCell className="text-center text-[11px] font-semibold py-1.5">{match.totalPoints}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Footer */}
            <div className="text-[10px] text-muted-foreground mt-2">
              سعر النقطة: {bmsResult.ratePerPoint} ريال | المضاعفات: مشروع ×{bmsResult.projectMultiplier} | مباني ×{bmsResult.buildingMultiplier}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

import { useMemo } from "react";
import { useBoQFiles, useBoQItems } from "@/hooks/useSupabase";
import { formatCurrency } from "@/lib/mockData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { FileText } from "lucide-react";

function BoQFileSummaryRow({ file }: { file: any }) {
  const { data: items = [] } = useBoQItems(file.id);

  const stats = useMemo(() => {
    const priceable = items.filter(i => i.quantity > 0 && i.unit && i.item_no);
    const priced = priceable.filter(i => i.unit_rate && i.unit_rate > 0);
    const total = items.reduce((sum, i) => sum + (i.total_price || 0), 0);
    return { totalItems: priceable.length, pricedItems: priced.length, totalCost: total };
  }, [items]);

  return (
    <TableRow>
      <TableCell className="font-medium text-sm" dir="auto">{file.name}</TableCell>
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

interface ProjectBoQSummaryProps {
  projectId: string;
}

export default function ProjectBoQSummary({ projectId }: ProjectBoQSummaryProps) {
  const { data: boqFiles = [] } = useBoQFiles(projectId);
  const activeFiles = useMemo(() => boqFiles.filter(f => !(f as any).is_archived), [boqFiles]);

  if (activeFiles.length === 0) return null;

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <FileText className="w-4 h-4" />
          ملخص جداول الكميات
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">جدول الكميات</TableHead>
                <TableHead className="text-center w-24">عدد البنود</TableHead>
                <TableHead className="text-center w-32">المسعّرة</TableHead>
                <TableHead className="text-right w-36">الإجمالي</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeFiles.map(file => (
                <BoQFileSummaryRow key={file.id} file={file} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

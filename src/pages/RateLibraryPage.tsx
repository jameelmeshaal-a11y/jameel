import { useState } from "react";
import { Search, Plus, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import AppLayout from "@/components/AppLayout";
import { sampleRateLibrary, formatNumber } from "@/lib/mockData";

export default function RateLibraryPage() {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const categories = ["all", ...new Set(sampleRateLibrary.map((r) => r.category))];

  const filtered = sampleRateLibrary.filter((r) => {
    if (category !== "all" && r.category !== category) return false;
    if (search && !r.descriptionEn.toLowerCase().includes(search.toLowerCase()) && !r.descriptionAr.includes(search)) return false;
    return true;
  });

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h1 className="page-title">Rate Library</h1>
            <p className="page-subtitle">Standard rates and pricing database for consistent estimation</p>
          </div>
          <Button className="gap-2">
            <Plus className="w-4 h-4" /> Add Rate
          </Button>
        </div>

        {sampleRateLibrary.length > 0 && (
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search rates..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
            </div>
            <div className="flex gap-1 flex-wrap">
              {categories.map((c) => (
                <Button key={c} variant={category === c ? "default" : "ghost"} size="sm" onClick={() => setCategory(c)} className="capitalize">
                  {c}
                </Button>
              ))}
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <BookOpen className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">
              {sampleRateLibrary.length === 0 ? "Rate library is empty" : "No matching rates"}
            </h2>
            <p className="text-muted-foreground max-w-md mb-6">
              {sampleRateLibrary.length === 0
                ? "Add standard rates to build your pricing database. Rates will be reused across projects for consistent estimation."
                : "Try adjusting your search or category filter."}
            </p>
            {sampleRateLibrary.length === 0 && (
              <Button className="gap-2">
                <Plus className="w-4 h-4" /> Add First Rate
              </Button>
            )}
          </div>
        ) : (
          <div className="border rounded-lg overflow-auto bg-card">
            <table className="boq-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Description</th>
                  <th className="min-w-[180px]">Arabic</th>
                  <th>Unit</th>
                  <th>Category</th>
                  <th className="text-right">Base Rate</th>
                  <th className="text-right">Materials</th>
                  <th className="text-right">Labor</th>
                  <th className="text-right">Equipment</th>
                  <th className="text-right">Used</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rate) => (
                  <tr key={rate.id} className="group cursor-pointer">
                    <td className="font-mono text-xs font-medium">{rate.code}</td>
                    <td className="text-sm">{rate.descriptionEn}</td>
                    <td className="text-sm" dir="rtl">{rate.descriptionAr}</td>
                    <td className="text-xs text-center">{rate.unit}</td>
                    <td><Badge variant="secondary" className="text-xs">{rate.category}</Badge></td>
                    <td className="text-right font-mono text-sm font-semibold">{formatNumber(rate.baseRate)}</td>
                    <td className="text-right font-mono text-xs">{formatNumber(rate.materials)}</td>
                    <td className="text-right font-mono text-xs">{formatNumber(rate.labor)}</td>
                    <td className="text-right font-mono text-xs">{formatNumber(rate.equipment)}</td>
                    <td className="text-right text-xs text-muted-foreground">{rate.usageCount}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

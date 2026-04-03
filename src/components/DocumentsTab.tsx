import { FileText, Upload, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { sampleDocuments } from "@/lib/mockData";

const typeColors: Record<string, string> = {
  core: "bg-primary text-primary-foreground",
  technical: "bg-info text-info-foreground",
  other: "bg-secondary text-secondary-foreground",
};

export default function DocumentsTab() {
  const grouped = {
    core: sampleDocuments.filter((d) => d.type === "core"),
    technical: sampleDocuments.filter((d) => d.type === "technical"),
    other: sampleDocuments.filter((d) => d.type === "other"),
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold">Project Documents</h3>
        <Button variant="outline" className="gap-2">
          <Upload className="w-4 h-4" /> Upload Document
        </Button>
      </div>

      {Object.entries(grouped).map(([type, docs]) => (
        <div key={type} className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <FolderOpen className="w-4 h-4 text-muted-foreground" />
            <h4 className="text-sm font-semibold capitalize">{type} Documents</h4>
            <Badge variant="secondary" className="text-xs">{docs.length}</Badge>
          </div>
          <div className="space-y-2">
            {docs.map((doc) => (
              <div key={doc.id} className="stat-card flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div>
                    <div className="text-sm font-medium" dir="rtl">{doc.name}</div>
                    <div className="text-xs text-muted-foreground">{doc.fileType} • {doc.size} • {doc.uploadedAt}</div>
                  </div>
                </div>
                <Badge className={typeColors[doc.type]}>{doc.type}</Badge>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

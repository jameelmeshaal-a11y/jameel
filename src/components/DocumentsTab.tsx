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
  if (sampleDocuments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
          <FolderOpen className="w-7 h-7 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">No documents uploaded</h3>
        <p className="text-muted-foreground max-w-sm mb-5">
          Upload tender documents, scope of work, contracts, and technical specs to improve pricing accuracy.
        </p>
        <Button variant="outline" className="gap-2">
          <Upload className="w-4 h-4" /> Upload Document
        </Button>
      </div>
    );
  }

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

      {Object.entries(grouped).map(([type, docs]) =>
        docs.length > 0 ? (
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
        ) : null
      )}
    </div>
  );
}

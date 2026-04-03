import { useState, useRef } from "react";
import { FileText, Upload, FolderOpen, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useProjectDocuments, useUploadDocument } from "@/hooks/useSupabase";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";

const typeColors: Record<string, string> = {
  core: "bg-primary text-primary-foreground",
  technical: "bg-blue-500 text-white",
  other: "bg-secondary text-secondary-foreground",
};

interface DocumentsTabProps {
  projectId: string;
}

export default function DocumentsTab({ projectId }: DocumentsTabProps) {
  const { t } = useLanguage();
  const { data: documents = [], isLoading } = useProjectDocuments(projectId);
  const uploadDoc = useUploadDocument();
  const fileRef = useRef<HTMLInputElement>(null);
  const [category, setCategory] = useState<"core" | "technical" | "other">("core");

  const typeLabels: Record<string, string> = {
    core: t("coreDocuments"),
    technical: t("technicalDocuments"),
    other: t("otherDocuments"),
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      await uploadDoc.mutateAsync({ projectId, file, category });
      toast.success(t("documentUploaded") || "Document uploaded successfully");
    } catch (err: any) {
      toast.error(err.message || "Upload failed");
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
          <FolderOpen className="w-7 h-7 text-primary" />
        </div>
        <h3 className="text-lg font-semibold mb-2">{t("noDocuments")}</h3>
        <p className="text-muted-foreground max-w-sm mb-5">{t("noDocumentsDesc")}</p>
        <div className="flex items-center gap-2">
          <Select value={category} onValueChange={(v: any) => setCategory(v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="core">{t("coreDocuments")}</SelectItem>
              <SelectItem value="technical">{t("technicalDocuments")}</SelectItem>
              <SelectItem value="other">{t("otherDocuments")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()} disabled={uploadDoc.isPending}>
            {uploadDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {t("uploadDocument")}
          </Button>
        </div>
        <input ref={fileRef} type="file" className="hidden" onChange={handleFileSelect} accept=".pdf,.docx,.xlsx,.xls,.doc,.jpg,.png" />
      </div>
    );
  }

  const grouped = {
    core: documents.filter(d => d.doc_category === "core"),
    technical: documents.filter(d => d.doc_category === "technical"),
    other: documents.filter(d => d.doc_category === "other"),
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold">{t("projectDocuments")}</h3>
        <div className="flex items-center gap-2">
          <Select value={category} onValueChange={(v: any) => setCategory(v)}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="core">{t("coreDocuments")}</SelectItem>
              <SelectItem value="technical">{t("technicalDocuments")}</SelectItem>
              <SelectItem value="other">{t("otherDocuments")}</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" className="gap-2" onClick={() => fileRef.current?.click()} disabled={uploadDoc.isPending}>
            {uploadDoc.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            {t("uploadDocument")}
          </Button>
        </div>
      </div>
      <input ref={fileRef} type="file" className="hidden" onChange={handleFileSelect} accept=".pdf,.docx,.xlsx,.xls,.doc,.jpg,.png" />

      {Object.entries(grouped).map(([type, docs]) =>
        docs.length > 0 ? (
          <div key={type} className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen className="w-4 h-4 text-muted-foreground" />
              <h4 className="text-sm font-semibold">{typeLabels[type]}</h4>
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
                      <div className="text-sm font-medium" dir="auto">{doc.name}</div>
                      <div className="text-xs text-muted-foreground">{doc.file_type} • {doc.size}</div>
                    </div>
                  </div>
                  <Badge className={typeColors[doc.doc_category]}>{doc.doc_category}</Badge>
                </div>
              ))}
            </div>
          </div>
        ) : null
      )}
    </div>
  );
}

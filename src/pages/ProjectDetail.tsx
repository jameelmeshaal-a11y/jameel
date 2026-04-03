import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { ArrowLeft, FileText, Upload, FolderOpen, Settings, BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AppLayout from "@/components/AppLayout";
import BoQTable from "@/components/BoQTable";
import DocumentsTab from "@/components/DocumentsTab";
import { useProject } from "@/hooks/useSupabase";
import { formatCurrency } from "@/lib/mockData";
import { useLanguage } from "@/contexts/LanguageContext";

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState("boq");
  const { data: project, isLoading } = useProject(id);

  const tabs = [
    { id: "boq", label: t("billsOfQuantities"), icon: FileText },
    { id: "documents", label: t("documents"), icon: FolderOpen },
    { id: "settings", label: t("projectSettings"), icon: Settings },
  ];

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-6">
            <FolderOpen className="w-8 h-8 text-destructive" />
          </div>
          <h2 className="text-xl font-semibold mb-2">{t("projectNotFound")}</h2>
          <p className="text-muted-foreground max-w-md mb-6">{t("projectNotFoundDesc")}</p>
          <Button onClick={() => navigate("/projects")} className="gap-2">{t("goToProjects")}</Button>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="animate-fade-in">
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/projects")} className="gap-1 mb-3 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> {t("backToProjects")}
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="page-title" dir="auto">{project.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <Badge variant={project.status === "active" ? "default" : "secondary"}
                  className={project.status === "active" ? "bg-emerald-500 text-white" : ""}>
                  {project.status}
                </Badge>
                <span className="text-sm text-muted-foreground">{(project.cities || []).join(", ")}</span>
                {project.total_value > 0 && (
                  <span className="text-sm font-semibold">{formatCurrency(project.total_value)}</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-1 border-b mb-6">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "boq" && <BoQTable projectId={project.id} cities={project.cities || []} />}
        {activeTab === "documents" && <DocumentsTab projectId={project.id} />}
        {activeTab === "settings" && (
          <div className="stat-card">
            <h3 className="font-semibold mb-4">{t("projectSettings")}</h3>
            <p className="text-sm text-muted-foreground">{t("projectSettingsDesc")}</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

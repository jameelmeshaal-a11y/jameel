import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { ArrowLeft, FileText, Upload, FolderOpen, Settings, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AppLayout from "@/components/AppLayout";
import BoQTable from "@/components/BoQTable";
import DocumentsTab from "@/components/DocumentsTab";
import { sampleProjects, formatCurrency } from "@/lib/mockData";

const tabs = [
  { id: "boq", label: "Bills of Quantities", icon: FileText },
  { id: "documents", label: "Documents", icon: FolderOpen },
  { id: "settings", label: "Project Settings", icon: Settings },
];

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("boq");

  const project = sampleProjects.find((p) => p.id === id) || sampleProjects[0];

  return (
    <AppLayout>
      <div className="animate-fade-in">
        {/* Back + Header */}
        <div className="mb-6">
          <Button variant="ghost" size="sm" onClick={() => navigate("/projects")} className="gap-1 mb-3 text-muted-foreground">
            <ArrowLeft className="w-4 h-4" /> Back to Projects
          </Button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="page-title" dir="rtl">{project.name}</h1>
              <div className="flex items-center gap-3 mt-1">
                <Badge variant={project.status === "active" ? "default" : "secondary"}
                  className={project.status === "active" ? "bg-success text-success-foreground" : ""}>
                  {project.status}
                </Badge>
                <span className="text-sm text-muted-foreground">{project.cities.join(", ")}</span>
                {project.totalValue > 0 && (
                  <span className="text-sm font-semibold">{formatCurrency(project.totalValue)}</span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="gap-2">
                <Upload className="w-4 h-4" /> Upload BoQ
              </Button>
              <Button className="gap-2">
                <BookOpen className="w-4 h-4" /> Price All
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
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

        {/* Tab Content */}
        {activeTab === "boq" && <BoQTable />}
        {activeTab === "documents" && <DocumentsTab />}
        {activeTab === "settings" && (
          <div className="stat-card">
            <h3 className="font-semibold mb-4">Project Settings</h3>
            <p className="text-sm text-muted-foreground">Project configuration and pricing mode settings will appear here.</p>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

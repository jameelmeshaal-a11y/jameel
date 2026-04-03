import { useNavigate } from "react-router-dom";
import {
  FolderOpen,
  TrendingUp,
  FileText,
  Clock,
  Plus,
  ArrowRight,
  Building2,
  MapPin,
  Briefcase,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AppLayout from "@/components/AppLayout";
import { sampleProjects, formatCurrency } from "@/lib/mockData";

export default function Dashboard() {
  const navigate = useNavigate();
  const activeProjects = sampleProjects.filter(p => p.status !== 'archived');
  const hasProjects = sampleProjects.length > 0;

  const stats = hasProjects
    ? [
        { label: "Active Projects", value: String(sampleProjects.filter(p => p.status === 'active').length), icon: FolderOpen, change: "Current" },
        { label: "Total BoQ Items", value: String(sampleProjects.reduce((s, p) => s + p.boqCount, 0)), icon: FileText, change: "Across all projects" },
        { label: "Draft Projects", value: String(sampleProjects.filter(p => p.status === 'draft').length), icon: Clock, change: "Pending" },
        { label: "Archived", value: String(sampleProjects.filter(p => p.status === 'archived').length), icon: TrendingUp, change: "Completed" },
      ]
    : [];

  return (
    <AppLayout>
      <div className="animate-fade-in">
        {/* Header */}
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard</h1>
            <p className="page-subtitle">Overview of your construction cost estimation projects</p>
          </div>
          <Button onClick={() => navigate("/projects")} className="gap-2">
            <Plus className="w-4 h-4" />
            New Project
          </Button>
        </div>

        {!hasProjects ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <Briefcase className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold mb-2">No projects yet</h2>
            <p className="text-muted-foreground max-w-md mb-6">
              Get started by creating your first project. Upload your BoQ files and project documents to begin accurate cost estimation.
            </p>
            <Button onClick={() => navigate("/projects")} className="gap-2">
              <Plus className="w-4 h-4" />
              Create First Project
            </Button>
          </div>
        ) : (
          <>
            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {stats.map((stat) => (
                <div key={stat.label} className="stat-card">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-muted-foreground">{stat.label}</span>
                    <stat.icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">{stat.change}</p>
                </div>
              ))}
            </div>

            {/* Projects */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Recent Projects</h2>
                <Button variant="ghost" size="sm" onClick={() => navigate("/projects")} className="gap-1 text-muted-foreground">
                  View all <ArrowRight className="w-3 h-3" />
                </Button>
              </div>

              <div className="space-y-3">
                {activeProjects.map((project) => (
                  <div
                    key={project.id}
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="stat-card cursor-pointer flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-sm" dir="rtl">{project.name}</h3>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {project.cities.join(", ")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {project.boqCount} BoQ files
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {project.totalValue > 0 && (
                        <span className="text-sm font-semibold">{formatCurrency(project.totalValue)}</span>
                      )}
                      <Badge
                        variant={project.status === 'active' ? 'default' : 'secondary'}
                        className={project.status === 'active' ? 'bg-success text-success-foreground' : ''}
                      >
                        {project.status}
                      </Badge>
                      <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import AppLayout from "@/components/AppLayout";
import { sampleProjects, formatCurrency } from "@/lib/mockData";

const stats = [
  { label: "Active Projects", value: "3", icon: FolderOpen, change: "+1 this month" },
  { label: "Total BoQ Items", value: "2,847", icon: FileText, change: "Across all projects" },
  { label: "Avg. Confidence", value: "89%", icon: TrendingUp, change: "+3% vs last month" },
  { label: "Last Activity", value: "2h ago", icon: Clock, change: "NEOM Phase 1" },
];

export default function Dashboard() {
  const navigate = useNavigate();

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
            {sampleProjects.filter(p => p.status !== 'archived').map((project) => (
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
      </div>
    </AppLayout>
  );
}

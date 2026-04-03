import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  FolderOpen,
  BookOpen,
  Settings,
  Building2,
  ChevronLeft,
  ChevronRight,
  Globe,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

export default function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { t, lang, setLang, dir } = useLanguage();

  const navItems = [
    { to: "/", icon: LayoutDashboard, label: t("dashboard") },
    { to: "/projects", icon: FolderOpen, label: t("projects") },
    { to: "/rate-library", icon: BookOpen, label: t("rateLibrary") },
    { to: "/settings", icon: Settings, label: t("settings") },
  ];

  const isRTL = dir === "rtl";

  return (
    <aside
      className={cn(
        "fixed top-0 h-screen flex flex-col z-30 transition-all duration-300 border-r",
        isRTL ? "right-0 border-l border-r-0" : "left-0",
        collapsed ? "w-[68px]" : "w-[240px]"
      )}
      style={{
        background: "hsl(var(--sidebar-bg))",
        borderColor: "hsl(var(--sidebar-border))",
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-4 h-16 border-b" style={{ borderColor: "hsl(var(--sidebar-border))" }}>
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center flex-shrink-0">
          <Building2 className="w-5 h-5 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold tracking-tight" style={{ color: "hsl(var(--sidebar-fg))" }}>
              {t("appName")}
            </h1>
            <p className="text-[10px] opacity-60" style={{ color: "hsl(var(--sidebar-fg))" }}>
              {t("appTagline")}
            </p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive =
            item.to === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={cn("sidebar-nav-item", isActive && "active")}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          );
        })}
      </nav>

      {/* Language toggle */}
      <button
        onClick={() => setLang(lang === "en" ? "ar" : "en")}
        className="mx-3 mb-2 p-2 rounded-lg transition-colors flex items-center gap-2 justify-center"
        style={{ color: "hsl(var(--sidebar-fg))" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "hsl(var(--sidebar-hover))")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <Globe className="w-4 h-4" />
        {!collapsed && <span className="text-xs">{lang === "en" ? "العربية" : "English"}</span>}
      </button>

      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="mx-3 mb-4 p-2 rounded-lg transition-colors flex items-center justify-center"
        style={{ color: "hsl(var(--sidebar-fg))" }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "hsl(var(--sidebar-hover))")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        {(collapsed ? !isRTL : isRTL) ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </aside>
  );
}

import { ReactNode } from "react";
import AppSidebar from "./AppSidebar";
import { useLanguage } from "@/contexts/LanguageContext";

export default function AppLayout({ children }: { children: ReactNode }) {
  const { dir } = useLanguage();
  const isRTL = dir === "rtl";

  return (
    <div className="min-h-screen flex" dir={dir}>
      <AppSidebar />
      <main
        className="flex-1 min-h-screen"
        style={{ [isRTL ? "marginRight" : "marginLeft"]: "240px" }}
      >
        <div className="p-8 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

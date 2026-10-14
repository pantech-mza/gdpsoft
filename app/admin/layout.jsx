"use client";

import { useEffect, useState } from "react";
import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminHeader from "../../components/admin/AdminHeader";
import FloatingAssistant from "../../components/FloatingAssistant";
import "./admin-responsive.css";

export default function AdminLayout({ children }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("gdpsoft_admin_sidebar_collapsed");
      if (saved !== null) {
        setCollapsed(saved === "true");
      }
    } catch {}
  }, []);

  function handleToggle() {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem("gdpsoft_admin_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  }

  return (
    <div className="min-h-screen min-w-0 overflow-x-clip bg-[#f7f5fa]">
      <AdminSidebar collapsed={collapsed} onToggle={handleToggle} />

      <div className={["gdp-admin-shell min-h-screen min-w-0 overflow-x-clip transition-[margin] duration-300", collapsed ? "md:ml-[82px]" : "md:ml-[256px]"] .join(" ")}>
        <AdminHeader />

        <main className="min-w-0 max-w-full px-4 pb-24 pt-6 sm:px-6 md:pb-12 lg:px-8">{children}</main>
      </div>

      <FloatingAssistant />
    </div>
  );
}

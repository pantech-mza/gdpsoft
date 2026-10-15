"use client";

import {
  useEffect,
  useState,
} from "react";

import { useRouter } from "next/navigation";

import SucursalSidebar from "../../components/sucursal/SucursalSidebar";
import SucursalTopbar from "../../components/sucursal/SucursalTopbar";
import FloatingAssistant from "../../components/FloatingAssistant";
import BranchNotices from "../../components/sucursal/BranchNotices";

export default function SucursalLayout({
  children,
}) {
  const router = useRouter();

  const [checking, setChecking] =
    useState(true);

  const [collapsed, setCollapsed] =
    useState(true);

  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(
          "gdpsoft_sidebar_collapsed"
        );

      if (saved !== null) {
        setCollapsed(
          saved === "true"
        );
      }
    } catch {}
  }, []);

  useEffect(() => {
    try {
      const rawUser =
        sessionStorage.getItem(
          "gdpsoft_user"
        );

      const rawModules =
        sessionStorage.getItem(
          "gdpsoft_modules"
        );

      if (!rawUser) {
        router.replace("/");
        return;
      }

      const user =
        JSON.parse(rawUser);

      const modules =
        rawModules
          ? JSON.parse(rawModules)
          : [];

      const access =
        modules.find(
          (item) =>
            item.code ===
            "SOCIAL_WORKS"
        );

      if (
        user.role !== "SUCURSAL" ||
        !access ||
        access.access_level !== "USER"
      ) {
        router.replace("/");
        return;
      }

      setChecking(false);
    } catch {
      router.replace("/");
    }
  }, [router]);

  function toggleSidebar() {
    const next = !collapsed;

    setCollapsed(next);

    localStorage.setItem(
      "gdpsoft_sidebar_collapsed",
      String(next)
    );
  }

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f6f9]">
        Cargando GDP Soft...
      </div>
    );
  }

  return (
    <div className="gdp-app-scale min-h-screen overflow-x-hidden bg-[#f7f6f9]">

      <SucursalSidebar
        collapsed={collapsed}
        onToggle={toggleSidebar}
      />

      <div
        className={[
          "min-h-screen min-w-0 overflow-x-hidden transition-[margin] duration-300",
          collapsed
            ? "md:ml-[82px]"
            : "md:ml-[220px]",
        ].join(" ")}
      >
        <SucursalTopbar />

        <main className="min-w-0 overflow-x-hidden">

          <div className="mx-auto w-full max-w-[1500px] px-4 pb-24 pt-6 sm:px-6 sm:pt-8 md:pb-10 lg:px-8">
            {children}
          </div>

        </main>
      </div>

      <BranchNotices />
      <FloatingAssistant />

    </div>
  );
}
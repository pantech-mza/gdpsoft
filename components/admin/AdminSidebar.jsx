"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";

const MENU = [
  { label: "Dashboard", href: "/admin", icon: "fluent-emoji:house" },
  { label: "Noticias / Avisos", href: "/admin/noticias", emoji: "📣" },
  { label: "Obras Sociales", href: "/admin/obras-sociales", icon: "fluent-emoji:hospital" },
  { label: "Normativas", href: "/admin/normativas", icon: "fluent-color:document-text-24", available: false },
  { label: "Árboles de Decisión", href: "/admin/arboles", icon: "fluent-emoji:herb" },
  { label: "Procedimientos internos", href: "/admin/procedimientos", emoji: "📋" },
  { label: "Preguntas Frecuentes", href: "/admin/faqs", icon: "fluent-emoji:red-question-mark" },
  { label: "Archivos", href: "/admin/archivos", emoji: "📂", available: false },
  { label: "Usuarios", href: "/admin/usuarios", emoji: "👥" },
  { label: "Historial de Cambios", href: "/admin/historial", emoji: "🕘", available: false },
  { label: "Validación de respuestas", href: "/admin/validacion", icon: "fluent-color:checkmark-circle-24" },
  { label: "Actividad del bot", href: "/admin/actividad", emoji: "📊" },
];

export default function AdminSidebar({ collapsed, onToggle }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("gdpsoft_user");
      setCurrentUser(raw ? JSON.parse(raw) : null);
    } catch {
      setCurrentUser(null);
    }
  }, []);

  function isActive(href) {
    if (href === "/admin") return pathname === "/admin";
    return pathname.startsWith(href);
  }

  function SidebarItem({ item, isMobile = false }) {
    const active = isActive(item.href);
    const disabled = item.available === false;
    const classes = [
      "flex min-h-[48px] items-center rounded-[12px] py-2 transition-colors duration-150",
      collapsed && !isMobile ? "justify-center px-1" : "gap-2.5 px-2.5",
      active
        ? "bg-gradient-to-r from-[#703099] to-[#592077] text-white"
        : disabled
          ? "cursor-not-allowed text-white/45"
          : "text-white/70 hover:bg-white/[0.06] hover:text-white",
    ].join(" ");

    const inner = (
      <>
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] bg-white/[0.06]">
          {item.emoji ? <span className={"text-[20px] leading-none " + (disabled && !active ? "opacity-75" : "")}>{item.emoji}</span> : <Icon icon={item.icon} width="20" height="20" className={disabled && !active ? "opacity-75" : ""} />}
        </span>

        {(!collapsed || isMobile) && (
          <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
            <span className="w-full whitespace-normal break-words text-[12.5px] font-semibold leading-[1.35]">
              {item.label}
            </span>
            {disabled && (
              <span className="text-[10px] leading-3 text-white/45">Pendiente</span>
            )}
          </span>
        )}
      </>
    );

    if (disabled) {
      return (
        <div className={classes} title={collapsed && !isMobile ? item.label : undefined}>
          {inner}
        </div>
      );
    }

    return (
      <Link href={item.href} className={classes} title={collapsed && !isMobile ? item.label : undefined}>
        {inner}
      </Link>
    );
  }

  return (
    <>
      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 hidden flex-col overflow-hidden bg-[#19082a] text-white transition-all duration-300 md:flex",
          collapsed ? "w-[82px]" : "w-[256px]",
        ].join(" ")}
      >
        <div className={["flex h-[92px] items-center border-b border-white/10", collapsed ? "flex-col justify-center gap-1 px-2" : "gap-2.5 px-4"].join(" ")}>
          <img src="/images/gdpsoft-icon.png" alt="GDP Soft" className={collapsed ? "h-9 w-9 shrink-0 object-contain" : "h-11 w-11 shrink-0 object-contain"} />

          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold leading-tight">GDP Soft</p>
              <p className="whitespace-normal text-[10px] leading-4 text-white/45">Panel de Administración</p>
            </div>
          )}

          <button
            type="button"
            onClick={onToggle}
            title={collapsed ? "Expandir menú" : "Contraer menú"}
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/[0.12] text-white transition hover:bg-[#703099] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <Icon
              icon={collapsed ? "fluent:panel-left-expand-24-regular" : "fluent:panel-left-contract-24-regular"}
              width="20"
            />
          </button>
        </div>

        <nav className="gdp-sidebar-scroll flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-2.5 py-3">
          <div className="space-y-1.5">
            {MENU.map((item) => (
              <SidebarItem key={item.href} item={item} />
            ))}
            {currentUser?.is_super_admin && (
              <SidebarItem item={{ label: "Estadísticas IA", href: "/admin/estadisticas-ia", emoji: "📈" }} />
            )}
          </div>
        </nav>

        <div className="shrink-0 border-t border-white/10 px-3 py-2">
          <button type="button" onClick={onToggle}
            aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
            title={collapsed ? "Expandir menú" : "Contraer menú"}
            className="flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-white/[0.08] text-white hover:bg-[#703099] focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">
            <Icon icon={collapsed ? "fluent:panel-left-expand-24-regular" : "fluent:panel-left-contract-24-regular"} width="23" />
            {!collapsed && <span className="text-xs font-medium">Contraer menú</span>}
          </button>
        </div>
        <div className={["border-t border-white/10", collapsed ? "p-3" : "px-3 py-3"].join(" ")}>
          <div className={["flex items-center", collapsed ? "justify-center" : "gap-3"].join(" ")}>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#8f2a85] text-xs font-bold text-white">
              {(currentUser?.full_name || currentUser?.username || "AD")
                .split(" ")
                .map((part) => part?.[0])
                .filter(Boolean)
                .slice(0, 2)
                .join("")
                .toUpperCase()}
            </div>

            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="whitespace-normal break-words text-xs font-semibold leading-4">{currentUser?.full_name || currentUser?.username || "Administrador"}</p>
                <p className="text-[11px] text-white/50">
                  {currentUser?.is_super_admin ? "Super Admin" : currentUser?.role === "ADMIN" ? "Administrador" : currentUser?.role || "Usuario"}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú"
        className="fixed left-4 top-[18px] z-[120] flex h-11 w-11 items-center justify-center rounded-xl bg-[#19082a] text-white shadow-lg md:hidden"
      >
        <Icon icon="fluent:navigation-24-regular" width="23" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-[300] md:hidden">
          <button
            type="button"
            aria-label="Cerrar menú"
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
          />

          <aside className="absolute inset-y-0 left-0 flex w-[280px] max-w-[84vw] flex-col bg-[#19082a] text-white shadow-2xl">
            <div className="flex h-[82px] items-center gap-3 border-b border-white/10 px-5">
              <img src="/images/gdpsoft-icon.png" alt="GDP Soft" className="h-11 w-11 object-contain" />
              <div>
                <p className="font-bold">GDP Soft</p>
                <p className="text-xs text-white/45">Panel de Administración</p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-5 flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"
            >
              <Icon icon="fluent:dismiss-24-regular" width="20" />
            </button>

            <nav className="gdp-sidebar-scroll flex-1 min-h-0 overflow-x-hidden overflow-y-auto px-3 py-3">
              <div className="space-y-1.5">
                {MENU.map((item) => (
                  <div key={item.href} onClick={() => item.available !== false && setMobileOpen(false)}>
                    <SidebarItem item={item} isMobile />
                  </div>
                ))}
                {currentUser?.is_super_admin && (
                  <div onClick={() => setMobileOpen(false)}>
                    <SidebarItem item={{ label: "Estadísticas IA", href: "/admin/estadisticas-ia", emoji: "📈" }} isMobile />
                  </div>
                )}
              </div>
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}

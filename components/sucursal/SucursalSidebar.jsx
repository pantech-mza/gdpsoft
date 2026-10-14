"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@iconify/react";

const MENU = [
  {
    label: "Inicio",
    href: "/sucursal",
    icon: "fluent-emoji:house",
  },
  {
    label: "Obras Sociales",
    href: "/sucursal/obras-sociales",
    icon: "fluent-emoji:hospital",
  },
  {
    label: "Normativas",
    href: "/sucursal/normativas",
    icon: "fluent-color:document-text-24",
  },
  {
    label: "Árboles de Decisión",
    href: "/sucursal/arboles",
    icon: "fluent-emoji:herb",
  },
  {
    label: "Preguntas Frecuentes",
    href: "/sucursal/faqs",
    icon: "fluent-emoji:red-question-mark",
  },
];

export default function SucursalSidebar({
  collapsed,
  onToggle,
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  function isActive(href) {
    if (href === "/sucursal") {
      return pathname === "/sucursal";
    }

    return pathname.startsWith(href);
  }

  return (
    <>
      {/* DESKTOP */}

      <aside
        className={[
          "fixed inset-y-0 left-0 z-50 hidden flex-col overflow-hidden bg-[#19082a] text-white transition-all duration-300 md:flex",
          collapsed
            ? "w-[82px]"
            : "w-[220px]",
        ].join(" ")}
      >
        <div
          className={[
            "flex h-[92px] items-center border-b border-white/10",
            collapsed
              ? "justify-center"
              : "gap-3 px-5",
          ].join(" ")}
        >
          <img
            src="/images/gdpsoft-icon.png"
            alt="GDP Soft"
            className="h-11 w-11 shrink-0 object-contain"
          />

          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold">
                GDP Soft
              </p>

              <p className="truncate text-[11px] text-white/45">
                Portal de Sucursal
              </p>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-5">
          <div className="space-y-2">
            {MENU.map((item) => {
              const active = isActive(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  className={[
                    "flex min-h-[56px] items-center rounded-[14px] transition",
                    collapsed
                      ? "justify-center"
                      : "gap-3 px-4",
                    active
                      ? "bg-gradient-to-r from-[#703099] to-[#592077] text-white"
                      : "text-white/70 hover:bg-white/[0.06] hover:text-white",
                  ].join(" ")}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-white/[0.04]">
                    <Icon
                      icon={item.icon}
                      width="25"
                      height="25"
                    />
                  </span>

                  {!collapsed && (
                    <>
                      <span className="text-[13px] font-medium">
                        {item.label}
                      </span>

                      <Icon
                        icon="fluent:chevron-right-20-regular"
                        width="17"
                        className="ml-auto text-white/25"
                      />
                    </>
                  )}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="border-t border-white/10 p-4">
          <button
            type="button"
            onClick={onToggle}
            className={[
              "flex h-11 w-full items-center rounded-[13px] text-white/65 transition hover:bg-white/[0.07] hover:text-white",
              collapsed
                ? "justify-center"
                : "gap-3 px-3",
            ].join(" ")}
          >
            <Icon
              icon={
                collapsed
                  ? "fluent:panel-left-expand-24-regular"
                  : "fluent:panel-left-contract-24-regular"
              }
              width="21"
            />

            {!collapsed && (
              <span className="text-xs font-medium">
                Contraer menú
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* MOBILE BUTTON */}

      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        aria-label="Abrir menú"
        className="fixed left-4 top-[18px] z-[120] flex h-11 w-11 items-center justify-center rounded-xl bg-[#19082a] text-white shadow-lg md:hidden"
      >
        <Icon
          icon="fluent:navigation-24-regular"
          width="23"
        />
      </button>

      {/* MOBILE DRAWER */}

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
              <img
                src="/images/gdpsoft-icon.png"
                alt="GDP Soft"
                className="h-11 w-11 object-contain"
              />

              <div>
                <p className="font-bold">
                  GDP Soft
                </p>

                <p className="text-xs text-white/45">
                  Portal de Sucursal
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-5 flex h-9 w-9 items-center justify-center rounded-xl bg-white/10"
            >
              <Icon
                icon="fluent:dismiss-24-regular"
                width="20"
              />
            </button>

            <nav className="flex-1 overflow-y-auto p-4">
              <div className="space-y-2">
                {MENU.map((item) => {
                  const active = isActive(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMobileOpen(false)}
                      className={[
                        "flex items-center gap-3 rounded-[13px] px-3 py-3 text-sm",
                        active
                          ? "bg-[#67268b] text-white"
                          : "text-white/70 hover:bg-white/[0.06]",
                      ].join(" ")}
                    >
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04]">
                        <Icon
                          icon={item.icon}
                          width="24"
                        />
                      </span>

                      <span>
                        {item.label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
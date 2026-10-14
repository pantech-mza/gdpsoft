"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@iconify/react";

const BASE_MODULES = [
  {
    title: "Obras Sociales",
    description: "Administrá obras sociales, normativas, contactos y datos operativos.",
    href: "/admin/obras-sociales",
    icon: "fluent-emoji:hospital",
    action: "Consultar",
  },
  {
    title: "Árboles de Decisión",
    description: "Revisá y gestioná árboles operativos por obra social.",
    href: "/admin/arboles",
    icon: "fluent-emoji:herb",
    action: "Consultar",
  },
  {
    title: "Preguntas Frecuentes",
    description: "Aprobá respuestas frecuentes sugeridas para las sucursales.",
    href: "/admin/faqs",
    icon: "fluent-emoji:red-question-mark",
    action: "Consultar",
  },
  {
    title: "Validación de respuestas",
    description: "Revisá respuestas del asistente y registrá observaciones.",
    href: "/admin/validacion",
    icon: "fluent-color:checkmark-circle-24",
    action: "Consultar",
  },
];

export default function AdminDashboardPage() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("gdpsoft_user");
      setUser(raw ? JSON.parse(raw) : null);
    } catch {
      setUser(null);
    }
  }, []);

  const displayName = user?.full_name || user?.username || "Administrador";
  const roleText = user?.is_super_admin ? "Superadministración" : "Administración";

  const cards = user?.is_super_admin
    ? [
        ...BASE_MODULES,
        {
          title: "Estadísticas IA",
          description: "Monitoreá calidad, costos, latencia y uso técnico del asistente.",
          href: "/admin/estadisticas-ia",
          icon: "fluent-color:data-trending-24",
          action: "Consultar",
        },
      ]
    : BASE_MODULES;

  return (
    <div>
      <div className="mb-8">
        <p className="text-sm font-medium text-[#8f2a85]">Farmacias del Plata</p>

        <h1 className="mt-1 break-words text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
          Hola, {displayName}
        </h1>

        <p className="mt-2 text-sm text-zinc-500">
          Perfil: <strong className="font-semibold text-zinc-700">{roleText}</strong>
        </p>
      </div>

      <div className="mb-7 overflow-hidden rounded-2xl border border-[#8f2a85]/10 bg-gradient-to-r from-[#8f2a85]/5 to-white p-6">
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8f2a85]">GDP Soft</p>

        <h2 className="mt-2 text-xl font-bold text-zinc-900">¿Qué querés gestionar hoy?</h2>

        <p className="mt-1 text-sm text-zinc-500">
          Accedé a obras sociales, normativas, árboles, preguntas frecuentes y validaciones desde un solo lugar.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#8f2a85]/25 hover:shadow-md"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8f2a85]/8 text-xl">
              <Icon icon={card.icon} width="26" height="26" />
            </div>

            <h3 className="mt-5 font-semibold text-zinc-900 group-hover:text-[#8f2a85]">{card.title}</h3>

            <p className="mt-2 text-sm leading-6 text-zinc-500">{card.description}</p>

            <p className="mt-5 text-xs font-semibold text-[#8f2a85]">{card.action} →</p>
          </Link>
        ))}
      </div>

      <div className="mt-7 rounded-2xl border border-zinc-200 bg-white p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#93c01f]/15">
            <Icon icon="fluent-emoji:robot" width="24" height="24" />
          </div>

          <div>
            <p className="font-semibold text-zinc-900">Asistente GDPSoft</p>

            <p className="mt-1 text-sm leading-6 text-zinc-500">
              El bot está disponible desde cualquier pantalla. Podés consultarle sobre obras sociales,
              validaciones, requisitos, procedimientos y documentación vigente.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

export default function SucursalHomePage() {
  const [
    branch,
    setBranch,
  ] = useState(null);

  const [
    user,
    setUser,
  ] = useState(null);

  useEffect(() => {
    try {
      const branchRaw =
        sessionStorage.getItem(
          "gdpsoft_branch"
        );

      const userRaw =
        sessionStorage.getItem(
          "gdpsoft_user"
        );

      if (branchRaw) {
        setBranch(
          JSON.parse(branchRaw)
        );
      }

      if (userRaw) {
        setUser(
          JSON.parse(userRaw)
        );
      }
    } catch {}
  }, []);

  const cards = [
    {
      title: "Obras Sociales",
      description:
        "Consultá requisitos, planes, validación y documentación.",
      icon: "🏥",
      href:
        "/sucursal/obras-sociales",
    },
    {
      title: "Normativas",
      description:
        "Revisá las normativas vigentes disponibles.",
      icon: "📄",
      href:
        "/sucursal/normativas",
    },
    {
      title:
        "Árboles de Decisión",
      description:
        "Resolvé situaciones operativas paso a paso.",
      icon: "🌿",
      href:
        "/sucursal/arboles",
    },
    {
      title:
        "Preguntas Frecuentes",
      description:
        "Consultá respuestas operativas previamente aprobadas.",
      icon: "❓",
      href:
        "/sucursal/faqs",
    },
  ];

  return (
    <div>

      <div className="mb-8">

        <p className="text-sm font-medium text-[#8f2a85]">
          Farmacias del Plata
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">
          Hola,{" "}
          {user?.username ||
            branch?.name ||
            "Sucursal"}
        </h1>

        <p className="mt-2 text-sm text-zinc-500">
          Sucursal:{" "}
          <strong className="font-semibold text-zinc-700">
            {branch?.name ||
              "-"}
          </strong>
          {branch?.branch_type
            ? ` · Circuito ${branch.branch_type}`
            : ""}
        </p>

      </div>

      <div className="mb-7 rounded-2xl border border-[#8f2a85]/10 bg-gradient-to-r from-[#8f2a85]/5 to-white p-6">

        <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#8f2a85]">
          GDP Soft
        </p>

        <h2 className="mt-2 text-xl font-bold text-zinc-900">
          ¿En qué podemos ayudarte hoy?
        </h2>

        <p className="mt-1 text-sm text-zinc-500">
          Consultá obras sociales,
          normativas, árboles o
          utilizá el asistente GDPSoft.
        </p>

      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

        {cards.map(
          (card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#8f2a85]/25 hover:shadow-md"
            >

              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#8f2a85]/8 text-xl">
                {card.icon}
              </div>

              <h3 className="mt-5 font-semibold text-zinc-900 group-hover:text-[#8f2a85]">
                {card.title}
              </h3>

              <p className="mt-2 text-sm leading-6 text-zinc-500">
                {
                  card.description
                }
              </p>

              <p className="mt-5 text-xs font-semibold text-[#8f2a85]">
                Consultar →
              </p>

            </Link>
          )
        )}

      </div>

      <div className="mt-7 rounded-2xl border border-zinc-200 bg-white p-5">

        <div className="flex items-start gap-3">

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#93c01f]/15">
            🤖
          </div>

          <div>

            <p className="font-semibold text-zinc-900">
              Asistente GDPSoft
            </p>

            <p className="mt-1 text-sm leading-6 text-zinc-500">
              El bot está disponible
              desde cualquier pantalla.
              Podés consultarle sobre
              obras sociales,
              validaciones, requisitos
              y procedimientos.
            </p>

          </div>

        </div>

      </div>

    </div>
  );
}
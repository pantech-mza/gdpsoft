"use client";

import Link from "next/link";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

export default function SucursalTreesPage() {
  const [
    socialWorks,
    setSocialWorks,
  ] = useState([]);

  const [
    search,
    setSearch,
  ] = useState("");

  useEffect(() => {
    async function load() {
      const response =
        await fetch(
          "/api/social-works",
          {
            cache:
              "no-store",
          }
        );

      const result =
        await response.json();

      if (
        response.ok &&
        result.ok
      ) {
        setSocialWorks(
          (
            result.social_works ||
            []
          ).filter(
            (item) =>
              item.active
          )
        );
      }
    }

    load();
  }, []);

  const filtered =
    useMemo(() => {
      const q =
        search
          .trim()
          .toLowerCase();

      if (!q) {
        return socialWorks;
      }

      return socialWorks.filter(
        (item) =>
          String(
            item.name || ""
          )
            .toLowerCase()
            .includes(q)
      );
    }, [
      search,
      socialWorks,
    ]);

  return (
    <div>

      <div className="mb-6">

        <p className="text-sm text-zinc-500">
          Consulta guiada
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">
          Árboles de Decisión
        </h1>

        <p className="mt-2 text-sm text-zinc-500">
          Seleccioná una obra social
          para consultar su guía
          operativa.
        </p>

      </div>

      <div className="mb-5 rounded-2xl border border-zinc-200 bg-white p-4">

        <input
          value={search}
          onChange={(e) =>
            setSearch(
              e.target.value
            )
          }
          placeholder="Buscar obra social..."
          className="h-12 w-full rounded-xl border border-zinc-200 px-4 text-sm outline-none focus:border-[#8f2a85]"
        />

      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">

        {filtered.map(
          (item) => (
            <Link
              key={item.id}
              href={`/sucursal/obras-sociales/${item.id}`}
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-[#8f2a85]/25 hover:shadow-md"
            >

              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#93c01f]/12">
                🌿
              </div>

              <p className="mt-4 font-semibold text-zinc-900">
                {item.name}
              </p>

              <p className="mt-1 text-sm text-zinc-500">
                Árbol de consulta
                operativa
              </p>

              <p className="mt-4 text-xs font-semibold text-[#8f2a85]">
                Abrir árbol →
              </p>

            </Link>
          )
        )}

      </div>

    </div>
  );
}
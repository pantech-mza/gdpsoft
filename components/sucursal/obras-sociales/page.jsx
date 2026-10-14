"use client";

import Link from "next/link";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

export default function SucursalSocialWorksPage() {
  const [
    socialWorks,
    setSocialWorks,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState(null);

  const [
    search,
    setSearch,
  ] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);

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
          !response.ok ||
          !result.ok
        ) {
          throw new Error(
            result?.error ||
              "No se pudieron cargar las obras sociales"
          );
        }

        setSocialWorks(
          (
            result.social_works ||
            []
          ).filter(
            (item) =>
              item.active
          )
        );
      } catch (err) {
        setError(
          err?.message ||
            "Error cargando obras sociales"
        );
      } finally {
        setLoading(false);
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
          [
            item.name,
            item.plan,
            item.recipe_type,
            item.tys_code,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)
      );
    }, [
      socialWorks,
      search,
    ]);

  return (
    <div>

      <div className="mb-6">

        <p className="text-sm text-zinc-500">
          Consulta operativa
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">
          Obras Sociales
        </h1>

        <p className="mt-2 text-sm text-zinc-500">
          Consultá información,
          normativas, requisitos y
          circuitos disponibles.
        </p>

      </div>

      <div className="mb-5 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">

        <input
          type="text"
          value={search}
          onChange={(event) =>
            setSearch(
              event.target.value
            )
          }
          placeholder="Buscar por obra social, plan, receta o código TYS..."
          className="h-12 w-full rounded-xl border border-zinc-200 px-4 text-sm outline-none transition focus:border-[#8f2a85] focus:ring-2 focus:ring-[#8f2a85]/10"
        />

      </div>

      {loading && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
          Cargando obras sociales...
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading &&
        !error && (
        <>

          <div className="mb-3 flex items-center justify-between">

            <p className="text-sm text-zinc-500">
              {
                filtered.length
              }{" "}
              obras sociales disponibles
            </p>

          </div>

          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">

            {filtered.map(
              (item) => (
                <Link
                  key={item.id}
                  href={`/sucursal/obras-sociales/${item.id}`}
                  className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-[#8f2a85]/25 hover:shadow-md"
                >

                  <div className="flex items-start justify-between gap-4">

                    <div>

                      <h2 className="font-semibold text-zinc-900">
                        {item.name}
                      </h2>

                      <p className="mt-1 text-xs text-zinc-400">
                        {
                          item.recipe_type ||
                          "Sin tipo de receta cargado"
                        }
                      </p>

                    </div>

                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      Activa
                    </span>

                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-2">

                    <Info
                      label="Código TYS"
                      value={
                        item.tys_code ||
                        "-"
                      }
                    />

                    <Info
                      label="Vigencia"
                      value={
                        item.recipe_validity_days !=
                        null
                          ? `${item.recipe_validity_days} días`
                          : "-"
                      }
                    />

                    <Info
                      label="Normativas"
                      value={
                        item.normative_count ??
                        0
                      }
                    />

                    <Info
                      label="FAQs"
                      value={
                        item.faq_count ??
                        0
                      }
                    />

                  </div>

                  <p className="mt-4 text-right text-xs font-semibold text-[#8f2a85]">
                    Ver información →
                  </p>

                </Link>
              )
            )}

          </div>

        </>
      )}

    </div>
  );
}

function Info({
  label,
  value,
}) {
  return (
    <div className="rounded-xl bg-zinc-50 px-3 py-2.5">

      <p className="text-[10px] uppercase tracking-wide text-zinc-400">
        {label}
      </p>

      <p className="mt-1 text-sm font-semibold text-zinc-700">
        {value}
      </p>

    </div>
  );
}
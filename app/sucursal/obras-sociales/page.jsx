"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { Icon } from "@iconify/react";

const PAGE_SIZE = 15;

export default function SucursalObrasSocialesPage() {
  const [socialWorks, setSocialWorks] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  const [error, setError] =
    useState("");

  const [search, setSearch] =
    useState("");

  const [statusFilter, setStatusFilter] =
    useState("ALL");

  const [page, setPage] =
    useState(1);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError("");

        const response =
          await fetch(
            "/api/social-works",
            {
              cache: "no-store",
            }
          );

        const result =
          await response.json();

        if (
          !response.ok ||
          !result?.ok
        ) {
          throw new Error(
            result?.error ||
              "No se pudieron cargar las obras sociales"
          );
        }

        // La API devuelve activas e inactivas. La selección es visual.
        setSocialWorks(result.social_works || []);
      } catch (err) {
        setError(
          err?.message ||
            "No se pudieron cargar las obras sociales."
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const activeCount = useMemo(
    () => socialWorks.filter((item) => item.active === true).length,
    [socialWorks]
  );
  const inactiveCount = useMemo(
    () => socialWorks.filter((item) => item.active === false).length,
    [socialWorks]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();

    return socialWorks.filter((item) => {
      if (statusFilter === "ACTIVE" && item.active !== true) return false;
      if (statusFilter === "INACTIVE" && item.active !== false) return false;
      if (!q) return true;

      return [item.name, item.plan, item.recipe_type, item.tys_code]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [socialWorks, search, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter]);

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filtered.length /
          PAGE_SIZE
      )
    );

  const startIndex =
    (page - 1) *
    PAGE_SIZE;

  const pageItems =
    filtered.slice(
      startIndex,
      startIndex + PAGE_SIZE
    );

  return (
    <div className="min-w-0">

      {/* HEADER */}

      <div className="mb-5 sm:mb-7">

        <div className="flex min-w-0 items-start gap-3">

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f8eafa] sm:h-11 sm:w-11">
            <Icon
              icon="fluent-emoji:hospital"
              width="25"
            />
          </div>

          <div className="min-w-0">

            <h1 className="break-words text-[25px] font-bold leading-tight tracking-[-0.6px] text-[#191020] sm:text-[30px]">
              Obras Sociales
            </h1>

            <p className="mt-1 max-w-full text-[13px] leading-5 text-zinc-500 sm:text-[14px]">
              Consultá información operativa, normativas,
              requisitos y circuitos.
            </p>

          </div>

        </div>

      </div>

      {/* SEARCH */}

      <div className="mb-5 w-full rounded-[15px] border border-zinc-200 bg-white p-3 shadow-sm sm:mb-6 sm:p-4">

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">

          <Icon
            icon="fluent:search-20-regular"
            width="20"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 sm:left-4"
          />

          <input
            value={search}
            onChange={(e) =>
              setSearch(
                e.target.value
              )
            }
            placeholder="Buscar obra social..."
            className="h-11 w-full min-w-0 rounded-xl border border-zinc-200 pl-10 pr-3 text-[13px] outline-none focus:border-[#8f2a85] sm:h-12 sm:pl-11 sm:text-sm"
          />

          </div>

          <div className="w-full shrink-0 sm:w-52">
            <label htmlFor="sw-status-filter" className="sr-only">
              Filtrar obras sociales por estado
            </label>
            <select
              id="sw-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-[13px] text-zinc-700 outline-none focus:border-[#8f2a85] sm:h-12 sm:text-sm"
            >
              <option value="ALL">Todas ({socialWorks.length})</option>
              <option value="ACTIVE">Activas ({activeCount})</option>
              <option value="INACTIVE">Inactivas ({inactiveCount})</option>
            </select>
          </div>

        </div>

      </div>

      {!loading &&
        !error && (
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">

          <p className="text-[13px] text-zinc-500">
            <strong className="text-zinc-700">
              {filtered.length}
            </strong>{" "}
            obras sociales encontradas
          </p>

          {filtered.length >
            0 && (
            <p className="text-[12px] text-zinc-400">
              Mostrando{" "}
              {startIndex + 1} -{" "}
              {Math.min(
                startIndex +
                  PAGE_SIZE,
                filtered.length
              )}{" "}
              de{" "}
              {filtered.length}
            </p>
          )}

        </div>
      )}

      {/* LIST */}

      {!loading &&
        !error &&
        pageItems.length >
          0 && (
        <div className="grid min-w-0 gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">

          {pageItems.map(
            (item) => (
              <Link
                key={item.id}
                href={`/sucursal/obras-sociales/${item.id}`}
                className="min-w-0 overflow-hidden rounded-[16px] border border-zinc-200 bg-white p-4 shadow-sm transition hover:border-[#8f2a85]/25 sm:p-5"
              >

                <div className="flex min-w-0 items-start gap-3">

                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f9eafa]">
                    <Icon
                      icon="fluent-emoji:hospital"
                      width="23"
                    />
                  </div>

                  <div className="min-w-0 flex-1">

                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <h2 className="break-words text-[15px] font-bold leading-5 text-[#21142b]">
                        {item.name}
                      </h2>
                      <span
                        className={item.active === true
                          ? "inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700"
                          : "inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-1 text-[10px] font-semibold text-rose-700"}
                      >
                        <span className={item.active === true
                          ? "h-1.5 w-1.5 rounded-full bg-emerald-500"
                          : "h-1.5 w-1.5 rounded-full bg-rose-500"} />
                        {item.active === true ? "Activa" : "Inactiva"}
                      </span>
                    </div>

                    <p className="mt-1 break-words text-[12px] leading-4 text-zinc-400">
                      {item.recipe_type ||
                        "Información operativa"}
                    </p>

                  </div>

                </div>

                <div className="mt-4 grid min-w-0 grid-cols-2 gap-2">

                  <InfoBox
                    label="Código TYS"
                    value={
                      item.tys_code ||
                      "-"
                    }
                  />

                  <InfoBox
                    label="Vigencia"
                    value={
                      item.recipe_validity_days !=
                      null
                        ? `${item.recipe_validity_days} días`
                        : "-"
                    }
                  />

                  <InfoBox
                    label="Normativas"
                    value={
                      item.normative_count ??
                      0
                    }
                  />

                  <InfoBox
                    label="FAQs"
                    value={
                      item.faq_count ??
                      0
                    }
                  />

                </div>

                <div className="mt-4 flex justify-end">

                  <span className="inline-flex items-center gap-1 text-[12px] font-bold text-[#9827b6]">
                    Ver información

                    <Icon
                      icon="fluent:arrow-right-20-regular"
                      width="15"
                    />
                  </span>

                </div>

              </Link>
            )
          )}

        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="rounded-xl border border-zinc-200 bg-white px-4 py-8 text-center text-sm text-zinc-500">
          No se encontraron obras sociales con estos filtros.
        </div>
      )}

      {/* PAGINATION */}

      {!loading &&
        !error &&
        totalPages > 1 && (
        <div className="mt-6 flex min-w-0 flex-col gap-3 rounded-[15px] border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">

          <span className="text-[12px] text-zinc-400">
            Página {page} de{" "}
            {totalPages}
          </span>

          <div className="flex min-w-0 items-center justify-between gap-2 sm:justify-end">

            <button
              type="button"
              disabled={
                page === 1
              }
              onClick={() =>
                setPage(
                  (current) =>
                    current - 1
                )
              }
              className="flex h-9 min-w-0 items-center gap-1 rounded-lg border border-zinc-200 px-3 text-[12px] font-semibold disabled:opacity-40"
            >
              <Icon
                icon="fluent:chevron-left-20-regular"
                width="15"
              />

              <span className="hidden xs:inline sm:inline">
                Anterior
              </span>
            </button>

            <span className="flex h-9 min-w-[38px] items-center justify-center rounded-lg bg-[#8f2a85] px-2 text-xs font-bold text-white">
              {page}
            </span>

            <button
              type="button"
              disabled={
                page ===
                totalPages
              }
              onClick={() =>
                setPage(
                  (current) =>
                    current + 1
                )
              }
              className="flex h-9 min-w-0 items-center gap-1 rounded-lg border border-zinc-200 px-3 text-[12px] font-semibold disabled:opacity-40"
            >
              <span className="hidden xs:inline sm:inline">
                Siguiente
              </span>

              <Icon
                icon="fluent:chevron-right-20-regular"
                width="15"
              />
            </button>

          </div>

        </div>
      )}

    </div>
  );
}

function InfoBox({
  label,
  value,
}) {
  return (
    <div className="min-w-0 rounded-xl bg-[#f8f7fa] px-3 py-2.5">

      <p className="truncate text-[8px] font-bold uppercase tracking-[.06em] text-zinc-400 sm:text-[9px]">
        {label}
      </p>

      <p className="mt-1 break-words text-[12px] font-semibold text-zinc-700 sm:text-[13px]">
        {value}
      </p>

    </div>
  );
}
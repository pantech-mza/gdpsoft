"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { Icon } from "@iconify/react";

const PAGE_SIZE = 12;

export default function SucursalNormativasPage() {
  const [normatives, setNormatives] = useState([]);
  const [socialWorks, setSocialWorks] = useState([]);

  const [search, setSearch] = useState("");
  const [socialWorkFilter, setSocialWorkFilter] = useState("");

  const [page, setPage] = useState(1);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* =========================================================
     CARGA
     ========================================================= */

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const [
          normativesResponse,
          socialWorksResponse,
        ] = await Promise.all([
          fetch("/api/normatives", {
            cache: "no-store",
          }),

          fetch("/api/social-works", {
            cache: "no-store",
          }),
        ]);

        let normativesResult = null;
        let socialWorksResult = null;

        try {
          normativesResult =
            await normativesResponse.json();
        } catch {
          throw new Error(
            "La API de normativas no devolvió JSON válido."
          );
        }

        try {
          socialWorksResult =
            await socialWorksResponse.json();
        } catch {
          socialWorksResult = null;
        }

        if (
          !normativesResponse.ok ||
          !normativesResult?.ok
        ) {
          throw new Error(
            normativesResult?.error ||
              "No se pudieron cargar las normativas"
          );
        }

        const currentNormatives =
          (
            normativesResult.normatives ||
            []
          ).filter(
            (item) =>
              item.is_current !== false &&
              item.status !== "ARCHIVED"
          );

        setNormatives(currentNormatives);

        if (
          socialWorksResponse.ok &&
          socialWorksResult?.ok
        ) {
          setSocialWorks(
            (
              socialWorksResult.social_works ||
              []
            )
              .filter(
                (item) =>
                  item.active === true
              )
              .sort(
                (a, b) =>
                  String(a.name).localeCompare(
                    String(b.name),
                    "es"
                  )
              )
          );
        }
      } catch (err) {
        console.error(
          "Error cargando normativas:",
          err
        );

        setError(
          err?.message ||
            "No se pudieron cargar las normativas."
        );
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  /* =========================================================
     HELPERS
     ========================================================= */

  function getRelations(item) {
    return Array.isArray(
      item.normative_social_works
    )
      ? item.normative_social_works
      : [];
  }

  function getSocialWorkIds(item) {
    const ids = new Set();

    getRelations(item).forEach(
      (relation) => {
        const id =
          relation?.social_work_id ??
          relation?.social_works?.id;

        if (id != null) {
          ids.add(String(id));
        }
      }
    );

    if (
      Array.isArray(
        item.social_works
      )
    ) {
      item.social_works.forEach(
        (socialWork) => {
          if (
            socialWork?.id != null
          ) {
            ids.add(
              String(
                socialWork.id
              )
            );
          }
        }
      );
    }

    return [...ids];
  }

  function getSocialWorkNames(item) {
    const names = new Set();

    if (
      Array.isArray(
        item.social_works
      )
    ) {
      item.social_works.forEach(
        (socialWork) => {
          if (
            socialWork?.name
          ) {
            names.add(
              socialWork.name
            );
          }
        }
      );
    }

    getRelations(item).forEach(
      (relation) => {
        if (
          relation?.social_works
            ?.name
        ) {
          names.add(
            relation
              .social_works
              .name
          );
        }
      }
    );

    return [...names];
  }

  function getBillingChannels(item) {
    const channels = new Set();

    if (
      Array.isArray(
        item.social_works
      )
    ) {
      item.social_works.forEach(
        (socialWork) => {
          const name =
            socialWork
              ?.billing_channel
              ?.name;

          if (name) {
            channels.add(
              name
            );
          }
        }
      );
    }

    getRelations(item).forEach(
      (relation) => {
        const name =
          relation
            ?.billing_channels
            ?.name;

        if (name) {
          channels.add(
            name
          );
        }
      }
    );

    return [...channels];
  }

  function getScopes(item) {
    const scopes = new Set();

    if (
      Array.isArray(
        item.social_works
      )
    ) {
      item.social_works.forEach(
        (socialWork) => {
          const name =
            socialWork?.scope
              ?.name;

          if (name) {
            scopes.add(
              name
            );
          }
        }
      );
    }

    getRelations(item).forEach(
      (relation) => {
        const name =
          relation
            ?.social_work_scopes
            ?.name;

        if (name) {
          scopes.add(
            name
          );
        }
      }
    );

    return [...scopes];
  }

  function hasPrimaryRelation(item) {
    return getRelations(
      item
    ).some(
      (relation) =>
        relation.is_primary ===
          true ||
        relation.document_role ===
          "PRIMARY"
    );
  }

  function hasExtraRelation(item) {
    return getRelations(
      item
    ).some(
      (relation) =>
        relation.document_role ===
        "EXTRA"
    );
  }

  /* =========================================================
     FILTROS
     ========================================================= */

  const filtered =
    useMemo(() => {
      const q =
        search
          .trim()
          .toLowerCase();

      return normatives.filter(
        (item) => {
          if (
            socialWorkFilter
          ) {
            const ids =
              getSocialWorkIds(
                item
              );

            if (
              !ids.includes(
                String(
                  socialWorkFilter
                )
              )
            ) {
              return false;
            }
          }

          if (!q) {
            return true;
          }

          const socialWorkNames =
            getSocialWorkNames(
              item
            );

          const billingChannels =
            getBillingChannels(
              item
            );

          const scopes =
            getScopes(item);

          const haystack =
            [
              item.title,
              item.original_filename,
              item.processing_selected,
              item.processing_recommended,
              item.status,
              item.document_kind,
              ...socialWorkNames,
              ...billingChannels,
              ...scopes,
            ]
              .filter(Boolean)
              .join(" ")
              .toLowerCase();

          return haystack.includes(
            q
          );
        }
      );
    }, [
      normatives,
      search,
      socialWorkFilter,
    ]);

  useEffect(() => {
    setPage(1);
  }, [
    search,
    socialWorkFilter,
  ]);

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filtered.length /
          PAGE_SIZE
      )
    );

  useEffect(() => {
    if (
      page > totalPages
    ) {
      setPage(
        totalPages
      );
    }
  }, [
    page,
    totalPages,
  ]);

  const startIndex =
    (page - 1) *
    PAGE_SIZE;

  const pageItems =
    filtered.slice(
      startIndex,
      startIndex +
        PAGE_SIZE
    );

  const visibleFrom =
    filtered.length === 0
      ? 0
      : startIndex + 1;

  const visibleTo =
    Math.min(
      startIndex +
        PAGE_SIZE,
      filtered.length
    );

  /* =========================================================
     RENDER
     ========================================================= */

  return (
    <div className="min-w-0">

      {/* HEADER */}

      <div className="mb-5 sm:mb-7">

        <div className="flex min-w-0 items-start gap-3">

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f4ecf9] sm:h-11 sm:w-11">

            <Icon
              icon="fluent-color:document-text-24"
              width="25"
              height="25"
            />

          </div>

          <div className="min-w-0">

            <h1 className="break-words text-[25px] font-bold leading-tight tracking-[-0.6px] text-[#191020] sm:text-[30px]">
              Normativas
            </h1>

            <p className="mt-1 max-w-full text-[13px] leading-5 text-zinc-500 sm:text-[14px]">
              Consultá la documentación vigente disponible para las Obras Sociales.
            </p>

          </div>

        </div>

      </div>

      {/* FILTROS */}

      <div className="mb-5 rounded-[16px] border border-zinc-200 bg-white p-3 shadow-sm sm:mb-6 sm:p-4">

        <div className="grid min-w-0 gap-3 lg:grid-cols-[1fr_300px]">

          {/* SEARCH */}

          <div className="relative min-w-0">

            <Icon
              icon="fluent:search-20-regular"
              width="20"
              height="20"
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 sm:left-4"
            />

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Buscar normativa, archivo, obra social, circuito..."
              className="h-11 w-full min-w-0 rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-[13px] text-zinc-700 outline-none transition focus:border-[#8f2a85] focus:ring-2 focus:ring-[#8f2a85]/10 sm:h-12 sm:pl-11 sm:text-sm"
            />

          </div>

          {/* OOSS */}

          <div className="relative min-w-0">

            <Icon
              icon="fluent:building-20-regular"
              width="18"
              height="18"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />

            <select
              value={
                socialWorkFilter
              }
              onChange={(event) =>
                setSocialWorkFilter(
                  event.target.value
                )
              }
              className="h-11 w-full min-w-0 appearance-none rounded-xl border border-zinc-200 bg-white pl-10 pr-9 text-[13px] text-zinc-700 outline-none transition focus:border-[#8f2a85] focus:ring-2 focus:ring-[#8f2a85]/10 sm:h-12"
            >
              <option value="">
                Todas las Obras Sociales
              </option>

              {socialWorks.map(
                (item) => (
                  <option
                    key={item.id}
                    value={item.id}
                  >
                    {item.name}
                  </option>
                )
              )}

            </select>

            <Icon
              icon="fluent:chevron-down-20-regular"
              width="17"
              height="17"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />

          </div>

        </div>

      </div>

      {/* LOADING */}

      {loading && (
        <LoadingState />
      )}

      {/* ERROR */}

      {!loading &&
        error && (
          <ErrorState
            message={error}
          />
        )}

      {/* CONTENT */}

      {!loading &&
        !error && (
          <>

            <div className="mb-4 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">

              <p className="text-[13px] text-zinc-500">

                <strong className="font-semibold text-zinc-700">
                  {filtered.length}
                </strong>{" "}
                normativas disponibles

              </p>

              {filtered.length >
                0 && (
                <p className="text-[12px] text-zinc-400">
                  Mostrando{" "}
                  {visibleFrom} -{" "}
                  {visibleTo} de{" "}
                  {filtered.length}
                </p>
              )}

            </div>

            {filtered.length ===
            0 ? (
              <EmptyState />
            ) : (
              <>

                <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">

                  {pageItems.map(
                    (item) => (
                      <NormativeCard
                        key={item.id}
                        item={item}
                        socialWorkNames={
                          getSocialWorkNames(
                            item
                          )
                        }
                        billingChannels={
                          getBillingChannels(
                            item
                          )
                        }
                        scopes={
                          getScopes(
                            item
                          )
                        }
                        hasPrimary={
                          hasPrimaryRelation(
                            item
                          )
                        }
                        hasExtra={
                          hasExtraRelation(
                            item
                          )
                        }
                      />
                    )
                  )}

                </div>

                {totalPages >
                  1 && (
                  <Pagination
                    page={page}
                    totalPages={
                      totalPages
                    }
                    onChange={
                      setPage
                    }
                  />
                )}

              </>
            )}

          </>
        )}

    </div>
  );
}

/* =========================================================
   CARD
   ========================================================= */

function NormativeCard({
  item,
  socialWorkNames,
  billingChannels,
  scopes,
  hasPrimary,
  hasExtra,
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-[16px] border border-zinc-200 bg-white p-4 shadow-[0_5px_16px_rgba(40,25,55,.04)] sm:p-5">

      <div className="flex min-w-0 items-start gap-3">

        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#f4ecf9]">

          <Icon
            icon="fluent-color:document-pdf-24"
            width="25"
            height="25"
          />

        </div>

        <div className="min-w-0 flex-1">

          {/* STATUS */}

          <div className="flex min-w-0 flex-wrap gap-2">

            <span className="rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-bold text-emerald-700 sm:text-[9px]">
              VIGENTE
            </span>

            {hasPrimary && (
              <span className="rounded-full bg-[#8f2a85]/10 px-2 py-1 text-[8px] font-bold text-[#8f2a85] sm:text-[9px]">
                PRINCIPAL
              </span>
            )}

            {hasExtra && (
              <span className="rounded-full bg-amber-50 px-2 py-1 text-[8px] font-bold text-amber-700 sm:text-[9px]">
                EXTRA
              </span>
            )}

          </div>

          {/* TITLE */}

          <h2 className="mt-3 break-words text-[14px] font-bold leading-5 text-[#21142b] sm:text-[15px]">
            {item.title ||
              item.original_filename ||
              "Normativa"}
          </h2>

          {/* OOSS */}

          {socialWorkNames.length >
            0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">

              {socialWorkNames.map(
                (name) => (
                  <span
                    key={name}
                    className="max-w-full break-words rounded-full bg-[#f8eff9] px-2.5 py-1 text-[9px] font-semibold text-[#8f2a85] sm:text-[10px]"
                  >
                    {name}
                  </span>
                )
              )}

            </div>
          )}

          {/* FILE */}

          {item.original_filename && (
            <p className="mt-3 break-all text-[11px] leading-4 text-zinc-400">
              {item.original_filename}
            </p>
          )}

        </div>

      </div>

      {/* META */}

      <div className="mt-4 grid min-w-0 grid-cols-2 gap-2">

        <InfoBox
          label="Procesamiento"
          value={
            item.processing_selected ||
            item.processing_recommended ||
            "-"
          }
        />

        <InfoBox
          label="Versión"
          value={
            item.version ||
            "-"
          }
        />

        <InfoBox
          label="Circuito"
          value={
            billingChannels.length >
            0
              ? billingChannels.join(
                  " / "
                )
              : "-"
          }
        />

        <InfoBox
          label="Alcance"
          value={
            scopes.length >
            0
              ? scopes.join(
                  " / "
                )
              : "-"
          }
        />

      </div>

      {/* OPENAI STATUS - SOLO INDICACIÓN OPERATIVA */}

      {item.openai_status && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#f8f7fa] px-3 py-2.5">

          <span
            className={[
              "h-2 w-2 shrink-0 rounded-full",
              item.openai_status ===
              "completed"
                ? "bg-emerald-500"
                : "bg-amber-400",
            ].join(" ")}
          />

          <p className="text-[10px] font-medium text-zinc-500">
            Documento disponible para consulta
          </p>

        </div>
      )}

      {/* DOCUMENT */}

      {item.source_url && (
        <a
          href={
            item.source_url
          }
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 text-[12px] font-semibold text-zinc-600 transition hover:border-[#8f2a85]/20 hover:bg-[#faf7fb] hover:text-[#8f2a85]"
        >
          <Icon
            icon="fluent:open-20-regular"
            width="16"
            height="16"
          />

          Ver documento
        </a>
      )}

    </div>
  );
}

/* =========================================================
   INFO BOX
   ========================================================= */

function InfoBox({
  label,
  value,
}) {
  return (
    <div className="min-w-0 rounded-xl bg-[#f8f7fa] px-3 py-2.5">

      <p className="truncate text-[8px] font-bold uppercase tracking-[.06em] text-zinc-400 sm:text-[9px]">
        {label}
      </p>

      <p className="mt-1 break-words text-[12px] font-semibold leading-4 text-zinc-700 sm:text-[13px]">
        {value}
      </p>

    </div>
  );
}

/* =========================================================
   PAGINATION
   ========================================================= */

function Pagination({
  page,
  totalPages,
  onChange,
}) {
  return (
    <div className="mt-6 flex min-w-0 flex-col gap-3 rounded-[15px] border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">

      <span className="text-[12px] text-zinc-400">
        Página{" "}
        <strong className="text-zinc-600">
          {page}
        </strong>{" "}
        de{" "}
        <strong className="text-zinc-600">
          {totalPages}
        </strong>
      </span>

      <div className="flex items-center justify-between gap-2 sm:justify-end">

        <button
          type="button"
          disabled={
            page === 1
          }
          onClick={() =>
            onChange(
              Math.max(
                1,
                page - 1
              )
            )
          }
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 px-3 text-[12px] font-semibold text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon
            icon="fluent:chevron-left-20-regular"
            width="15"
          />

          Anterior
        </button>

        <span className="flex h-9 min-w-9 items-center justify-center rounded-lg bg-[#8f2a85] px-2 text-[12px] font-bold text-white">
          {page}
        </span>

        <button
          type="button"
          disabled={
            page ===
            totalPages
          }
          onClick={() =>
            onChange(
              Math.min(
                totalPages,
                page + 1
              )
            )
          }
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 px-3 text-[12px] font-semibold text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Siguiente

          <Icon
            icon="fluent:chevron-right-20-regular"
            width="15"
          />
        </button>

      </div>

    </div>
  );
}

/* =========================================================
   STATES
   ========================================================= */

function LoadingState() {
  return (
    <div className="rounded-[16px] border border-zinc-200 bg-white p-10 text-center">

      <Icon
        icon="fluent:spinner-ios-20-regular"
        width="27"
        height="27"
        className="mx-auto animate-spin text-[#8f2a85]"
      />

      <p className="mt-3 text-sm text-zinc-500">
        Cargando normativas...
      </p>

    </div>
  );
}

function ErrorState({
  message,
}) {
  return (
    <div className="rounded-[15px] border border-red-200 bg-red-50 p-4 sm:p-5">

      <div className="flex min-w-0 gap-3">

        <Icon
          icon="fluent:error-circle-24-regular"
          width="22"
          height="22"
          className="shrink-0 text-red-500"
        />

        <div className="min-w-0">

          <p className="font-semibold text-red-700">
            No pudimos cargar las normativas
          </p>

          <p className="mt-1 break-words text-sm text-red-600">
            {message}
          </p>

        </div>

      </div>

    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-[16px] border border-zinc-200 bg-white px-4 py-12 text-center">

      <Icon
        icon="fluent:document-dismiss-24-regular"
        width="32"
        height="32"
        className="mx-auto text-zinc-300"
      />

      <p className="mt-3 font-semibold text-zinc-700">
        No encontramos normativas
      </p>

      <p className="mx-auto mt-1 max-w-lg text-[13px] leading-5 text-zinc-400">
        Probá con otro término u Obra Social.
      </p>

    </div>
  );
}
"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { Icon } from "@iconify/react";

const PAGE_SIZE = 12;

export default function SucursalFaqsPage() {
  const [faqs, setFaqs] = useState([]);
  const [socialWorks, setSocialWorks] = useState([]);

  const [search, setSearch] = useState("");
  const [socialWorkFilter, setSocialWorkFilter] =
    useState("");

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
          faqsResponse,
          socialWorksResponse,
        ] = await Promise.all([
          fetch(
            "/api/faqs?status=APPROVED",
            {
              cache: "no-store",
            }
          ),

          fetch(
            "/api/social-works",
            {
              cache: "no-store",
            }
          ),
        ]);

        const faqsResult =
          await faqsResponse.json();

        const socialWorksResult =
          await socialWorksResponse.json();

        if (
          !faqsResponse.ok ||
          !faqsResult?.ok
        ) {
          throw new Error(
            faqsResult?.error ||
              "No se pudieron cargar las preguntas frecuentes"
          );
        }

        const approvedFaqs =
          (
            faqsResult.faqs ||
            []
          ).filter(
            (faq) =>
              faq.active !== false
          );

        setFaqs(
          approvedFaqs
        );

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
                  String(
                    a.name
                  ).localeCompare(
                    String(
                      b.name
                    ),
                    "es"
                  )
              )
          );
        }
      } catch (err) {
        console.error(
          "Error cargando FAQs:",
          err
        );

        setError(
          err?.message ||
            "No se pudieron cargar las preguntas frecuentes."
        );
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  /* =========================================================
     FILTROS
     ========================================================= */

  const filtered =
    useMemo(() => {
      const q =
        search
          .trim()
          .toLowerCase();

      return faqs.filter(
        (faq) => {
          if (
            socialWorkFilter
          ) {
            const faqSocialWorkId =
              String(
                faq.social_work_id ??
                  faq.socialWorkId ??
                  ""
              );

            if (
              faqSocialWorkId !==
              String(
                socialWorkFilter
              )
            ) {
              return false;
            }
          }

          if (!q) {
            return true;
          }

          const haystack =
            [
              faq.question,
              faq.answer,
              faq.social_work_name,
              faq.socialWork?.name,
              faq.social_works?.name,
            ]
              .filter(
                Boolean
              )
              .join(" ")
              .toLowerCase();

          return haystack.includes(
            q
          );
        }
      );
    }, [
      faqs,
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
      page >
      totalPages
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

          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f9eafa] sm:h-11 sm:w-11">

            <Icon
              icon="fluent-emoji:red-question-mark"
              width="25"
              height="25"
            />

          </div>

          <div className="min-w-0">

            <h1 className="break-words text-[25px] font-bold leading-tight tracking-[-0.6px] text-[#191020] sm:text-[30px]">
              Preguntas Frecuentes
            </h1>

            <p className="mt-1 max-w-full text-[13px] leading-5 text-zinc-500 sm:text-[14px]">
              Consultá respuestas
              operativas previamente
              revisadas y aprobadas.
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
              onChange={(
                event
              ) =>
                setSearch(
                  event.target
                    .value
                )
              }
              placeholder="Buscar pregunta, respuesta u obra social..."
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
              onChange={(
                event
              ) =>
                setSocialWorkFilter(
                  event.target
                    .value
                )
              }
              className="h-11 w-full min-w-0 appearance-none rounded-xl border border-zinc-200 bg-white pl-10 pr-9 text-[13px] text-zinc-700 outline-none transition focus:border-[#8f2a85] focus:ring-2 focus:ring-[#8f2a85]/10 sm:h-12"
            >
              <option value="">
                Todas las Obras
                Sociales
              </option>

              {socialWorks.map(
                (item) => (
                  <option
                    key={
                      item.id
                    }
                    value={
                      item.id
                    }
                  >
                    {
                      item.name
                    }
                  </option>
                )
              )}

            </select>

            <Icon
              icon="fluent:chevron-down-20-regular"
              width="17"
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
            message={
              error
            }
          />
        )}

      {/* CONTENT */}

      {!loading &&
        !error && (
          <>
            <div className="mb-4 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">

              <p className="text-[13px] text-zinc-500">

                <strong className="font-semibold text-zinc-700">
                  {
                    filtered.length
                  }
                </strong>{" "}
                preguntas disponibles

              </p>

              {filtered.length >
                0 && (
                <p className="text-[12px] text-zinc-400">
                  Mostrando{" "}
                  {
                    visibleFrom
                  }{" "}
                  -{" "}
                  {
                    visibleTo
                  }{" "}
                  de{" "}
                  {
                    filtered.length
                  }
                </p>
              )}

            </div>

            {/* EMPTY */}

            {filtered.length ===
            0 ? (
              <EmptyState />
            ) : (
              <>
                {/* FAQ LIST */}

                <div className="min-w-0 space-y-3">

                  {pageItems.map(
                    (
                      faq
                    ) => (
                      <FaqItem
                        key={
                          faq.id
                        }
                        faq={
                          faq
                        }
                        socialWorks={
                          socialWorks
                        }
                      />
                    )
                  )}

                </div>

                {/* PAGINATION */}

                {totalPages >
                  1 && (
                  <Pagination
                    page={
                      page
                    }
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
   FAQ ITEM
   ========================================================= */

function FaqItem({
  faq,
  socialWorks,
}) {
  const socialWork =
    socialWorks.find(
      (item) =>
        String(
          item.id
        ) ===
        String(
          faq.social_work_id ??
            faq.socialWorkId
        )
    );

  const socialWorkName =
    faq.social_work_name ||
    faq.socialWork
      ?.name ||
    faq.social_works
      ?.name ||
    socialWork?.name ||
    null;

  return (
    <details className="group min-w-0 overflow-hidden rounded-[16px] border border-zinc-200 bg-white shadow-[0_4px_14px_rgba(40,25,55,.03)]">

      <summary className="flex min-w-0 cursor-pointer list-none items-start justify-between gap-3 p-4 sm:p-5">

        <div className="flex min-w-0 items-start gap-3">

          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#f9eafa] sm:h-10 sm:w-10">

            <Icon
              icon="fluent-emoji:red-question-mark"
              width="20"
            />

          </div>

          <div className="min-w-0">

            {socialWorkName && (
              <p className="mb-1 text-[9px] font-bold uppercase tracking-[.08em] text-[#8f2a85] sm:text-[10px]">
                {
                  socialWorkName
                }
              </p>
            )}

            <p className="break-words text-[13px] font-semibold leading-5 text-[#21142b] sm:text-[14px]">
              {
                faq.question
              }
            </p>

          </div>

        </div>

        <Icon
          icon="fluent:chevron-down-20-regular"
          width="19"
          height="19"
          className="mt-1 shrink-0 text-zinc-400 transition-transform duration-200 group-open:rotate-180"
        />

      </summary>

      <div className="min-w-0 border-t border-zinc-100 bg-[#fcfbfd] px-4 py-4 sm:px-5">

        <div className="flex min-w-0 items-start gap-3">

          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#edf8dc]">

            <Icon
              icon="fluent:checkmark-circle-20-regular"
              width="17"
              className="text-[#668c00]"
            />

          </div>

          <p className="min-w-0 whitespace-pre-wrap break-words text-[12px] leading-5 text-zinc-600 sm:text-[13px] sm:leading-6">
            {
              faq.answer
            }
          </p>

        </div>

      </div>

    </details>
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
          {
            totalPages
          }
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
        className="mx-auto animate-spin text-[#8f2a85]"
      />

      <p className="mt-3 text-sm text-zinc-500">
        Cargando preguntas...
      </p>

    </div>
  );
}

function ErrorState({
  message,
}) {
  return (
    <div className="rounded-[15px] border border-red-200 bg-red-50 p-4 sm:p-5">

      <div className="flex items-start gap-3">

        <Icon
          icon="fluent:error-circle-24-regular"
          width="22"
          className="mt-0.5 shrink-0 text-red-500"
        />

        <div className="min-w-0">

          <p className="font-semibold text-red-700">
            No pudimos cargar las preguntas frecuentes
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
        icon="fluent:question-circle-24-regular"
        width="32"
        className="mx-auto text-zinc-300"
      />

      <p className="mt-3 font-semibold text-zinc-700">
        No encontramos preguntas
      </p>

      <p className="mx-auto mt-1 max-w-lg text-[13px] leading-5 text-zinc-400">
        Probá con otra búsqueda u Obra Social.
      </p>

    </div>
  );
}
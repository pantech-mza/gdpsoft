"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import {
  FAQ_PAGE_SIZE,
  buildFaqPage,
  faqPopularity,
  faqSocialWorkName,
  filterFaqs,
  pageNumbers,
  sortFaqsByPopularity,
} from "../../../lib/client/faq-view.mjs";

const SAVED_KEY = "gdpsoft_faq_saved";
const HELPFUL_KEY = "gdpsoft_faq_helpful";

function readSet(key) {
  try {
    const raw = window.localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

function writeSet(key, set) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...set]));
  } catch {}
}

export default function SucursalFaqsPage() {
  const [faqs, setFaqs] = useState([]);
  const [socialWorks, setSocialWorks] = useState([]);
  const [search, setSearch] = useState("");
  const [socialWorkFilter, setSocialWorkFilter] = useState("");
  const [onlySaved, setOnlySaved] = useState(false);
  const [page, setPage] = useState(1);
  const [saved, setSaved] = useState(() => new Set());
  const [helpful, setHelpful] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setSaved(readSet(SAVED_KEY));
    setHelpful(readSet(HELPFUL_KEY));
  }, []);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError("");

        const [faqsResponse, socialWorksResponse] = await Promise.all([
          fetch("/api/faqs?status=APPROVED", { cache: "no-store" }),
          fetch("/api/social-works", { cache: "no-store" }),
        ]);

        const faqsResult = await faqsResponse.json();
        const socialWorksResult = await socialWorksResponse.json();

        if (!faqsResponse.ok || !faqsResult?.ok) {
          throw new Error(
            faqsResult?.error ||
              "No se pudieron cargar las preguntas frecuentes"
          );
        }

        setFaqs((faqsResult.faqs || []).filter((faq) => faq.active !== false));

        if (socialWorksResponse.ok && socialWorksResult?.ok) {
          setSocialWorks(
            (socialWorksResult.social_works || [])
              .filter((item) => item.active === true)
              .sort((a, b) =>
                String(a.name).localeCompare(String(b.name), "es")
              )
          );
        }
      } catch (err) {
        console.error("Error cargando FAQs:", err);
        setError(
          err?.message || "No se pudieron cargar las preguntas frecuentes."
        );
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const hasFilters = Boolean(search.trim() || socialWorkFilter || onlySaved);

  const sorted = useMemo(() => {
    let list = filterFaqs(faqs, {
      search,
      socialWorkId: socialWorkFilter,
      socialWorks,
    });
    if (onlySaved) list = list.filter((faq) => saved.has(faq.id));
    return sortFaqsByPopularity(list);
  }, [faqs, search, socialWorkFilter, socialWorks, onlySaved, saved]);

  useEffect(() => {
    setPage(1);
  }, [search, socialWorkFilter, onlySaved]);

  const view = useMemo(
    () =>
      buildFaqPage(sorted, {
        page,
        pageSize: FAQ_PAGE_SIZE,
        showTop: !search.trim() && !onlySaved,
      }),
    [sorted, page, search, onlySaved]
  );

  useEffect(() => {
    if (page !== view.page) setPage(view.page);
  }, [page, view.page]);

  function changePage(next) {
    setPage(next);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function toggle(key, setter, current, id) {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setter(next);
    writeSet(key, next);
  }

  function askAssistant(faq) {
    window.dispatchEvent(
      new CustomEvent("gdpsoft:ask-assistant", {
        detail: { question: faq.question },
      })
    );
  }

  const cardProps = (faq) => ({
    key: faq.id,
    faq,
    socialWorks,
    isSaved: saved.has(faq.id),
    isHelpful: helpful.has(faq.id),
    onSave: () => toggle(SAVED_KEY, setSaved, saved, faq.id),
    onHelpful: () => toggle(HELPFUL_KEY, setHelpful, helpful, faq.id),
    onAsk: () => askAssistant(faq),
  });

  return (
    <div className="min-w-0">
      <div className="mb-5 sm:mb-7">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f9eafa] sm:h-11 sm:w-11">
            <Icon icon="fluent-emoji:red-question-mark" width="25" height="25" />
          </div>
          <div className="min-w-0">
            <h1 className="break-words text-[25px] font-bold leading-tight tracking-[-0.6px] text-[#191020] sm:text-[30px]">
              Preguntas Frecuentes
            </h1>
            <p className="mt-1 max-w-full text-[13px] leading-5 text-zinc-500 sm:text-[14px]">
              Respuestas operativas revisadas y aprobadas, ordenadas por las
              más consultadas.
            </p>
          </div>
        </div>
      </div>

      <div className="mb-5 rounded-[16px] border border-zinc-200 bg-white p-3 shadow-sm sm:mb-6 sm:p-4">
        <div className="grid min-w-0 gap-3 lg:grid-cols-[1fr_300px_auto]">
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
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar pregunta, respuesta u obra social..."
              className="h-11 w-full min-w-0 rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-[13px] text-zinc-700 outline-none transition focus:border-[#8f2a85] focus:ring-2 focus:ring-[#8f2a85]/10 sm:h-12 sm:pl-11 sm:text-sm"
            />
          </div>

          <div className="relative min-w-0">
            <Icon
              icon="fluent:building-20-regular"
              width="18"
              height="18"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <select
              value={socialWorkFilter}
              onChange={(event) => setSocialWorkFilter(event.target.value)}
              className="h-11 w-full min-w-0 appearance-none rounded-xl border border-zinc-200 bg-white pl-10 pr-9 text-[13px] text-zinc-700 outline-none transition focus:border-[#8f2a85] focus:ring-2 focus:ring-[#8f2a85]/10 sm:h-12"
            >
              <option value="">Todas las Obras Sociales</option>
              {socialWorks.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <Icon
              icon="fluent:chevron-down-20-regular"
              width="17"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />
          </div>

          <button
            type="button"
            onClick={() => setOnlySaved((value) => !value)}
            aria-pressed={onlySaved}
            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-[13px] font-semibold transition sm:h-12 ${
              onlySaved
                ? "border-[#8f2a85] bg-[#f9eafa] text-[#8f2a85]"
                : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <Icon icon="fluent:bookmark-20-regular" width="17" />
            Guardadas ({saved.size})
          </button>
        </div>
      </div>

      {loading && <LoadingState />}
      {!loading && error && <ErrorState message={error} />}

      {!loading && !error && (
        <>
          <div className="mb-4 flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] text-zinc-500">
              <strong className="font-semibold text-zinc-700">
                {view.total}
              </strong>{" "}
              {view.total === 1 ? "pregunta disponible" : "preguntas disponibles"}
            </p>
            {view.restTotal > 0 && (
              <p className="text-[12px] text-zinc-400">
                Mostrando {view.from} - {view.to} de {view.restTotal}
                {view.top.length > 0 ? " (además de las más consultadas)" : ""}
              </p>
            )}
          </div>

          {view.totalPages > 1 && (
            <Pagination
              page={view.page}
              totalPages={view.totalPages}
              onChange={changePage}
              className="mb-5"
            />
          )}

          {view.total === 0 ? (
            <EmptyState filtered={hasFilters} />
          ) : (
            <>
              {view.top.length > 0 && (
                <section className="mb-6">
                  <div className="mb-3 flex items-center gap-2">
                    <Icon
                      icon="fluent-emoji:fire"
                      width="18"
                    />
                    <h2 className="text-[11px] font-bold uppercase tracking-[.1em] text-[#8f2a85]">
                      Más consultadas
                    </h2>
                  </div>
                  <div className="min-w-0 space-y-3">
                    {view.top.map((faq) => {
                      const { key, ...props } = cardProps(faq);
                      return <FaqCard key={key} featured {...props} />;
                    })}
                  </div>
                </section>
              )}

              {view.pageItems.length > 0 && (
                <section>
                  {view.top.length > 0 && (
                    <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[.1em] text-zinc-400">
                      Todas las preguntas
                    </h2>
                  )}
                  <div className="min-w-0 space-y-3">
                    {view.pageItems.map((faq) => {
                      const { key, ...props } = cardProps(faq);
                      return <FaqCard key={key} {...props} />;
                    })}
                  </div>
                </section>
              )}

              {view.totalPages > 1 && (
                <Pagination
                  page={view.page}
                  totalPages={view.totalPages}
                  onChange={changePage}
                />
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

function FaqCard({
  faq,
  socialWorks,
  featured = false,
  isSaved,
  isHelpful,
  onSave,
  onHelpful,
  onAsk,
}) {
  const name = faqSocialWorkName(faq, socialWorks);
  const count = faqPopularity(faq);
  const circuit = faq.branches?.branch_type || faq.branch_type || null;
  const [expanded, setExpanded] = useState(false);
  const answerText = String(faq.answer || "").replace(/\*\*/g, "");
  const isLong = answerText.length > 220 || answerText.split("\n").length > 4;

  return (
    <article
      className={`min-w-0 overflow-hidden rounded-[16px] border bg-white shadow-[0_4px_14px_rgba(40,25,55,.03)] ${
        featured ? "border-[#e8c9e5]" : "border-zinc-200"
      }`}
    >
      <div className="p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {name && (
            <span className="rounded-full bg-[#f9eafa] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[.06em] text-[#8f2a85]">
              {name}
            </span>
          )}
          {circuit && (
            <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[.06em] text-zinc-500">
              {circuit}
            </span>
          )}
          {count > 0 && (
            <span className="ml-auto text-[11px] text-zinc-400">
              consultada {count} {count === 1 ? "vez" : "veces"}
            </span>
          )}
        </div>

        <h3 className="break-words text-[14px] font-semibold leading-5 text-[#21142b] sm:text-[15px]">
          {faq.question}
        </h3>

        <div className="mt-3 flex min-w-0 items-start gap-3 rounded-xl bg-[#fcfbfd] p-3">
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#edf8dc]">
            <Icon
              icon="fluent:checkmark-circle-20-regular"
              width="17"
              className="text-[#668c00]"
            />
          </div>
          <p
            className={`min-w-0 flex-1 whitespace-pre-wrap break-words text-[12px] leading-5 text-zinc-600 sm:text-[13px] sm:leading-6 ${
              expanded ? "" : "line-clamp-3"
            }`}
          >
            {answerText}
          </p>
        </div>

        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[#8f2a85] hover:underline"
          >
            {expanded ? "Ver menos" : "Ver respuesta completa"}
            <Icon
              icon={expanded ? "fluent:chevron-up-20-regular" : "fluent:chevron-down-20-regular"}
              width="15"
            />
          </button>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onHelpful}
            aria-pressed={isHelpful}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold transition ${
              isHelpful
                ? "border-[#668c00] bg-[#edf8dc] text-[#4d6b00]"
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <Icon icon="fluent:thumb-like-20-regular" width="15" />
            Me sirvió
          </button>
          <button
            type="button"
            onClick={onSave}
            aria-pressed={isSaved}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12px] font-semibold transition ${
              isSaved
                ? "border-[#8f2a85] bg-[#f9eafa] text-[#8f2a85]"
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <Icon
              icon={isSaved ? "fluent:bookmark-20-filled" : "fluent:bookmark-20-regular"}
              width="15"
            />
            {isSaved ? "Guardada" : "Guardar"}
          </button>
          <button
            type="button"
            onClick={onAsk}
            className="ml-auto inline-flex h-9 items-center gap-1 rounded-lg px-3 text-[12px] font-semibold text-[#8f2a85] transition hover:bg-[#f9eafa]"
          >
            Preguntarle al asistente →
          </button>
        </div>
      </div>
    </article>
  );
}

function Pagination({ page, totalPages, onChange, className = "mt-6" }) {
  const numbers = pageNumbers(page, totalPages);
  const btn =
    "inline-flex h-9 items-center gap-1 rounded-lg border border-zinc-200 px-3 text-[12px] font-semibold text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <nav
      aria-label="Paginación"
      className={`${className} flex min-w-0 flex-col gap-3 rounded-[15px] border border-zinc-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4`}
    >
      <span className="text-[12px] text-zinc-400">
        Página <strong className="text-zinc-600">{page}</strong> de{" "}
        <strong className="text-zinc-600">{totalPages}</strong>
      </span>

      <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
        <button
          type="button"
          disabled={page === 1}
          onClick={() => onChange(Math.max(1, page - 1))}
          className={btn}
        >
          <Icon icon="fluent:chevron-left-20-regular" width="15" />
          Anterior
        </button>

        {numbers.map((n, i) =>
          n === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-zinc-400">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-current={n === page ? "page" : undefined}
              className={`flex h-9 min-w-9 items-center justify-center rounded-lg px-2 text-[12px] font-bold transition ${
                n === page
                  ? "bg-[#8f2a85] text-white"
                  : "border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {n}
            </button>
          )
        )}

        <button
          type="button"
          disabled={page === totalPages}
          onClick={() => onChange(Math.min(totalPages, page + 1))}
          className={btn}
        >
          Siguiente
          <Icon icon="fluent:chevron-right-20-regular" width="15" />
        </button>
      </div>
    </nav>
  );
}

function LoadingState() {
  return (
    <div className="rounded-[16px] border border-zinc-200 bg-white p-10 text-center">
      <Icon
        icon="fluent:spinner-ios-20-regular"
        width="27"
        className="mx-auto animate-spin text-[#8f2a85]"
      />
      <p className="mt-3 text-sm text-zinc-500">Cargando preguntas...</p>
    </div>
  );
}

function ErrorState({ message }) {
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
          <p className="mt-1 break-words text-sm text-red-600">{message}</p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ filtered }) {
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
        {filtered
          ? "Probá con otra búsqueda u Obra Social."
          : "Todavía no hay preguntas frecuentes aprobadas."}
      </p>
    </div>
  );
}

"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

export default function SucursalFaqsPage() {
  const [
    faqs,
    setFaqs,
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

  const [
    branch,
    setBranch,
  ] = useState(null);

  useEffect(() => {
    try {
      const raw =
        sessionStorage.getItem(
          "gdpsoft_branch"
        );

      if (raw) {
        setBranch(
          JSON.parse(raw)
        );
      }
    } catch {}
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const response =
          await fetch(
            "/api/faqs?status=APPROVED",
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
              "No se pudieron cargar las FAQs"
          );
        }

        setFaqs(
          (
            result.faqs ||
            []
          ).filter(
            (faq) =>
              faq.active
          )
        );
      } catch (err) {
        setError(
          err?.message ||
            "Error cargando FAQs"
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const visibleFaqs =
    useMemo(() => {
      const q =
        search
          .trim()
          .toLowerCase();

      return faqs.filter(
        (faq) => {
          /*
            GLOBAL:
            branch_id = null

            SUCURSAL:
            sólo FAQs específicas
            de esta sucursal.
          */
          const validScope =
            faq.branch_id ==
              null ||
            Number(
              faq.branch_id
            ) ===
              Number(
                branch?.id
              );

          if (!validScope) {
            return false;
          }

          if (!q) {
            return true;
          }

          return [
            faq.question,
            faq.answer,
            faq.social_works?.name,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q);
        }
      );
    }, [
      faqs,
      search,
      branch,
    ]);

  return (
    <div>

      <div className="mb-6">

        <p className="text-sm text-zinc-500">
          Base de conocimiento
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">
          Preguntas Frecuentes
        </h1>

        <p className="mt-2 text-sm text-zinc-500">
          Respuestas aprobadas por
          administración para uso en
          sucursal.
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
          placeholder="Buscar pregunta, respuesta u obra social..."
          className="h-12 w-full rounded-xl border border-zinc-200 px-4 text-sm outline-none focus:border-[#8f2a85]"
        />

      </div>

      {loading && (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-zinc-500">
          Cargando...
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">

        {visibleFaqs.map(
          (faq) => (
            <details
              key={faq.id}
              className="rounded-2xl border border-zinc-200 bg-white"
            >

              <summary className="cursor-pointer list-none px-5 py-4">

                <p className="font-semibold text-zinc-800">
                  {
                    faq.question
                  }
                </p>

                {faq.social_works?.name && (
                  <p className="mt-1 text-xs text-[#8f2a85]">
                    {
                      faq
                        .social_works
                        .name
                    }
                  </p>
                )}

              </summary>

              <div className="border-t border-zinc-100 px-5 py-4 text-sm leading-6 text-zinc-600">
                {
                  faq.answer
                }
              </div>

            </details>
          )
        )}

      </div>

      {!loading &&
        !error &&
        visibleFaqs.length ===
          0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-400">
          No se encontraron preguntas frecuentes.
        </div>
      )}

    </div>
  );
}
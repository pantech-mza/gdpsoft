"use client";

import {
  useEffect,
  useState,
} from "react";

export default function SucursalNormativesPage() {
  const [
    socialWorks,
    setSocialWorks,
  ] = useState([]);

  const [
    selectedId,
    setSelectedId,
  ] = useState("");

  const [
    normatives,
    setNormatives,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(false);

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

  useEffect(() => {
    if (!selectedId) {
      setNormatives([]);
      return;
    }

    async function load() {
      try {
        setLoading(true);

        const response =
          await fetch(
            `/api/social-works/${selectedId}/normatives`,
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
          setNormatives(
            (
              result.normatives ||
              []
            ).filter(
              (item) =>
                item.is_current
            )
          );
        }
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [selectedId]);

  return (
    <div>

      <div className="mb-6">

        <p className="text-sm text-zinc-500">
          Documentación
        </p>

        <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900">
          Normativas
        </h1>

        <p className="mt-2 text-sm text-zinc-500">
          Consultá documentación
          vigente por obra social.
        </p>

      </div>

      <div className="mb-5 rounded-2xl border border-zinc-200 bg-white p-5">

        <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-zinc-400">
          Obra Social
        </label>

        <select
          value={selectedId}
          onChange={(e) =>
            setSelectedId(
              e.target.value
            )
          }
          className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-4 text-sm outline-none focus:border-[#8f2a85]"
        >

          <option value="">
            Seleccionar obra social...
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

      </div>

      {loading && (
        <div className="rounded-2xl bg-white p-8 text-center text-sm text-zinc-500">
          Cargando normativas...
        </div>
      )}

      <div className="grid gap-3">

        {normatives.map(
          (item) => (
            <div
              key={item.id}
              className="rounded-2xl border border-zinc-200 bg-white p-5"
            >

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

                <div>

                  <p className="font-semibold text-zinc-900">
                    {
                      item.title
                    }
                  </p>

                  <p className="mt-1 text-sm text-zinc-500">
                    {
                      item.original_filename
                    }
                  </p>

                  <p className="mt-2 text-xs text-zinc-400">
                    Versión{" "}
                    {item.version ||
                      "-"}{" "}
                    ·{" "}
                    {item.relation
                      ?.is_primary
                      ? "Principal"
                      : "Extra"}
                  </p>

                </div>

                {item.source_url && (
                  <a
                    href={
                      item.source_url
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600"
                  >
                    Ver documento
                  </a>
                )}

              </div>

            </div>
          )
        )}

      </div>

      {selectedId &&
        !loading &&
        normatives.length ===
          0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
          No hay normativas vigentes disponibles.
        </div>
      )}

    </div>
  );
}
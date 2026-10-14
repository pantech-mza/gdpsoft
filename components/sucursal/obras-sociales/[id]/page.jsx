"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
} from "next/navigation";

const TABS = [
  {
    key: "TREE",
    label:
      "Árbol de Decisiones",
    icon: "🌿",
  },
  {
    key: "NORMATIVES",
    label: "Normativas",
    icon: "📑",
  },
  {
    key: "REMEMBER",
    label:
      "Recordá / Ficha",
    icon: "🔔",
  },
  {
    key: "BILLING",
    label:
      "Cómo Facturar",
    icon: "🧾",
  },
  {
    key: "CONTACT",
    label: "Contacto",
    icon: "📞",
  },
  {
    key: "FAQ",
    label:
      "Preguntas Frecuentes",
    icon: "❓",
  },
];

export default function SucursalSocialWorkPage() {
  const params =
    useParams();

  const id =
    params?.id;

  const [
    socialWork,
    setSocialWork,
  ] = useState(null);

  const [
    activeTab,
    setActiveTab,
  ] = useState("TREE");

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState(null);

  useEffect(() => {
    if (!id) {
      return;
    }

    async function load() {
      try {
        setLoading(true);

        const response =
          await fetch(
            `/api/social-works/${id}`,
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
              "No se pudo cargar la obra social"
          );
        }

        setSocialWork(
          result.social_work
        );
      } catch (err) {
        setError(
          err?.message ||
            "Error cargando obra social"
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
        Cargando obra social...
      </div>
    );
  }

  if (
    error ||
    !socialWork
  ) {
    return (
      <div>

        <Link
          href="/sucursal/obras-sociales"
          className="text-sm font-semibold text-[#8f2a85]"
        >
          ← Volver
        </Link>

        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error ||
            "No se encontró la obra social"}
        </div>

      </div>
    );
  }

  return (
    <div>

      <div className="mb-5">

        <Link
          href="/sucursal/obras-sociales"
          className="mb-4 inline-flex text-sm font-semibold text-[#8f2a85]"
        >
          ← Obras Sociales
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

          <div>

            <div className="flex flex-wrap items-center gap-2">

              <h1 className="text-3xl font-bold tracking-tight text-zinc-900">
                {
                  socialWork.name
                }
              </h1>

              {socialWork.active && (
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  ● Activa
                </span>
              )}

            </div>

            <p className="mt-2 text-sm text-zinc-500">
              Consulta operativa ·
              información de solo lectura
            </p>

          </div>

          {socialWork.tys_code && (
            <div className="rounded-xl border border-[#8f2a85]/15 bg-[#8f2a85]/5 px-4 py-3">

              <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
                Código TYS
              </p>

              <p className="mt-1 text-lg font-bold text-[#8f2a85]">
                {
                  socialWork.tys_code
                }
              </p>

            </div>
          )}

        </div>

      </div>

      <div className="mb-6 border-b border-zinc-200">

        <div className="flex overflow-x-auto">

          {TABS.map(
            (tab) => {
              const active =
                activeTab ===
                tab.key;

              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() =>
                    setActiveTab(
                      tab.key
                    )
                  }
                  className={[
                    "relative flex min-w-max items-center gap-2 px-4 py-3 text-sm font-semibold transition",
                    active
                      ? "text-[#8f2a85]"
                      : "text-zinc-500 hover:text-zinc-800",
                  ].join(" ")}
                >

                  <span>
                    {tab.icon}
                  </span>

                  <span>
                    {tab.label}
                  </span>

                  {active && (
                    <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#8f2a85]" />
                  )}

                </button>
              );
            }
          )}

        </div>

      </div>

      {activeTab ===
        "TREE" && (
        <DecisionTree
          socialWork={
            socialWork
          }
        />
      )}

      {activeTab ===
        "NORMATIVES" && (
        <Normatives
          socialWorkId={
            socialWork.id
          }
        />
      )}

      {activeTab ===
        "REMEMBER" && (
        <Remember
          socialWork={
            socialWork
          }
        />
      )}

      {activeTab ===
        "BILLING" && (
        <ReadOnlyEmpty
          icon="🧾"
          title="Cómo Facturar"
          text="La información de facturación y circuitos de esta obra social aparecerá aquí cuando esté configurada."
        />
      )}

      {activeTab ===
        "CONTACT" && (
        <ReadOnlyEmpty
          icon="📞"
          title="Contacto"
          text="Los teléfonos, correos y canales de autorización configurados para esta obra social aparecerán aquí."
        />
      )}

      {activeTab ===
        "FAQ" && (
        <Faqs
          socialWorkId={
            socialWork.id
          }
        />
      )}

    </div>
  );
}

function DecisionTree({
  socialWork,
}) {
  const plans =
    String(
      socialWork.plan ||
        ""
    )
      .split(
        /[-,;/]+/
      )
      .map((x) =>
        x.trim()
      )
      .filter(Boolean);

  return (
    <div className="space-y-4">

      <ReadOnlyHeader
        title="Árbol de Decisiones"
        text="Utilizá estas opciones para resolver situaciones habituales."
      />

      {plans.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-5">

          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-zinc-400">
            Planes / Coberturas
          </p>

          <div className="mt-3 flex flex-wrap gap-2">

            {plans.map(
              (
                plan,
                index
              ) => (
                <span
                  key={`${plan}-${index}`}
                  className="rounded-full bg-[#8f2a85]/10 px-3 py-1.5 text-xs font-semibold text-[#8f2a85]"
                >
                  {plan}
                </span>
              )
            )}

          </div>

        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">

        <DecisionCard
          icon="📋"
          title="¿Recibo esta receta?"
          description="Documentos, validez y requisitos"
        />

        <DecisionCard
          icon="🔑"
          title="¿Necesita autorización?"
          description="Autorizaciones, coberturas especiales y controles"
        />

        <DecisionCard
          icon="🔄"
          title="¿Puedo cambiar la marca?"
          description="Sustitución y condiciones"
        />

        <DecisionCard
          icon="📦"
          title="¿Cuántas unidades?"
          description="Límites y cantidades permitidas"
        />

      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">

        <h3 className="font-semibold text-zinc-900">
          Información disponible
        </h3>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">

          <InfoCard
            label="Receta"
            value={
              socialWork.recipe_type
            }
          />

          <InfoCard
            label="Vigencia"
            value={
              socialWork.recipe_validity_days !=
              null
                ? `${socialWork.recipe_validity_days} días`
                : "-"
            }
          />

          <InfoCard
            label="RP"
            value={
              socialWork.rp
            }
          />

          <InfoCard
            label="Membrete"
            value={
              socialWork.letterhead
            }
          />

        </div>

      </div>

    </div>
  );
}

function DecisionCard({
  icon,
  title,
  description,
}) {
  return (
    <div className="rounded-2xl border border-[#8f2a85]/20 bg-white p-6 shadow-sm">

      <span className="text-2xl">
        {icon}
      </span>

      <h3 className="mt-3 font-semibold text-[#8f2a85]">
        {title}
      </h3>

      <p className="mt-1 text-sm text-zinc-500">
        {description}
      </p>

    </div>
  );
}

function Remember({
  socialWork,
}) {
  const fields = [
    [
      "Tipo de receta",
      socialWork.recipe_type,
    ],
    [
      "Vigencia",
      socialWork.recipe_validity_days !=
      null
        ? `${socialWork.recipe_validity_days} días`
        : "-",
    ],
    [
      "Membrete",
      socialWork.letterhead,
    ],
    [
      "Cantidad RP",
      socialWork.rp,
    ],
    [
      "Diagnóstico",
      socialWork.diagnosis,
    ],
    [
      "Monodroga",
      socialWork.monodrug,
    ],
    [
      "Nombre comercial",
      socialWork.commercial_name,
    ],
    [
      "Sustitución",
      socialWork.substitution,
    ],
  ];

  return (
    <div className="space-y-4">

      <ReadOnlyHeader
        title="Recordá / Ficha"
        text="Información rápida para la atención en sucursal."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

        {fields.map(
          ([label, value]) => (
            <InfoCard
              key={label}
              label={label}
              value={
                value ?? "-"
              }
            />
          )
        )}

      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">

        <p className="font-semibold text-amber-900">
          🔔 Observaciones
        </p>

        <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-800">
          {
            socialWork.observations ||
            "No hay observaciones cargadas."
          }
        </p>

      </div>

    </div>
  );
}

function Normatives({
  socialWorkId,
}) {
  const [
    items,
    setItems,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const response =
          await fetch(
            `/api/social-works/${socialWorkId}/normatives`,
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
              "No se pudieron cargar las normativas"
          );
        }

        setItems(
          (
            result.normatives ||
            []
          ).filter(
            (item) =>
              item.is_current
          )
        );
      } catch (err) {
        setError(
          err?.message ||
            "Error cargando normativas"
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [socialWorkId]);

  return (
    <div className="space-y-4">

      <ReadOnlyHeader
        title="Normativas"
        text="Documentación vigente disponible para consulta."
      />

      {loading && (
        <Loading text="Cargando normativas..." />
      )}

      {error && (
        <ErrorBox text={error} />
      )}

      {!loading &&
        !error &&
        items.length === 0 && (
        <Empty text="No hay normativas vigentes disponibles." />
      )}

      {!loading &&
        !error &&
        items.length > 0 && (
        <div className="grid gap-3">

          {items.map(
            (item) => (
              <div
                key={
                  item.id
                }
                className="rounded-2xl border border-zinc-200 bg-white p-5"
              >

                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

                  <div>

                    <div className="flex flex-wrap items-center gap-2">

                      <p className="font-semibold text-zinc-900">
                        {
                          item.title
                        }
                      </p>

                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                        Vigente
                      </span>

                      <span className="rounded-full bg-[#8f2a85]/8 px-2.5 py-1 text-[10px] font-semibold text-[#8f2a85]">
                        {item.relation
                          ?.is_primary
                          ? "Principal"
                          : "Extra"}
                      </span>

                    </div>

                    <p className="mt-1 text-sm text-zinc-500">
                      {
                        item.original_filename
                      }
                    </p>

                    <p className="mt-2 text-xs text-zinc-400">
                      Versión{" "}
                      {item.version ||
                        "-"}
                      {item.processing_selected
                        ? ` · ${item.processing_selected}`
                        : ""}
                    </p>

                  </div>

                  {item.source_url && (
                    <a
                      href={
                        item.source_url
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex rounded-lg border border-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-600 transition hover:bg-zinc-50"
                    >
                      Ver documento
                    </a>
                  )}

                </div>

              </div>
            )
          )}

        </div>
      )}

    </div>
  );
}

function Faqs({
  socialWorkId,
}) {
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

  useEffect(() => {
    async function load() {
      try {
        const response =
          await fetch(
            `/api/faqs?status=APPROVED&socialWorkId=${socialWorkId}`,
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
              "No se pudieron cargar las preguntas frecuentes"
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
            "Error cargando preguntas frecuentes"
        );
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [socialWorkId]);

  return (
    <div className="space-y-4">

      <ReadOnlyHeader
        title="Preguntas Frecuentes"
        text="Respuestas previamente revisadas y aprobadas."
      />

      {loading && (
        <Loading text="Cargando preguntas frecuentes..." />
      )}

      {error && (
        <ErrorBox text={error} />
      )}

      {!loading &&
        !error &&
        faqs.length === 0 && (
        <Empty text="No hay preguntas frecuentes aprobadas para esta obra social." />
      )}

      <div className="space-y-3">

        {faqs.map(
          (faq) => (
            <details
              key={faq.id}
              className="group rounded-2xl border border-zinc-200 bg-white"
            >

              <summary className="cursor-pointer list-none px-5 py-4">

                <div className="flex items-center justify-between gap-3">

                  <p className="font-semibold text-zinc-800">
                    {
                      faq.question
                    }
                  </p>

                  <span className="text-[#8f2a85]">
                    +
                  </span>

                </div>

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

    </div>
  );
}

function ReadOnlyHeader({
  title,
  text,
}) {
  return (
    <div className="rounded-xl border border-[#8f2a85]/10 bg-[#8f2a85]/5 px-4 py-3">

      <p className="text-sm font-semibold text-[#8f2a85]">
        {title}
      </p>

      <p className="mt-0.5 text-xs text-zinc-500">
        {text}
      </p>

    </div>
  );
}

function InfoCard({
  label,
  value,
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4">

      <p className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">
        {label}
      </p>

      <p className="mt-2 font-semibold text-zinc-800">
        {value ?? "-"}
      </p>

    </div>
  );
}

function ReadOnlyEmpty({
  icon,
  title,
  text,
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center">

      <div className="text-3xl">
        {icon}
      </div>

      <h2 className="mt-3 font-semibold text-zinc-800">
        {title}
      </h2>

      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
        {text}
      </p>

    </div>
  );
}

function Loading({
  text,
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-500">
      {text}
    </div>
  );
}

function ErrorBox({
  text,
}) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      {text}
    </div>
  );
}

function Empty({
  text,
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-8 text-center text-sm text-zinc-400">
      {text}
    </div>
  );
}
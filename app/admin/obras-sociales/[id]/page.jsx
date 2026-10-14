"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import {
  useParams,
} from "next/navigation";

import { Icon } from "@iconify/react";
import ResourcesPanel from "../../../../components/social-works/ResourcesPanel";
import DecisionTreesPanel from "../../../../components/social-works/DecisionTreesPanel";
import { treeApiFetch } from "../../../../lib/decision-trees/client";


const TABS = [
  { key: "TREE", label: "Árboles", desktopLabel: "Árbol de Decisiones", icon: "fluent-emoji:herb" },
  { key: "NORMATIVES", label: "Normativas", desktopLabel: "Normativas", icon: "fluent-color:document-bullet-list-24" },
  { key: "REMEMBER", label: "Ficha", desktopLabel: "Recordá / Ficha", icon: "fluent-emoji:bell" },
  { key: "BILLING", label: "Facturar", desktopLabel: "Cómo Facturar", icon: "fluent-color:document-text-24" },
  { key: "CONTACT", label: "Contacto", desktopLabel: "Contacto", icon: "fluent-color:phone-24" },
  { key: "AI", label: "IA", desktopLabel: "Consultar IA", icon: "fluent-color:bot-24" },
];

export default function SocialWorkAdminPage() {
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

  // =====================================================
  // CARGAR OBRA SOCIAL
  // =====================================================

  useEffect(() => {
    if (!id) {
      return;
    }

    const load =
      async () => {
        try {
          setLoading(true);
          setError(null);

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
              "Error cargando la obra social"
          );
        } finally {
          setLoading(false);
        }
      };

    load();
  }, [id]);

  // =====================================================
  // LOADING
  // =====================================================

  if (loading) {
    return (
      <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
        Cargando obra social...
      </div>
    );
  }

  // =====================================================
  // ERROR
  // =====================================================

  if (
    error ||
    !socialWork
  ) {
    return (
      <div className="space-y-4">

        <Link
          href="/admin/obras-sociales"
          className="inline-flex text-sm font-medium text-[#8f2a85]"
        >
          ← Volver a Obras Sociales
        </Link>

        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
          {
            error ||
            "No se encontró la obra social"
          }
        </div>

      </div>
    );
  }


return (
  <main className="mx-auto max-w-[1440px] px-0">

    <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-center sm:justify-between">
      <Link
        href="/admin/obras-sociales"
        className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#8f2a85]"
      >
        <Icon icon="fluent:arrow-left-20-regular" width="17" />
        Obras Sociales
      </Link>

      <div className="flex flex-wrap gap-2">
        <span className="inline-flex items-center rounded-xl border border-[#8f2a85]/15 bg-[#8f2a85]/5 px-3 py-2 text-xs font-semibold text-[#8f2a85]">
          Vista Administrador
        </span>
        <Link
          href="/admin/obras-sociales"
          className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50"
        >
          Volver al listado
        </Link>
      </div>
    </div>

    <div className="mb-5 min-w-0 rounded-[17px] border border-zinc-200 bg-white p-4 shadow-sm sm:mb-6 sm:p-5">
      <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#f8eafa] sm:h-14 sm:w-14">
            <Icon icon="fluent-emoji:hospital" width="29" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="max-w-full break-words text-[23px] font-bold leading-tight tracking-[-0.6px] text-[#191020] sm:text-[28px]">
                {socialWork.name}
              </h1>
              {socialWork.active ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Activa
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold text-zinc-600">
                  <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
                  Inactiva
                </span>
              )}
            </div>
            <p className="mt-1 text-[12px] leading-5 text-zinc-500 sm:text-[13px]">
              Portal administrativo · {socialWork.name}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">
              {socialWork.recipe_type ? <HeaderTag>{socialWork.recipe_type}</HeaderTag> : null}
              {socialWork.plan ? <HeaderTag>Plan {socialWork.plan}</HeaderTag> : null}
              {socialWork.validator_type ? <HeaderTag>{socialWork.validator_type}</HeaderTag> : null}
            </div>
          </div>
        </div>

        <div className="grid w-full grid-cols-2 gap-2 lg:w-[280px]">
          <HeroSummaryBox label="Código TYS" value={socialWork.tys_code || '-'} highlight />
          <HeroSummaryBox label="Vigencia" value={socialWork.recipe_validity_days != null ? `${socialWork.recipe_validity_days} días` : '-'} />
        </div>
      </div>
    </div>

    <div className="mb-5 min-w-0 overflow-hidden rounded-[15px] border border-zinc-200 bg-white sm:mb-6">
      <div className="overflow-x-auto overscroll-x-contain">
        <div className="flex min-w-max">
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={[
                  "relative flex shrink-0 items-center gap-2 px-4 py-3.5 text-[12px] font-semibold transition sm:px-5 sm:py-4 sm:text-[13px]",
                  active ? "bg-[#fbf7fc] text-[#8f2a85]" : "text-zinc-500 hover:bg-zinc-50",
                ].join(" ")}
              >
                <Icon icon={tab.icon} width="19" height="19" />
                <span className="sm:hidden">{tab.label}</span>
                <span className="hidden sm:inline">{tab.desktopLabel}</span>
                {active && <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-[#8f2a85]" />}
              </button>
            );
          })}
        </div>
      </div>
    </div>

    {/* =================================================
        TREE
    ================================================= */}


      {activeTab ===
        "TREE" && (
        <DecisionTreesPanel socialWorkId={socialWork.id} editable />
      )}

      {/* =================================================
          NORMATIVAS
      ================================================= */}

      {activeTab ===
        "NORMATIVES" && (
        <NormativesView
            socialWorkId={
            socialWork.id
            }
        />
       )}

      {/* =================================================
          RECORDA
      ================================================= */}

      {activeTab ===
        "REMEMBER" && (
        <RememberView
          socialWork={
            socialWork
          }
        />
      )}

      {/* =================================================
          FACTURACION
      ================================================= */}


{activeTab ===
  "BILLING" && (
  <ResourcesPanel
    socialWorkId={socialWork.id}
    kind="billing"
    editable
  />
)}

{/* =================================================
    CONTACT
O
      ================================================= */}


{activeTab ===
  "CONTACT" && (
  <ResourcesPanel
    socialWorkId={socialWork.id}
    kind="contact"
    editable
  />
)}

{/* =================================================
    IA

      ================================================= */}

      {activeTab ===
        "AI" && (
        <AIView
          socialWork={
            socialWork
          }
        />
      )}

    </main>
  );
}

// =========================================================
// ÁRBOL
// =========================================================

function DecisionTreeView({
  socialWork,
}) {
  const planChips =
    String(
      socialWork.plan ||
        ""
    )
      .split(
        /[-,;/]+/
      )
      .map(
        (item) =>
          item.trim()
      )
      .filter(Boolean);

  return (
    <div className="space-y-4">

      {/* ADMIN BAR */}

      <AdminSectionBar
        title="Árbol de Decisiones"
        description="Vista que utilizará la sucursal para resolver consultas operativas."
        button="+ Editar árbol"
      />

      {/* PLANES */}

      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">

        <div className="mb-3 flex items-center justify-between">

          <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-zinc-400">
            Descuentos por plan
          </p>

          <button
            type="button"
            className="text-xs font-semibold text-[#8f2a85]"
          >
            Editar
          </button>

        </div>

        <div className="flex flex-wrap gap-2">

          {planChips.length >
            0 ? (
            planChips.map(
              (
                plan,
                index
              ) => (
                <span
                  key={`${plan}-${index}`}
                  className={[
                    "rounded-full px-3 py-1.5 text-xs font-semibold",
                    index % 3 ===
                    0
                      ? "bg-[#8f2a85]/10 text-[#8f2a85]"
                      : index % 3 ===
                          1
                        ? "bg-[#93c01f]/15 text-[#668500]"
                        : "bg-amber-50 text-amber-700",
                  ].join(" ")}
                >
                  {plan}
                </span>
              )
            )
          ) : (
            <span className="text-sm text-zinc-400">
              No hay información de planes cargada.
            </span>
          )}

        </div>

      </div>

      {/* CARDS */}

      <div className="grid gap-4 md:grid-cols-2">

        <DecisionCard
          icon="📋"
          title="¿Recibo esta receta?"
          description="Documentos, validez y requisitos"
          borderClass="border-[#8f2a85]"
          textClass="text-[#8f2a85]"
        />

        <DecisionCard
          icon="🔑"
          title="¿Necesita autorización?"
          description="Crónicos, PMI, diabetes y topes"
          borderClass="border-amber-500"
          textClass="text-amber-600"
        />

        <DecisionCard
          icon="🔄"
          title="¿Puedo cambiar la marca?"
          description="Sustitución y condiciones"
          borderClass="border-emerald-500"
          textClass="text-emerald-600"
        />

        <DecisionCard
          icon="📦"
          title="¿Cuántas unidades?"
          description="Límites y cantidades"
          borderClass="border-[#8f2a85]"
          textClass="text-[#8f2a85]"
        />

      </div>

      {/* DATOS ACTUALES */}

      <div className="rounded-2xl border border-zinc-200 bg-white p-5">

        <div className="mb-4 flex items-center justify-between">

          <div>

            <h3 className="font-semibold text-zinc-900">
              Información disponible actualmente
            </h3>

            <p className="mt-1 text-sm text-zinc-400">
              Datos base cargados para esta obra social.
            </p>

          </div>

        </div>

        <div className="grid gap-3 md:grid-cols-4">

          <SmallInfo
            label="Receta"
            value={
              socialWork.recipe_type
            }
          />

          <SmallInfo
            label="Vigencia"
            value={
              socialWork.recipe_validity_days !=
              null
                ? `${socialWork.recipe_validity_days} días`
                : "-"
            }
          />

          <SmallInfo
            label="RP"
            value={
              socialWork.rp
            }
          />

          <SmallInfo
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
  borderClass,
  textClass,
}) {
  return (
    <button
      type="button"
      className={[
        "group relative min-h-[145px] rounded-2xl border-2 bg-white p-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md",
        borderClass,
      ].join(" ")}
    >

      <span className="text-2xl">
        {icon}
      </span>

      <h3
        className={[
          "mt-3 font-semibold",
          textClass,
        ].join(" ")}
      >
        {title}
      </h3>

      <p className="mt-1 text-xs text-zinc-400">
        {description}
      </p>

      <span className="absolute right-3 top-3 rounded-md bg-zinc-50 px-2 py-1 text-[10px] font-semibold text-zinc-400 opacity-0 transition group-hover:opacity-100">
        Admin
      </span>

    </button>
  );
}

// =========================================================
// RECORDA / FICHA
// =========================================================

function RememberView({
  socialWork,
}) {
  return (
    <div className="space-y-4">

      <AdminSectionBar
        title="Recordá / Ficha"
        description="Información rápida que debe tener presente el personal de farmacia."
        button="Editar ficha"
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">

        <FichaCard
          label="Tipo de receta"
          value={
            socialWork.recipe_type
          }
        />

        <FichaCard
          label="Vigencia"
          value={
            socialWork.recipe_validity_days !=
            null
              ? `${socialWork.recipe_validity_days} días`
              : "-"
          }
        />

        <FichaCard
          label="Membrete"
          value={
            socialWork.letterhead
          }
        />

        <FichaCard
          label="Cantidad RP"
          value={
            socialWork.rp
          }
        />

        <FichaCard
          label="Diagnóstico"
          value={
            socialWork.diagnosis
          }
        />

        <FichaCard
          label="Monodroga"
          value={
            socialWork.monodrug
          }
        />

        <FichaCard
          label="Nombre comercial"
          value={
            socialWork.commercial_name
          }
        />

        <FichaCard
          label="Sustitución"
          value={
            socialWork.substitution
          }
        />

      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">

        <div className="flex gap-3">

          <span className="text-xl">
            🔔
          </span>

          <div>

            <h3 className="font-semibold text-amber-900">
              Observaciones
            </h3>

            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-amber-800">

              {
                socialWork.observations ||
                "No hay observaciones cargadas."
              }

            </p>

          </div>

        </div>

      </div>

    </div>
  );
}

// =========================================================
// IA
// =========================================================

function AIView({
  socialWork,
}) {
  const [
    question,
    setQuestion,
  ] = useState("");

  return (
    <div className="space-y-4">

      <AdminSectionBar
        title="Consultar IA"
        description={`Consultas sobre ${socialWork.name}.`}
      />

      <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-200 bg-white shadow-sm">

        <div className="border-b border-zinc-100 p-5">

          <div className="flex items-center gap-3">

            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#8f2a85]/10">
              🤖
            </div>

            <div>

              <p className="font-semibold text-zinc-900">
                Asistente GDPSoft
              </p>

              <p className="text-xs text-zinc-400">
                Consultando sobre:{" "}
                {
                  socialWork.name
                }
              </p>

            </div>

          </div>

        </div>

        <div className="min-h-[310px] p-6">

          <div className="max-w-xl rounded-2xl rounded-tl-sm bg-[#f7f3f7] px-4 py-3 text-sm leading-6 text-zinc-700">

            Podés realizar una consulta sobre esta obra social. La conexión con el asistente que ya tenemos se integrará en esta sección.

          </div>

        </div>

        <div className="border-t border-zinc-100 p-4">

          <div className="flex gap-2">

            <input
              type="text"
              value={
                question
              }
              onChange={(e) =>
                setQuestion(
                  e.target.value
                )
              }
              placeholder={`Preguntar sobre ${socialWork.name}...`}
              className="flex-1 rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-[#8f2a85]"
            />

            <button
              type="button"
              className="rounded-xl bg-[#8f2a85] px-5 py-3 text-sm font-semibold text-white"
            >
              Enviar
            </button>

          </div>

        </div>

      </div>

    </div>
  );
}

// =========================================================
// COMPONENTES
// =========================================================


function HeaderTag({
  children,
}) {
  return (
    <span className="inline-flex items-center rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-[12px] text-zinc-600">
      {children}
    </span>
  );
}

function HeroSummaryBox({
  label,
  value,
  highlight = false,
}) {
  return (
    <div className={[
      "rounded-[16px] border p-4",
      highlight ? "border-[#edd2ec] bg-[#fdf7fd]" : "border-zinc-200 bg-white",
    ].join(" ")}>
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-400">{label}</p>
      <p className="mt-1.5 text-[15px] font-bold text-zinc-800 sm:text-[16px]">{value ?? '-'}</p>
    </div>
  );
}


function AdminSectionBar({
  title,
  description,
  button,
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-[#8f2a85]/10 bg-[#8f2a85]/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">

      <div>

        <p className="text-sm font-semibold text-[#8f2a85]">
          {title}
        </p>

        <p className="mt-0.5 text-xs text-zinc-500">
          {description}
        </p>

      </div>

      {button && (
        <button
          type="button"
          className="rounded-lg bg-[#8f2a85] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#7c2474]"
        >
          {button}
        </button>
      )}

    </div>
  );
}

function SmallInfo({
  label,
  value,
}) {
  return (
    <div className="rounded-xl bg-zinc-50 p-4">

      <p className="text-xs text-zinc-400">
        {label}
      </p>

      <p className="mt-1.5 text-sm font-semibold text-zinc-800">
        {
          value ??
          "-"
        }
      </p>

    </div>
  );
}

function FichaCard({
  label,
  value,
}) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">

      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {label}
      </p>

      <p className="mt-2 text-base font-semibold leading-6 text-zinc-800">
        {
          value ??
          "-"
        }
      </p>

    </div>
  );
}

function SectionShell({
  icon,
  title,
  subtitle,
  action,
  children,
}) {
  return (
    <div className="space-y-4">

      <AdminSectionBar
        title={title}
        description={
          subtitle
        }
        button={
          action
        }
      />

      <div className="rounded-2xl border border-zinc-200 bg-white shadow-sm">

        <div className="flex items-center gap-3 border-b border-zinc-100 px-5 py-4">

          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#8f2a85]/10">
            {icon}
          </div>

          <h2 className="font-semibold text-zinc-900">
            {title}
          </h2>

        </div>

        <div className="p-5">
          {children}
        </div>

      </div>

    </div>
  );
}

function EmptyAdminBlock({
  title,
  description,
}) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-10 text-center">

      <p className="font-semibold text-zinc-700">
        {title}
      </p>

      <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
        {description}
      </p>

    </div>
  );
}

function NormativesView({
  socialWorkId,
}) {
  const [
    normatives,
    setNormatives,
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
    uploadOpen,
    setUploadOpen,
  ] = useState(false);

  const loadNormatives =
    async () => {
      try {
        setLoading(true);
        setError(null);

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

        setNormatives(
          result.normatives ||
            []
        );
      } catch (err) {
        setError(
          err?.message ||
            "Error cargando normativas"
        );
      } finally {
        setLoading(false);
      }
    };

  useEffect(() => {
    loadNormatives();
  }, [socialWorkId]);

  return (
    <>
      <div className="space-y-4">

        {/* CABECERA */}

        <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">

          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              Normativas
            </h2>

            <p className="mt-1 text-sm text-zinc-500">
              Documentación normativa asociada a esta obra social.
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              setUploadOpen(true)
            }
            className="inline-flex items-center justify-center rounded-xl bg-[#8f2a85] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#7c2474]"
          >
            + Cargar normativa
          </button>

        </div>

        {/* LOADING */}

        {loading && (
          <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">
            Cargando normativas...
          </div>
        )}

        {/* ERROR */}

        {!loading &&
          error && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

        {/* VACÍO */}

        {!loading &&
          !error &&
          normatives.length ===
            0 && (
            <div className="rounded-2xl border border-zinc-200 bg-white p-10 text-center">

              <p className="font-semibold text-zinc-700">
                No hay normativas asociadas.
              </p>

              <p className="mt-1 text-sm text-zinc-400">
                Podés cargar la primera normativa desde este módulo.
              </p>

            </div>
          )}

        {/* TABLA */}

        {!loading &&
          !error &&
          normatives.length >
            0 && (
            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">

              <div className="overflow-x-auto">

                <table className="min-w-full text-sm">

                  <thead className="border-b border-zinc-200 bg-zinc-50/80">

                    <tr>

                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Normativa
                      </th>

                      <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Archivo
                      </th>

                      <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Versión
                      </th>

                      <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Procesamiento
                      </th>

                      <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Estado
                      </th>

                      <th className="px-5 py-3 text-center text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Relación
                      </th>

                      <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-zinc-500">
                        Acciones
                      </th>

                    </tr>

                  </thead>

                  <tbody className="divide-y divide-zinc-100">

                    {normatives.map(
                      (
                        normative
                      ) => (
                        <tr
                          key={
                            normative.id
                          }
                          className="hover:bg-zinc-50/70"
                        >

                          <td className="px-5 py-4 align-top">

                            <div className="max-w-[320px]">

                              <p className="font-semibold text-zinc-900">
                                {
                                  normative.title
                                }
                              </p>

                              <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-zinc-400">

                                <span>
                                  ID #
                                  {
                                    normative.id
                                  }
                                </span>

                                {normative.is_current && (
                                  <span className="font-semibold text-emerald-600">
                                    Vigente
                                  </span>
                                )}

                              </div>

                            </div>

                          </td>

                          <td className="px-5 py-4 align-top">

                            <p className="max-w-[220px] truncate text-zinc-700">
                              {
                                normative.original_filename
                              }
                            </p>

                            {normative.file_size_bytes !=
                              null && (
                              <p className="mt-1 text-[11px] text-zinc-400">
                                {formatFileSize(
                                  normative.file_size_bytes
                                )}
                              </p>
                            )}

                          </td>

                          <td className="px-5 py-4 text-center align-top">

                            <span className="inline-flex rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">
                              v
                              {
                                normative.version
                              }
                            </span>

                          </td>

                          <td className="px-5 py-4 text-center align-top">

                            <div className="flex flex-col items-center gap-1">

                              <span
                                className={[
                                  "inline-flex rounded-full px-2.5 py-1 text-xs font-semibold",
                                  normative.processing_selected ===
                                  "OCR"
                                    ? "bg-amber-50 text-amber-700"
                                    : normative.processing_selected ===
                                      "DIRECT"
                                    ? "bg-[#8f2a85]/10 text-[#8f2a85]"
                                    : "bg-zinc-100 text-zinc-500",
                                ].join(
                                  " "
                                )}
                              >
                                {
                                  normative.processing_selected ||
                                  "Pendiente"
                                }
                              </span>

                              {normative.analysis_progress !=
                                null && (
                                <span className="text-[11px] text-zinc-400">
                                  {
                                    normative.analysis_progress
                                  }
                                  %
                                </span>
                              )}

                            </div>

                          </td>

                          <td className="px-5 py-4 text-center align-top">

                            <NormativeStatusBadge
                              status={
                                normative.status
                              }
                              openaiStatus={
                                normative.openai_status
                              }
                            />

                          </td>

                          <td className="px-5 py-4 text-center align-top">

                            {normative.relation?.is_primary ? (
                              <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                Principal
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600">
                                Extra
                              </span>
                            )}

                          </td>

                          <td className="px-5 py-4 align-top">

                            <div className="flex justify-end gap-2">

                              {normative.source_url && (
                                <a
                                  href={
                                    normative.source_url
                                  }
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
                                >
                                  Ver fuente
                                </a>
                              )}

                              <button
                                type="button"
                                className="rounded-lg border border-[#8f2a85]/20 bg-[#8f2a85]/5 px-3 py-2 text-xs font-semibold text-[#8f2a85] transition hover:bg-[#8f2a85]/10"
                              >
                                Editar
                              </button>

                            </div>

                          </td>

                        </tr>
                      )
                    )}

                  </tbody>

                </table>

              </div>

            </div>
          )}

      </div>

      {/* MODAL */}

      {uploadOpen && (
        <UploadNormativeModal
          billingChannels={Array.from(new Map(normatives.map(n => n.relation?.billing_channel).filter(Boolean).map(c => [Number(c.id), c])).values())}
          socialWorkId={
            socialWorkId
          }
          onClose={() =>
            setUploadOpen(false)
          }
          onUploaded={async () => {
            setUploadOpen(false);

            await loadNormatives();
          }}
        />
      )}
    </>
  );
}

function UploadNormativeModal({
  socialWorkId,
  billingChannels = [],
  onClose,
  onUploaded,
}) {
  const [
    title,
    setTitle,
  ] = useState("");

  const [
    file,
    setFile,
  ] = useState(null);

  const [
    documentKind,
    setDocumentKind,
  ] = useState("INITIAL");

  const [
    isPrimary,
    setIsPrimary,
  ] = useState(true);

  const [
    scopeId,
    setScopeId,
  ] = useState("");

  const [
    scopes,
    setScopes,
  ] = useState([]);

  const [
    loadingScopes,
    setLoadingScopes,
  ] = useState(true);

  const [
    effectiveFrom,
    setEffectiveFrom,
  ] = useState("");

  const [
    notes,
    setNotes,
  ] = useState("");

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [billingChannelId, setBillingChannelId] = useState(
    billingChannels.length === 1 ? String(billingChannels[0].id) : ""
  );

  const [autoProgress, setAutoProgress] = useState("");
  const [autoOutcome, setAutoOutcome] = useState(null);
  const [uploadedNormativeId, setUploadedNormativeId] = useState(null);

  async function autoSuggestTree(normativeId) {
    const id = Number(normativeId);
    if (!Number.isInteger(id) || id <= 0) throw new Error("No se recibió el ID de la nueva normativa");
    const call = async (url, options = {}) => {
      const response = await treeApiFetch(url, { method: "POST", ...options });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.ok === false) {
        throw new Error(payload.error || `Error HTTP ${response.status}`);
      }
      return payload;
    };
    setAutoProgress("Analizando el PDF recién cargado...");
    const analysis = await call(`/api/normatives/analyze?normativeId=${id}`);
    if (analysis.recommendation !== "DIRECT") {
      return {
        status: "NEEDS_PROCESSING",
        message: `Normativa cargada. El preanálisis recomienda ${analysis.recommendation || "revisión"}; debe completar OCR/revisión antes de generar árboles. No se fabricaron propuestas.`,
      };
    }
    setAutoProgress("Confirmando análisis DIRECT...");
    await call("/api/normatives/confirm-processing", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ normativeId: id, mode: "DIRECT" }),
    });
    setAutoProgress("Indexando normativa en OpenAI... Puede tardar unos minutos.");
    await call(`/api/normatives/process?normativeId=${id}`);
    setAutoProgress("Generando árboles sugeridos con IA desde esta normativa...");
    const generated = await call("/api/decision-tree-candidates/generate", {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ normative_id: id, social_work_id: Number(socialWorkId) }),
    });
    const count = Array.isArray(generated.candidates) ? generated.candidates.length :
      Number(generated.created_count ?? generated.count ?? 0);
    return {
      status: "GENERATED",
      message: generated.reused || generated.already_exists || generated.existing
        ? "La normativa ya tenía propuestas o árboles: no se generaron duplicados."
        : `La normativa quedó indexada. ${count > 0 ? `${count} propuestas generadas` : "Revisá las propuestas de IA"}. Ninguna fue aprobada ni publicada automáticamente.`,
    };
  }


  const [
    error,
    setError,
  ] = useState(null);

  useEffect(() => {
    const loadScopes =
      async () => {
        try {
          setLoadingScopes(
            true
          );

          const response =
            await fetch(
              `/api/social-works/${socialWorkId}/scopes`,
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
                "No se pudieron cargar los alcances"
            );
          }

          setScopes(
            result.scopes ||
              []
          );
        } catch (err) {
          setError(
            err?.message ||
              "Error cargando alcances"
          );
        } finally {
          setLoadingScopes(
            false
          );
        }
      };

    loadScopes();
  }, [socialWorkId]);

  const handleFileChange =
    (event) => {
      const selectedFile =
        event.target.files?.[0] ||
        null;

      setFile(
        selectedFile
      );

      if (
        selectedFile &&
        !title.trim()
      ) {
        setTitle(
          selectedFile.name.replace(
            /\.[^/.]+$/,
            ""
          )
        );
      }
    };

  const handleSubmit =
    async (event) => {
      event.preventDefault();

      if (
        !title.trim()
      ) {
        setError(
          "Ingresá un título para la normativa."
        );
        return;
      }

      if (!file) {
        setError(
          "Seleccioná un archivo."
        );
        return;
      }
      if (billingChannels.length > 1 && !billingChannelId) {
        setError("Seleccioná el circuito de facturación antes de cargar la normativa.");
        return;
      }

      if (
        !isPrimary &&
        !scopeId
      ) {
        setError(
          "Seleccioná el alcance de la normativa Extra."
        );
        return;
      }

      try {
        setSaving(true);
        setError(null);

        const formData =
          new FormData();

        formData.append(
          "title",
          title.trim()
        );

        formData.append(
          "file",
          file
        );
        formData.append("billingChannelId", billingChannelId || "");

        formData.append(
          "documentKind",
          documentKind
        );

        formData.append(
          "isPrimary",
          String(
            isPrimary
          )
        );

        formData.append(
          "scopeId",
          isPrimary
            ? ""
            : scopeId
        );

        formData.append(
          "effectiveFrom",
          effectiveFrom
        );

        formData.append(
          "notes",
          notes.trim()
        );

        const response =
          await treeApiFetch(
            `/api/social-works/${socialWorkId}/normatives/upload`,
            {
              method: "POST",
              body: formData,
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
              "No se pudo cargar la normativa"
          );
        }

        const uploadedId = result.normative?.id;
        setUploadedNormativeId(uploadedId || null);
        if (!/\.pdf$/i.test(file.name)) {
          setAutoOutcome({
            status: "NEEDS_PROCESSING",
            message: "La normativa se cargó. Este flujo automático admite PDFs; para otros formatos completá su procesamiento y generá una propuesta individual desde Árboles."
          });
          return;
        }
        try {
          const outcome = await autoSuggestTree(uploadedId);
          setAutoOutcome(outcome);
        } catch (e) {
          setAutoOutcome({
            status: "NEEDS_PROCESSING",
            message: `Normativa cargada con ID ${uploadedId}. No se completó la generación automática: ${e.message}. Revisá su estado antes de generar el árbol manualmente.`,
          });
        } finally {
          setAutoProgress("");
        }
      } catch (err) {
        setError(
          err?.message ||
            "Error cargando normativa"
        );
      } finally {
        setSaving(false);
      }
    };

  const canUseExtra =
    scopes.length > 0;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">

      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white shadow-2xl">

        <div className="flex items-center justify-between border-b border-zinc-100 px-6 py-5">

          <div>
            <h3 className="text-lg font-semibold text-zinc-900">
              Cargar normativa
            </h3>

            <p className="mt-1 text-sm text-zinc-500">
              El documento quedará asociado automáticamente a esta obra social.
            </p>
          </div>

          <button
            type="button"
            onClick={
              onClose
            }
            disabled={
              saving
            }
            className="flex h-9 w-9 items-center justify-center rounded-lg text-xl text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50"
          >
            ×
          </button>

        </div>

        <form
          onSubmit={uploadedNormativeId ? (event) => event.preventDefault() : handleSubmit}
        >

          <div className="space-y-5 p-6">

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {autoProgress && (
              <div role="status" aria-live="polite" className="rounded-xl border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-900">
                <strong>Generación automática:</strong> {autoProgress}
              </div>
            )}
            {autoOutcome && (
              <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${autoOutcome.status === "GENERATED" ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
                <strong>{autoOutcome.status === "GENERATED" ? "Propuesta lista para revisión" : "Carga realizada, proceso pendiente"}:</strong> {autoOutcome.message}
                <button type="button" onClick={() => onUploaded({ normative: { id: uploadedNormativeId } })} className="mt-3 block rounded-lg bg-[#8f2a85] px-4 py-2 font-medium text-white">Volver a la obra social</button>
              </div>
            )}

            {!uploadedNormativeId && (<>
            <div>

              <label className="mb-2 block text-sm font-semibold text-zinc-700">
                Archivo *
              </label>

              <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 px-6 py-8 text-center transition hover:border-[#8f2a85]/40 hover:bg-[#8f2a85]/5">

                <span className="text-2xl">
                  📄
                </span>

                {file ? (
                  <>
                    <span className="mt-2 text-sm font-semibold text-zinc-800">
                      {
                        file.name
                      }
                    </span>

                    <span className="mt-1 text-xs text-zinc-400">
                      {formatFileSize(
                        file.size
                      )}
                    </span>

                    <span className="mt-2 text-xs font-medium text-[#8f2a85]">
                      Cambiar archivo
                    </span>
                  </>
                ) : (
                  <>
                    <span className="mt-2 text-sm font-semibold text-zinc-700">
                      Seleccionar archivo
                    </span>

                    <span className="mt-1 text-xs text-zinc-400">
                      Hacé click para elegir el documento
                    </span>
                  </>
                )}

                <input
                  type="file"
                  onChange={
                    handleFileChange
                  }
                  className="hidden"
                />

              </label>

            </div>

            <div>

              <label className="mb-2 block text-sm font-semibold text-zinc-700">
                Título *
              </label>

              <input
                type="text"
                value={
                  title
                }
                onChange={(
                  event
                ) =>
                  setTitle(
                    event.target.value
                  )
                }
                placeholder="Ej: GALENO - Norma de atención"
                className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-800 outline-none transition focus:border-[#8f2a85] focus:ring-2 focus:ring-[#8f2a85]/10"
              />

            </div>

            {billingChannels.length > 0 && (
              <div>
                <label className="mb-2 block text-sm font-semibold text-zinc-700">Circuito de facturación {billingChannels.length > 1 ? "*" : ""}</label>
                <select value={billingChannelId} onChange={e => setBillingChannelId(e.target.value)}
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800">
                  <option value="">Seleccionar circuito</option>
                  {billingChannels.map(channel => (
                    <option key={channel.id} value={channel.id}>{channel.name}</option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-zinc-500">El árbol generado quedará asociado al documento y a este circuito.</p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">

              <div>

                <label className="mb-2 block text-sm font-semibold text-zinc-700">
                  Tipo de documento
                </label>

                <select
                  value={
                    documentKind
                  }
                  onChange={(
                    event
                  ) =>
                    setDocumentKind(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 outline-none transition focus:border-[#8f2a85]"
                >
                  <option value="INITIAL">
                    Normativa inicial
                  </option>

                  <option value="FULL_REPLACEMENT">
                    Reemplazo completo
                  </option>

                  <option value="AMENDMENT">
                    Modificación
                  </option>

                  <option value="CIRCULAR">
                    Circular
                  </option>
                </select>

              </div>

              <div>

                <label className="mb-2 block text-sm font-semibold text-zinc-700">
                  Vigente desde
                </label>

                <input
                  type="date"
                  value={
                    effectiveFrom
                  }
                  onChange={(
                    event
                  ) =>
                    setEffectiveFrom(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-800 outline-none transition focus:border-[#8f2a85]"
                />

              </div>

            </div>

            <div>

              <label className="mb-2 block text-sm font-semibold text-zinc-700">
                Relación
              </label>

              <div className="grid gap-3 sm:grid-cols-2">

                <button
                  type="button"
                  onClick={() => {
                    setIsPrimary(
                      true
                    );

                    setScopeId(
                      ""
                    );
                  }}
                  className={[
                    "rounded-xl border p-4 text-left transition",
                    isPrimary
                      ? "border-[#8f2a85] bg-[#8f2a85]/5 ring-2 ring-[#8f2a85]/10"
                      : "border-zinc-200 bg-white hover:border-zinc-300",
                  ].join(
                    " "
                  )}
                >

                  <p className="text-sm font-semibold text-zinc-900">
                    Principal
                  </p>

                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Documento principal de atención de la obra social.
                  </p>

                </button>

                <button
                  type="button"
                  disabled={
                    !canUseExtra
                  }
                  onClick={() =>
                    setIsPrimary(
                      false
                    )
                  }
                  className={[
                    "rounded-xl border p-4 text-left transition",
                    !canUseExtra
                      ? "cursor-not-allowed border-zinc-200 bg-zinc-50 opacity-50"
                      : !isPrimary
                      ? "border-[#8f2a85] bg-[#8f2a85]/5 ring-2 ring-[#8f2a85]/10"
                      : "border-zinc-200 bg-white hover:border-zinc-300",
                  ].join(
                    " "
                  )}
                >

                  <p className="text-sm font-semibold text-zinc-900">
                    Extra
                  </p>

                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Anexo o documentación para un alcance específico.
                  </p>

                </button>

              </div>

              {!loadingScopes &&
                scopes.length ===
                  0 && (
                  <p className="mt-2 text-xs text-amber-700">
                    Esta obra social no tiene alcances configurados. Solo puede cargarse como Principal.
                  </p>
                )}

            </div>

            {!isPrimary && (
              <div>

                <label className="mb-2 block text-sm font-semibold text-zinc-700">
                  Alcance *
                </label>

                <select
                  value={
                    scopeId
                  }
                  onChange={(
                    event
                  ) =>
                    setScopeId(
                      event.target.value
                    )
                  }
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-800 outline-none transition focus:border-[#8f2a85]"
                >
                  <option value="">
                    Seleccionar alcance
                  </option>

                  {scopes.map(
                    (scope) => (
                      <option
                        key={
                          scope.id
                        }
                        value={
                          scope.id
                        }
                      >
                        {
                          scope.name
                        }
                      </option>
                    )
                  )}

                </select>

              </div>
            )}

            <div>

              <label className="mb-2 block text-sm font-semibold text-zinc-700">
                Observaciones
              </label>

              <textarea
                value={
                  notes
                }
                onChange={(
                  event
                ) =>
                  setNotes(
                    event.target.value
                  )
                }
                rows={4}
                placeholder="Observaciones internas sobre esta normativa..."
                className="w-full resize-none rounded-xl border border-zinc-200 px-4 py-3 text-sm text-zinc-800 outline-none transition focus:border-[#8f2a85] focus:ring-2 focus:ring-[#8f2a85]/10"
              />

            </div>
            </>)}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-zinc-100 bg-zinc-50/70 px-6 py-4">
            {uploadedNormativeId ? (
              <button type="button" disabled={saving} onClick={() => onUploaded({ normative: { id: uploadedNormativeId } })} className="rounded-xl bg-[#8f2a85] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Cerrar</button>
            ) : (<>
            <button
              type="button"
              onClick={
                onClose
              }
              disabled={
                saving
              }
              className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={
                saving ||
                loadingScopes
              }
              className="min-w-[150px] rounded-xl bg-[#8f2a85] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#7c2474] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving
                ? "Cargando..."
                : "Cargar normativa"}
            </button>
            </>)}
          </div>

        </form>

      </div>

    </div>
  );
}


function NormativeStatusBadge({
  status,
  openaiStatus,
}) {
  const normalized =
    String(
      status || ""
    ).toUpperCase();

  if (
    normalized ===
    "INDEXED"
  ) {
    return (
      <div className="flex flex-col items-center gap-1">

        <span className="inline-flex rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
          Indexada
        </span>

        {openaiStatus && (
          <span className="text-[10px] text-zinc-400">
            OpenAI:{" "}
            {
              openaiStatus
            }
          </span>
        )}

      </div>
    );
  }

  if (
    normalized ===
    "ARCHIVED"
  ) {
    return (
      <span className="inline-flex rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500">
        Archivada
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
      {
        status ||
        "-"
      }
    </span>
  );
}

function formatFileSize(bytes) {
  const value =
    Number(bytes);

  if (
    !Number.isFinite(
      value
    )
  ) {
    return "-";
  }

  if (
    value <
    1024
  ) {
    return `${value} B`;
  }

  if (
    value <
    1024 *
      1024
  ) {
    return `${(
      value /
      1024
    ).toFixed(
      1
    )} KB`;
  }

  return `${(
    value /
    (
      1024 *
      1024
    )
  ).toFixed(
    1
  )} MB`;
}
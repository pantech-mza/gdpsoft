"use client";
import ResourcesPanel from "../../../../components/social-works/ResourcesPanel";
import DecisionTreesPanel from "../../../../components/social-works/DecisionTreesPanel";




import Link from "next/link";

import {

  useEffect,

  useMemo,

  useState,

} from "react";

import { useParams } from "next/navigation";

import { Icon } from "@iconify/react";



const TABS = [
  {

    id: "remember",

    label: "Ficha",

    desktopLabel: "Recordá / Ficha",

    icon: "fluent-color:note-24",

  },
  {

    id: "tree",

    label: "Árbol",

    desktopLabel: "Árbol de Decisiones",

    icon: "fluent-emoji:herb",

  },
  {

    id: "normatives",

    label: "Normativas",

    desktopLabel: "Normativas",

    icon: "fluent-color:document-text-24",

  },
  {

    id: "billing",

    label: "Facturar",

    desktopLabel: "Cómo Facturar",

    icon: "fluent-color:receipt-24",

  },
  {

    id: "contact",

    label: "Contacto",

    desktopLabel: "Contacto",

    icon: "fluent-color:phone-24",

  },
  {

    id: "faq",

    label: "FAQs",

    desktopLabel: "Preguntas Frecuentes",

    icon: "fluent-emoji:red-question-mark",

  },
];



export default function SucursalSocialWorkDetailPage() {

  const params = useParams();

  const socialWorkId = params?.id;



  const [activeTab, setActiveTab] =

    useState("remember");



  const [socialWork, setSocialWork] =

    useState(null);



  const [normatives, setNormatives] =

    useState([]);



  const [faqs, setFaqs] =

    useState([]);



  const [branch, setBranch] =

    useState(null);



  const [loading, setLoading] =

    useState(true);



  const [error, setError] =

    useState("");



  useEffect(() => {

    try {

      const rawBranch =

        sessionStorage.getItem(

          "gdpsoft_branch"

        );



      if (rawBranch) {

        setBranch(

          JSON.parse(rawBranch)

        );

      }

    } catch {}

  }, []);



  useEffect(() => {

    if (!socialWorkId) {

      return;

    }



    async function loadData() {

      try {

        setLoading(true);

        setError("");



        const [

          socialWorkResponse,

          normativesResponse,

          faqsResponse,

        ] = await Promise.all([

          fetch(

            `/api/social-works/${socialWorkId}`,

            {

              cache: "no-store",

            }

          ),



          fetch(

            `/api/social-works/${socialWorkId}/normatives`,

            {

              cache: "no-store",

            }

          ),



          fetch(

            `/api/faqs?status=APPROVED&socialWorkId=${socialWorkId}`,

            {

              cache: "no-store",

            }

          ),

        ]);



        const socialWorkResult =

          await socialWorkResponse.json();



        const normativesResult =

          await normativesResponse.json();



        const faqsResult =

          await faqsResponse.json();



        if (

          !socialWorkResponse.ok ||

          !socialWorkResult?.ok

        ) {

          throw new Error(

            socialWorkResult?.error ||

              "No se pudo cargar la obra social"

          );

        }



        setSocialWork(

          socialWorkResult.social_work

        );



        if (

          normativesResponse.ok &&

          normativesResult?.ok

        ) {

          setNormatives(

            (

              normativesResult.normatives ||

              []

            ).filter(

              (item) =>

                item.is_current !== false

            )

          );

        }



        if (

          faqsResponse.ok &&

          faqsResult?.ok

        ) {

          setFaqs(

            (

              faqsResult.faqs ||

              []

            ).filter(

              (item) =>

                item.active !== false

            )

          );

        }

      } catch (err) {

        console.error(

          "Error detalle obra social:",

          err

        );



        setError(

          err?.message ||

            "No se pudo cargar la obra social."

        );

      } finally {

        setLoading(false);

      }

    }



    loadData();

  }, [socialWorkId]);



  if (loading) {

    return <LoadingState />;

  }



  if (

    error ||

    !socialWork

  ) {

    return (

      <ErrorState

        message={

          error ||

          "No se encontró la obra social."

        }

      />

    );

  }



  return (

    <div className="min-w-0">



      {/* VOLVER */}



      <div className="mb-4 sm:mb-5">



        <Link

          href="/sucursal/obras-sociales"

          className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#8f2a85]"

        >

          <Icon

            icon="fluent:arrow-left-20-regular"

            width="17"

          />



          Obras Sociales

        </Link>



      </div>



      {/* HEADER */}



      <div className="mb-5 min-w-0 rounded-[17px] border border-zinc-200 bg-white p-4 shadow-sm sm:mb-6 sm:p-5">



        <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">



          <div className="flex min-w-0 items-start gap-3 sm:gap-4">



            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[14px] bg-[#f8eafa] sm:h-14 sm:w-14">

              <Icon

                icon="fluent-emoji:hospital"

                width="29"

              />

            </div>



            <div className="min-w-0 flex-1">



              <div className="flex min-w-0 flex-wrap items-center gap-2">



                <h1 className="max-w-full break-words text-[23px] font-bold leading-tight tracking-[-0.6px] text-[#191020] sm:text-[28px]">

                  {socialWork.name}

                </h1>



                {socialWork.active && (

                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700">

                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />

                    Activa

                  </span>

                )}



              </div>



              <p className="mt-1 text-[12px] leading-5 text-zinc-500 sm:text-[13px]">

                Información operativa de solo lectura

              </p>



              <div className="mt-3 flex flex-wrap gap-2 sm:mt-4">



                {socialWork.recipe_type && (

                  <Tag>

                    {socialWork.recipe_type}

                  </Tag>

                )}



                {socialWork.plan && (

                  <Tag>

                    Plan {socialWork.plan}

                  </Tag>

                )}



                {branch?.branch_type && (

                  <Tag>

                    Circuito de la sucursal:{" "}

                    {branch.branch_type}

                  </Tag>

                )}



              </div>



            </div>



          </div>



          {/* RESUMEN */}



          <div className="grid w-full grid-cols-2 gap-2 lg:w-[280px]">



            <SummaryBox

              label="Código TYS"

              value={

                socialWork.tys_code ||

                "-"

              }

              highlight

            />



            <SummaryBox

              label="Vigencia"

              value={

                socialWork.recipe_validity_days != null

                  ? `${socialWork.recipe_validity_days} días`

                  : "-"

              }

            />



          </div>



        </div>



      </div>



      {/* TABS */}



      <div className="mb-5 min-w-0 overflow-hidden rounded-[15px] border border-zinc-200 bg-white sm:mb-6">



        <div className="overflow-x-auto overscroll-x-contain">



          <div className="flex min-w-max">



            {TABS.map(

              (tab) => {

                const active =

                  activeTab === tab.id;



                return (

                  <button

                    key={tab.id}

                    type="button"

                    onClick={() =>

                      setActiveTab(

                        tab.id

                      )

                    }

                    className={[

                      "relative flex shrink-0 items-center gap-2 px-4 py-3.5 text-[12px] font-semibold transition sm:px-5 sm:py-4 sm:text-[13px]",

                      active

                        ? "bg-[#fbf7fc] text-[#8f2a85]"

                        : "text-zinc-500 hover:bg-zinc-50",

                    ].join(" ")}

                  >

                    <Icon

                      icon={tab.icon}

                      width="19"

                      height="19"

                    />



                    <span className="sm:hidden">

                      {tab.label}

                    </span>



                    <span className="hidden sm:inline">

                      {tab.desktopLabel}

                    </span>



                    {active && (

                      <span className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full bg-[#8f2a85]" />

                    )}



                  </button>

                );

              }

            )}



          </div>



        </div>



      </div>



      {/* CONTENT */}



      {activeTab === "tree" && (

        <DecisionTreesPanel socialWorkId={socialWork.id} />

      )}



      {activeTab === "normatives" && (

        <NormativesTab

          normatives={normatives}

        />

      )}



      {activeTab === "remember" && (

        <RememberTab

          socialWork={socialWork}

        />

      )}



      {activeTab === "billing" && (

        <ResourcesPanel socialWorkId={socialWorkId} kind="billing" />

      )}



      {activeTab === "contact" && (

        <ResourcesPanel socialWorkId={socialWorkId} kind="contact" />

      )}



      {activeTab === "faq" && (

        <FaqTab

          faqs={faqs}

        />

      )}



    </div>

  );

}



// =========================================================
// ÁRBOL
// =========================================================
function DecisionTreeTab({

  socialWork,

  branch,

}) {

  return (

    <div className="min-w-0 space-y-4 sm:space-y-5">



      <SectionHeader

        icon="fluent-emoji:herb"

        title="Árbol de Decisiones"

        description="Accesos rápidos para resolver situaciones frecuentes en mostrador."

      />



      <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">



        <DecisionCard

          icon="fluent-color:document-checkmark-24"

          title="¿Puedo recibir esta receta?"

          description="Revisá formato, vigencia y requisitos."

        />



        <DecisionCard

          icon="fluent-color:key-24"

          title="¿Necesita autorización?"

          description="Consultá condiciones y autorizaciones."

        />



        <DecisionCard

          icon="fluent-color:arrow-repeat-all-24"

          title="¿Se puede sustituir?"

          description="Revisá reglas de sustitución y marca."

        />



        <DecisionCard

          icon="fluent-color:box-24"

          title="¿Cuántas unidades?"

          description="Consultá límites y cantidades permitidas."

        />



      </div>



      <div className="min-w-0 rounded-[16px] border border-zinc-200 bg-white p-4 sm:p-5">



        <h3 className="text-[14px] font-bold text-zinc-800 sm:text-[15px]">

          Información rápida

        </h3>



        <div className="mt-4 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">



          <InfoItem

            label="Tipo de receta"

            value={

              socialWork.recipe_type ||

              "-"

            }

          />



          <InfoItem

            label="Vigencia"

            value={

              socialWork.recipe_validity_days != null

                ? `${socialWork.recipe_validity_days} días`

                : "-"

            }

          />



          <InfoItem

            label="Circuito de la sucursal"

            value={

              branch?.branch_type ||

              "-"

            }

          />



          <InfoItem

            label="Código TYS"

            value={

              socialWork.tys_code ||

              "-"

            }

          />



        </div>



      </div>



      <div className="rounded-[16px] border border-[#8f2a85]/15 bg-[#fbf6fc] p-4 sm:p-5">



        <div className="flex items-start gap-3">



          <Icon

            icon="fluent:bot-24-regular"

            width="22"

            className="mt-0.5 shrink-0 text-[#8f2a85]"

          />



          <div className="min-w-0">



            <p className="break-words text-[13px] font-semibold text-[#44204a] sm:text-sm">

              ¿Tenés una situación específica?

            </p>



            <p className="mt-1 break-words text-[12px] leading-5 text-zinc-500 sm:text-[13px]">

              Consultale al asistente GDPSoft desde el botón flotante.

            </p>



          </div>



        </div>



      </div>



    </div>

  );

}



// =========================================================
// NORMATIVAS
// =========================================================
function NormativesTab({

  normatives,

}) {

  return (

    <div className="min-w-0 space-y-4 sm:space-y-5">



      <SectionHeader

        icon="fluent-color:document-text-24"

        title="Normativas"

        description="Documentación vigente disponible para consulta."

      />



      {normatives.length === 0 ? (

        <EmptyState

          icon="fluent:document-dismiss-24-regular"

          title="Sin normativas disponibles"

          description="No hay documentación vigente asociada a esta obra social."

        />

      ) : (

        <div className="min-w-0 space-y-3">



          {normatives.map(

            (item) => (

              <div

                key={item.id}

                className="min-w-0 overflow-hidden rounded-[16px] border border-zinc-200 bg-white p-4 shadow-sm sm:p-5"

              >



                <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-start md:justify-between">



                  <div className="flex min-w-0 items-start gap-3 sm:gap-4">



                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#f4ecf8] sm:h-11 sm:w-11">



                      <Icon

                        icon="fluent-color:document-pdf-24"

                        width="24"

                      />



                    </div>



                    <div className="min-w-0 flex-1">



                      <div className="flex min-w-0 flex-wrap items-center gap-2">



                        <h3 className="max-w-full break-words text-[13px] font-semibold leading-5 text-zinc-800 sm:text-sm">

                          {item.title ||

                            item.original_filename ||

                            "Normativa"}

                        </h3>



                        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-bold text-emerald-700 sm:text-[9px]">

                          VIGENTE

                        </span>



                        <span className="shrink-0 rounded-full bg-[#8f2a85]/10 px-2 py-1 text-[8px] font-bold text-[#8f2a85] sm:text-[9px]">

                          {item.relation?.is_primary

                            ? "PRINCIPAL"

                            : "EXTRA"}

                        </span>



                      </div>



                      {item.original_filename && (

                        <p className="mt-1 break-all text-[11px] leading-4 text-zinc-400 sm:text-[12px]">

                          {item.original_filename}

                        </p>

                      )}



                      <p className="mt-2 text-[10px] text-zinc-400 sm:text-[11px]">

                        Versión{" "}

                        {item.version || "-"}

                        {item.processing_selected

                          ? ` · ${item.processing_selected}`

                          : ""}

                      </p>



                    </div>



                  </div>



                  {item.source_url && (

                    <a

                      href={item.source_url}

                      target="_blank"

                      rel="noreferrer"

                      className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 px-3 text-[12px] font-semibold text-zinc-600 sm:w-auto"

                    >

                      <Icon

                        icon="fluent:open-20-regular"

                        width="16"

                      />



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



// =========================================================
// RECORDÁ
// =========================================================
function RememberTab({

  socialWork,

}) {

  const fields = [

    ["Plan", socialWork.plan],

    ["Estado", socialWork.active ? "Activa" : "Inactiva"],

    ["Tipo de receta", socialWork.recipe_type],

    [

      "Vigencia",

      socialWork.recipe_validity_days != null

        ? `${socialWork.recipe_validity_days} días`

        : "-",

    ],

    ["Validador", socialWork.validator_name],

    ["¿Por dónde valida?", socialWork.validator_type],

    ["Membrete", socialWork.letterhead],

    ["RP", socialWork.rp],

    ["Diagnóstico", socialWork.diagnosis],

    ["Monodroga", socialWork.monodrug],

    ["Nombre comercial", socialWork.commercial_name],

    ["Sustitución", socialWork.substitution],

  ];



  return (

    <div className="min-w-0 space-y-4 sm:space-y-5">



      <SectionHeader

        icon="fluent-color:note-24"

        title="Recordá / Ficha"

        description="Resumen operativo de la obra social."

      />



      <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">



        {fields.map(

          ([label, value]) => (

            <InfoCard

              key={label}

              label={label}

              value={value || "-"}

            />

          )

        )}



      </div>



      <div className="rounded-[16px] border border-amber-200 bg-amber-50 p-4 sm:p-5">



        <div className="flex items-start gap-3">



          <Icon

            icon="fluent:alert-24-regular"

            width="21"

            className="mt-0.5 shrink-0 text-amber-600"

          />



          <div className="min-w-0">



            <p className="text-[13px] font-semibold text-amber-900 sm:text-sm">

              Observaciones

            </p>



            <p className="mt-2 whitespace-pre-wrap break-words text-[12px] leading-5 text-amber-800 sm:text-[13px] sm:leading-6">

              {socialWork.observations ||

                "No hay observaciones cargadas."}

            </p>



          </div>



        </div>



      </div>



    </div>

  );

}



// =========================================================
// FACTURACIÓN / CONTACTO
// =========================================================
function BillingTab() {

  return (

    <div className="space-y-4 sm:space-y-5">



      <SectionHeader

        icon="fluent-color:receipt-24"

        title="Cómo Facturar"

        description="Información operativa de facturación."

      />



      <EmptyState

        icon="fluent:receipt-24-regular"

        title="Información pendiente"

        description="Todavía no está conectado el detalle estructurado de facturación."

      />



    </div>

  );

}



function ContactTab() {

  return (

    <div className="space-y-4 sm:space-y-5">



      <SectionHeader

        icon="fluent-color:phone-24"

        title="Contacto"

        description="Canales operativos y de autorización."

      />



      <EmptyState

        icon="fluent:phone-24-regular"

        title="Contactos pendientes"

        description="En el siguiente paso conectaremos esta vista con los contactos cargados."

      />



    </div>

  );

}



// =========================================================
// FAQ
// =========================================================
function FaqTab({

  faqs,

}) {

  const [search, setSearch] =

    useState("");



  const filtered =

    useMemo(() => {

      const q =

        search.trim().toLowerCase();



      if (!q) {

        return faqs;

      }



      return faqs.filter(

        (faq) =>

          [

            faq.question,

            faq.answer,

          ]

            .filter(Boolean)

            .join(" ")

            .toLowerCase()

            .includes(q)

      );

    }, [faqs, search]);



  return (

    <div className="min-w-0 space-y-4 sm:space-y-5">



      <SectionHeader

        icon="fluent-emoji:red-question-mark"

        title="Preguntas Frecuentes"

        description="Respuestas revisadas y aprobadas."

      />



      {faqs.length > 0 && (

        <div className="relative min-w-0">



          <Icon

            icon="fluent:search-20-regular"

            width="18"

            className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400 sm:left-4"

          />



          <input

            value={search}

            onChange={(event) =>

              setSearch(event.target.value)

            }

            placeholder="Buscar pregunta..."

            className="h-11 w-full min-w-0 rounded-xl border border-zinc-200 bg-white pl-10 pr-3 text-[13px] outline-none focus:border-[#8f2a85] sm:pl-11"

          />



        </div>

      )}



      {filtered.length === 0 ? (

        <EmptyState

          icon="fluent:question-circle-24-regular"

          title="Sin preguntas frecuentes"

          description="No hay preguntas frecuentes aprobadas disponibles."

        />

      ) : (

        <div className="min-w-0 space-y-3">



          {filtered.map(

            (faq) => (

              <details

                key={faq.id}

                className="group min-w-0 overflow-hidden rounded-[15px] border border-zinc-200 bg-white"

              >



                <summary className="flex min-w-0 cursor-pointer list-none items-start justify-between gap-3 px-4 py-4 sm:px-5">



                  <div className="flex min-w-0 items-start gap-3">



                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f9eafa]">

                      <Icon

                        icon="fluent-emoji:red-question-mark"

                        width="17"

                      />

                    </div>



                    <p className="min-w-0 break-words pt-1 text-[12px] font-semibold leading-5 text-zinc-800 sm:text-[13px]">

                      {faq.question}

                    </p>



                  </div>



                  <Icon

                    icon="fluent:chevron-down-20-regular"

                    width="18"

                    className="mt-1 shrink-0 text-zinc-400 transition group-open:rotate-180"

                  />



                </summary>



                <div className="min-w-0 border-t border-zinc-100 bg-[#fcfbfd] px-4 py-4 sm:px-5">



                  <p className="whitespace-pre-wrap break-words text-[12px] leading-5 text-zinc-600 sm:text-[13px] sm:leading-6">

                    {faq.answer}

                  </p>



                </div>



              </details>

            )

          )}



        </div>

      )}



    </div>

  );

}



// =========================================================
// COMPONENTES
// =========================================================
function SectionHeader({

  icon,

  title,

  description,

}) {

  return (

    <div className="min-w-0 rounded-[15px] border border-[#8f2a85]/10 bg-[#fbf6fc] px-4 py-3.5 sm:px-5 sm:py-4">



      <div className="flex min-w-0 items-start gap-3">



        <Icon

          icon={icon}

          width="22"

          className="shrink-0"

        />



        <div className="min-w-0">



          <h2 className="break-words text-[14px] font-bold text-[#432047] sm:text-[15px]">

            {title}

          </h2>



          <p className="mt-0.5 break-words text-[11px] leading-4 text-zinc-500 sm:text-[12px]">

            {description}

          </p>



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

    <div className="min-w-0 rounded-[16px] border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">



      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f8f1fa] sm:h-11 sm:w-11">



        <Icon

          icon={icon}

          width="24"

        />



      </div>



      <h3 className="mt-3 break-words text-[13px] font-bold text-[#8f2a85] sm:mt-4 sm:text-[14px]">

        {title}

      </h3>



      <p className="mt-1 break-words text-[11px] leading-5 text-zinc-500 sm:text-[12px]">

        {description}

      </p>



    </div>

  );

}



function InfoItem({

  label,

  value,

}) {

  return (

    <div className="min-w-0 rounded-xl bg-[#f8f7fa] px-3 py-3 sm:px-4">



      <p className="break-words text-[8px] font-bold uppercase tracking-[.06em] text-zinc-400 sm:text-[9px]">

        {label}

      </p>



      <p className="mt-1.5 break-words text-[12px] font-semibold leading-4 text-zinc-700 sm:text-[13px]">

        {value}

      </p>



    </div>

  );

}



function InfoCard({

  label,

  value,

}) {

  return (

    <div className="min-w-0 rounded-[15px] border border-zinc-200 bg-white p-3 sm:p-4">



      <p className="break-words text-[8px] font-bold uppercase tracking-[.06em] text-zinc-400 sm:text-[9px]">

        {label}

      </p>



      <p className="mt-2 break-words text-[12px] font-semibold leading-5 text-zinc-800 sm:text-[14px]">

        {value}

      </p>



    </div>

  );

}



function SummaryBox({

  label,

  value,

  highlight = false,

}) {

  return (

    <div

      className={[

        "min-w-0 rounded-[13px] border px-3 py-3 sm:px-4",

        highlight

          ? "border-[#8f2a85]/15 bg-[#fbf4fc]"

          : "border-zinc-200 bg-[#fafafa]",

      ].join(" ")}

    >



      <p className="truncate text-[8px] font-bold uppercase tracking-[.06em] text-zinc-400 sm:text-[9px]">

        {label}

      </p>



      <p

        className={[

          "mt-1 break-words text-[14px] font-bold sm:text-[16px]",

          highlight

            ? "text-[#8f2a85]"

            : "text-zinc-700",

        ].join(" ")}

      >

        {value}

      </p>



    </div>

  );

}



function Tag({

  children,

}) {

  return (

    <span className="max-w-full break-words rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-[9px] font-semibold text-zinc-600 sm:text-[10px]">

      {children}

    </span>

  );

}



function EmptyState({

  icon,

  title,

  description,

}) {

  return (

    <div className="min-w-0 rounded-[16px] border border-zinc-200 bg-white px-4 py-10 text-center sm:px-6 sm:py-12">



      <Icon

        icon={icon}

        width="30"

        className="mx-auto text-zinc-300"

      />



      <p className="mt-3 break-words text-[13px] font-semibold text-zinc-700 sm:text-sm">

        {title}

      </p>



      <p className="mx-auto mt-1 max-w-xl break-words text-[12px] leading-5 text-zinc-400 sm:text-[13px]">

        {description}

      </p>



    </div>

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



      <p className="mt-3 text-sm text-zinc-500">

        Cargando información...

      </p>



    </div>

  );

}



function ErrorState({

  message,

}) {

  return (

    <div className="min-w-0">



      <Link

        href="/sucursal/obras-sociales"

        className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#8f2a85]"

      >

        <Icon

          icon="fluent:arrow-left-20-regular"

          width="17"

        />



        Volver a Obras Sociales

      </Link>



      <div className="mt-5 rounded-[15px] border border-red-200 bg-red-50 p-4 sm:p-5">



        <div className="flex min-w-0 gap-3">



          <Icon

            icon="fluent:error-circle-24-regular"

            width="22"

            className="shrink-0 text-red-500"

          />



          <div className="min-w-0">



            <p className="break-words font-semibold text-red-700">

              No pudimos cargar esta obra social

            </p>



            <p className="mt-1 break-words text-sm text-red-600">

              {message}

            </p>



          </div>



        </div>



      </div>



    </div>

  );

}

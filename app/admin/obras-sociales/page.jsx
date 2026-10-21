"use client";



import Link from "next/link";
import { treeApiFetch } from "../../../lib/decision-trees/client";
import NewSocialWorkModal from "../../../components/social-works/NewSocialWorkModal";



import {

  useEffect,

  useMemo,

  useState,

} from "react";



function formatDate(value) {

  if (!value) {

    return "-";

  }



  try {

    return new Intl.DateTimeFormat(

      "es-AR",

      {

        dateStyle: "short",

      }

    ).format(new Date(value));

  } catch {

    return value;

  }

}



export default function AdminSocialWorksPage() {

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



  const [

    statusFilter,

    setStatusFilter,

  ] = useState("ALL");



  const [

    currentPage,

    setCurrentPage,

  ] = useState(1);



  const [

    selectedSocialWork,

    setSelectedSocialWork,

  ] = useState(null);



  const [

    saving,

    setSaving,

  ] = useState(false);

  const [creating, setCreating] = useState(false);
  const [sortBy, setSortBy] = useState("NAME");



  const itemsPerPage = 15;



  // =====================================================

  // CARGAR OBRAS SOCIALES

  // =====================================================



  const loadSocialWorks =

    async () => {

      try {

        setLoading(true);

        setError(null);



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

          result.social_works ||

            []

        );

      } catch (err) {

        setError(

          err?.message ||

            "Error cargando obras sociales"

        );

      } finally {

        setLoading(false);

      }

    };



  useEffect(() => {

    loadSocialWorks();

  }, []);



  // =====================================================

  // ACTUALIZAR

  // =====================================================



  const updateSocialWork =

    async (

      id,

      payload

    ) => {

      try {

        setSaving(true);



        const response =

          await treeApiFetch(`/api/social-works/${id}`,

            {

              method:

                "PATCH",



              headers: {

                "Content-Type":

                  "application/json",

              },



              body:

                JSON.stringify(

                  payload

                ),

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

              "No se pudo actualizar la obra social"

          );

        }



        setSelectedSocialWork(

          null

        );



        await loadSocialWorks();

      } catch (err) {

        alert(

          err?.message ||

            "Error actualizando la obra social"

        );

      } finally {

        setSaving(false);

      }

    };



  // =====================================================

  // FILTROS

  // =====================================================



  const unsortedSocialWorks = useMemo(() => {

      const q =

        search

          .toLowerCase()

          .trim();



      return socialWorks.filter(

        (socialWork) => {

          const matchesSearch =

            !q ||

            [

              socialWork.name,

              socialWork.plan,

              socialWork.recipe_type,

              socialWork.id_soft,

            ]

              .filter(

                (value) =>

                  value !== null &&

                  value !== undefined

              )

              .join(" ")

              .toLowerCase()

              .includes(q);



          const matchesStatus =

            statusFilter === "ALL" ||

            (

              statusFilter === "ACTIVE" &&

              socialWork.active

            ) ||

            (

              statusFilter === "INACTIVE" &&

              !socialWork.active

            );



          return (

            matchesSearch &&

            matchesStatus

          );

        }

      );

    }, [

      socialWorks,

      search,

      statusFilter,

    ]);

  // Orden: nombre A-Z, última actualización o última creada (más recientes primero).
  const filteredSocialWorks = useMemo(() => {
    if (sortBy === "NAME") return unsortedSocialWorks;
    const key = sortBy === "CREATED" ? "created_at" : "updated_at";
    const time = (item) => {
      const value = item?.[key] ? new Date(item[key]).getTime() : 0;
      return Number.isFinite(value) ? value : 0;
    };
    return [...unsortedSocialWorks].sort((a, b) => time(b) - time(a));
  }, [unsortedSocialWorks, sortBy]);



  // =====================================================

  // PAGINACIÓN

  // =====================================================



  const totalPages =

    Math.max(

      1,

      Math.ceil(

        filteredSocialWorks.length /

          itemsPerPage

      )

    );



  const startIndex =

    (currentPage - 1) *

    itemsPerPage;



  const endIndex =

    startIndex +

    itemsPerPage;



  const paginatedSocialWorks =

    filteredSocialWorks.slice(

      startIndex,

      endIndex

    );



  useEffect(() => {

    setCurrentPage(1);

  }, [

    search,

    statusFilter,
    sortBy,

  ]);



  const visiblePages =

    useMemo(() => {

      const pages = [];



      const start =

        Math.max(

          1,

          currentPage - 2

        );



      const end =

        Math.min(

          totalPages,

          currentPage + 2

        );



      for (

        let page = start;

        page <= end;

        page += 1

      ) {

        pages.push(page);

      }



      return pages;

    }, [

      currentPage,

      totalPages,

    ]);



  // =====================================================

  // CONTADORES

  // =====================================================



  const activeCount =

    socialWorks.filter(

      (item) =>

        item.active

    ).length;



  const inactiveCount =

    socialWorks.length -

    activeCount;



  return (

    <main>

      <div className="mx-auto max-w-7xl">



        {/* TOP */}



        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">



          <p className="text-sm text-zinc-500">

            Gestioná la información, normativa y configuración de cada obra social.

          </p>



          <button

            type="button"

            onClick={() => setCreating(true)}
            className="inline-flex items-center justify-center rounded-lg bg-[#8f2a85] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#7c2474]"

          >

            + Nueva Obra Social

          </button>



        </div>



        {/* RESUMEN */}



        <div className="mb-6 grid gap-3 sm:grid-cols-3">



          <SummaryCard

            label="Total"

            value={

              socialWorks.length

            }

          />



          <SummaryCard

            label="Activas"

            value={

              activeCount

            }

            valueClass="text-emerald-600"

          />



          <SummaryCard

            label="Inactivas"

            value={

              inactiveCount

            }

            valueClass="text-zinc-500"

          />



        </div>



        {/* FILTROS */}



        <div className="mb-5 flex flex-col gap-3 sm:flex-row">



          <input

            type="text"

            value={search}

            onChange={(e) =>

              setSearch(

                e.target.value

              )

            }

            placeholder="Buscar por nombre, plan o tipo de receta..."

            className="flex-1 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm outline-none transition focus:border-[#8f2a85] focus:ring-2 focus:ring-[#8f2a85]/10"

          />



          <select

            value={

              statusFilter

            }

            onChange={(e) =>

              setStatusFilter(

                e.target.value

              )

            }

            className="min-w-[180px] rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 outline-none transition focus:border-[#8f2a85]"

          >

            <option value="ALL">

              Todas

            </option>



            <option value="ACTIVE">

              Activas

            </option>



            <option value="INACTIVE">

              Inactivas

            </option>

          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="min-w-[200px] rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-700 outline-none transition focus:border-[#8f2a85]"
          >
            <option value="NAME">Orden: Nombre A-Z</option>
            <option value="UPDATED">Última actualizada</option>
            <option value="CREATED">Última creada</option>
          </select>



        </div>



        {/* RESULTADOS */}



        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">



          <p className="text-sm text-zinc-500">

            {

              filteredSocialWorks.length

            }{" "}

            obras sociales

          </p>



          {filteredSocialWorks.length >

            0 && (

            <p className="text-sm text-zinc-400">



              Mostrando{" "}

              {startIndex + 1}

              {" - "}

              {Math.min(

                endIndex,

                filteredSocialWorks.length

              )}

              {" de "}

              {

                filteredSocialWorks.length

              }



            </p>

          )}



        </div>



        {/* LOADING */}



        {loading && (

          <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center text-sm text-zinc-500">

            Cargando obras sociales...

          </div>

        )}



        {/* ERROR */}



        {!loading &&

          error && (

            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">

              {error}

            </div>

          )}



        {/* EMPTY */}



        {!loading &&

          !error &&

          filteredSocialWorks.length ===

            0 && (

            <div className="rounded-xl border border-zinc-200 bg-white p-10 text-center">



              <p className="font-medium text-zinc-700">

                No se encontraron obras sociales.

              </p>



            </div>

          )}



        {/* TABLE */}



        {!loading &&

          !error &&

          filteredSocialWorks.length >

            0 && (

            <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">



              <div className="overflow-x-auto">



                <table className="min-w-full text-sm">



                  <thead className="border-b border-zinc-200 bg-zinc-50/80">



                    <tr>



                      <TableHeader>

                        Obra Social

                      </TableHeader>



                      <TableHeader>

                        Plan

                      </TableHeader>



                      <TableHeader>

                        Receta

                      </TableHeader>



                      <TableHeader center>

                        Vigencia

                      </TableHeader>



                      <TableHeader center>

                        Normativas

                      </TableHeader>



                      <TableHeader center>

                        FAQs

                      </TableHeader>



                      <TableHeader>

                        Estado

                      </TableHeader>



                      <TableHeader right>

                        Acciones

                      </TableHeader>



                    </tr>



                  </thead>



                  <tbody className="divide-y divide-zinc-100">



                    {paginatedSocialWorks.map(

                      (

                        socialWork

                      ) => (

                        <tr

                          key={

                            socialWork.id

                          }

                          className="transition hover:bg-zinc-50/70"

                        >



                          <td className="px-5 py-4 align-top">



                            <div className="flex flex-col gap-1">



                              <span className="font-semibold text-zinc-900">

                                {

                                  socialWork.name

                                }

                              </span>



                              <div className="flex flex-wrap gap-2 text-[11px] text-zinc-400">



                                {socialWork.id_soft && (

                                  <span>

                                    ID sistema:{" "}

                                    {

                                      socialWork.id_soft

                                    }

                                  </span>

                                )}



                                <span>

                                  Actualizada:{" "}

                                  {formatDate(

                                    socialWork.updated_at

                                  )}

                                </span>
                                <span>Creada: {formatDate(socialWork.created_at)}</span>



                              </div>



                            </div>



                          </td>



                          <td className="max-w-[180px] px-5 py-4 align-top text-zinc-600">

                            {socialWork.plan ||

                              "-"}

                          </td>



                          <td className="max-w-[230px] px-5 py-4 align-top text-zinc-700">

                            {socialWork.recipe_type ||

                              "-"}

                          </td>



                          <td className="px-5 py-4 text-center align-top">



                            {socialWork.recipe_validity_days !=

                            null ? (

                              <span className="inline-flex rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-700">



                                {

                                  socialWork.recipe_validity_days

                                }{" "}

                                días



                              </span>

                            ) : (

                              "-"

                            )}



                          </td>



                          <td className="px-5 py-4 text-center align-top">



                            <CountBadge

                              count={

                                socialWork.normative_count

                              }

                              type="purple"

                            />



                          </td>



                          <td className="px-5 py-4 text-center align-top">



                            <CountBadge

                              count={

                                socialWork.faq_count

                              }

                              type="green"

                            />



                          </td>



                          <td className="px-5 py-4 align-top">



                            {socialWork.active ? (

                              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">



                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />



                                Activa



                              </span>

                            ) : (

                              <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500">



                                <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />



                                Inactiva



                              </span>

                            )}



                          </td>



                          <td className="px-5 py-4 align-top">



                            <div className="flex justify-end gap-2">



                              <Link

                                href={`/admin/obras-sociales/${socialWork.id}`}

                                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition hover:border-[#8f2a85]/30 hover:bg-[#8f2a85]/5 hover:text-[#8f2a85]"

                              >

                                Ver

                              </Link>



                              <button

                                type="button"

                                onClick={() =>

                                  setSelectedSocialWork(

                                    socialWork

                                  )

                                }

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



        {/* PAGINACIÓN */}



        {!loading &&

          !error &&

          filteredSocialWorks.length >

            0 &&

          totalPages > 1 && (

            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">



              <p className="text-sm text-zinc-500">



                Página{" "}



                <strong className="text-zinc-800">

                  {

                    currentPage

                  }

                </strong>



                {" de "}



                <strong className="text-zinc-800">

                  {

                    totalPages

                  }

                </strong>



              </p>



              <div className="flex flex-wrap items-center gap-1.5">



                <PageButton

                  disabled={

                    currentPage === 1

                  }

                  onClick={() =>

                    setCurrentPage(1)

                  }

                >

                  «

                </PageButton>



                <PageButton

                  disabled={

                    currentPage === 1

                  }

                  onClick={() =>

                    setCurrentPage(

                      (page) =>

                        Math.max(

                          1,

                          page - 1

                        )

                    )

                  }

                >

                  ← Anterior

                </PageButton>



                {visiblePages[0] >

                  1 && (

                  <span className="px-1 text-zinc-400">

                    …

                  </span>

                )}



                {visiblePages.map(

                  (page) => (

                    <button

                      key={page}

                      type="button"

                      onClick={() =>

                        setCurrentPage(

                          page

                        )

                      }

                      className={[

                        "h-9 min-w-9 rounded-lg px-2 text-sm font-medium transition",

                        page ===

                        currentPage

                          ? "bg-[#8f2a85] text-white shadow-sm"

                          : "border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",

                      ].join(" ")}

                    >

                      {page}

                    </button>

                  )

                )}



                {visiblePages[

                  visiblePages.length -

                    1

                ] <

                  totalPages && (

                  <span className="px-1 text-zinc-400">

                    …

                  </span>

                )}



                <PageButton

                  disabled={

                    currentPage ===

                    totalPages

                  }

                  onClick={() =>

                    setCurrentPage(

                      (page) =>

                        Math.min(

                          totalPages,

                          page + 1

                        )

                    )

                  }

                >

                  Siguiente →

                </PageButton>



                <PageButton

                  disabled={

                    currentPage ===

                    totalPages

                  }

                  onClick={() =>

                    setCurrentPage(

                      totalPages

                    )

                  }

                >

                  »

                </PageButton>



              </div>



            </div>

          )}



      </div>



      {/* EDIT MODAL */}



      {selectedSocialWork && (

        <EditSocialWorkModal

          socialWork={

            selectedSocialWork

          }

          saving={

            saving

          }

          onClose={() =>

            setSelectedSocialWork(

              null

            )

          }

          onSave={

            updateSocialWork

          }

        />

      )}
      {creating && (
        <NewSocialWorkModal
          onClose={() => setCreating(false)}
          onCreated={() => loadSocialWorks()}
        />
      )}




    </main>

  );

}



function SummaryCard({

  label,

  value,

  valueClass = "text-zinc-900",

}) {

  return (

    <div className="rounded-xl border border-zinc-200 bg-white px-5 py-4">



      <p className="text-xs font-medium text-zinc-400">

        {label}

      </p>



      <p

        className={`mt-1 text-2xl font-semibold ${valueClass}`}

      >

        {value}

      </p>



    </div>

  );

}



function TableHeader({

  children,

  center,

  right,

}) {

  return (

    <th

      className={[

        "px-5 py-3 text-xs font-semibold uppercase tracking-wide text-zinc-500",

        center

          ? "text-center"

          : right

            ? "text-right"

            : "text-left",

      ].join(" ")}

    >

      {children}

    </th>

  );

}



function CountBadge({

  count = 0,

  type,

}) {

  const active =

    Number(count) > 0;



  return (

    <span

      className={[

        "inline-flex min-w-9 justify-center rounded-lg px-2.5 py-1 text-xs font-semibold",

        active &&

        type === "purple"

          ? "bg-[#8f2a85]/10 text-[#8f2a85]"

          : active &&

              type === "green"

            ? "bg-[#93c01f]/15 text-[#668500]"

            : "bg-zinc-100 text-zinc-400",

      ].join(" ")}

    >

      {count || 0}

    </span>

  );

}



function PageButton({

  children,

  onClick,

  disabled,

}) {

  return (

    <button

      type="button"

      disabled={disabled}

      onClick={onClick}

      className="min-h-9 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"

    >

      {children}

    </button>

  );

}



// =========================================================

// EDIT MODAL

// =========================================================



function EditSocialWorkModal({

  socialWork,

  saving,

  onClose,

  onSave,

}) {

  const [

    form,

    setForm,

  ] = useState({

    name:

      socialWork.name || "",



    plan:

      socialWork.plan || "",



    recipe_type:

      socialWork.recipe_type || "",



    recipe_validity_days:

      socialWork.recipe_validity_days ??

      "",



    letterhead:

      socialWork.letterhead ||

      "",



    rp:

      socialWork.rp ??

      "",



    diagnosis:

      socialWork.diagnosis ||

      "",



    monodrug:

      socialWork.monodrug ||

      "",



    commercial_name:

      socialWork.commercial_name ||

      "",
    tys_code: socialWork.tys_code || "",



    substitution:

      socialWork.substitution ||

      "",



    observations:

      socialWork.observations ||

      "",



    active:

      Boolean(

        socialWork.active

      ),

  });



  const change =

    (

      field,

      value

    ) => {

      setForm(

        (current) => ({

          ...current,

          [field]:

            value,

        })

      );

    };



  const submit =

    async () => {

      await onSave(

        socialWork.id,

        form

      );

    };



  return (

    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">



      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">



        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">



          <div>



            <h2 className="text-lg font-semibold text-zinc-900">

              Editar Obra Social

            </h2>



            <p className="text-sm text-zinc-400">

              {

                socialWork.name

              }

            </p>



          </div>



          <button

            type="button"

            onClick={

              onClose

            }

            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100"

          >

            ✕

          </button>



        </div>



        <div className="overflow-y-auto p-6">



          <div className="grid gap-5 md:grid-cols-2">



            <FormField

              full

              label="Nombre"

              value={

                form.name

              }

              onChange={(value) =>

                change(

                  "name",

                  value

                )

              }

            />



            <FormField

              label="Plan / Cobertura"

              value={

                form.plan

              }

              onChange={(value) =>

                change(

                  "plan",

                  value

                )

              }

            />



            <FormField

              label="Tipo de receta"

              value={

                form.recipe_type

              }

              onChange={(value) =>

                change(

                  "recipe_type",

                  value

                )

              }

            />



            <FormField

              label="Vigencia receta"

              type="number"

              value={

                form.recipe_validity_days

              }

              onChange={(value) =>

                change(

                  "recipe_validity_days",

                  value

                )

              }

            />



            <FormField

              label="RP"

              type="number"

              value={

                form.rp

              }

              onChange={(value) =>

                change(

                  "rp",

                  value

                )

              }

            />



            <FormField

              label="Membrete"

              value={

                form.letterhead

              }

              onChange={(value) =>

                change(

                  "letterhead",

                  value

                )

              }

            />



            <FormField

              label="Diagnóstico"

              value={

                form.diagnosis

              }

              onChange={(value) =>

                change(

                  "diagnosis",

                  value

                )

              }

            />



            <FormField

              label="Monodroga"

              value={

                form.monodrug

              }

              onChange={(value) =>

                change(

                  "monodrug",

                  value

                )

              }

            />



            <FormField

              label="Nombre comercial"

              value={

                form.commercial_name

              }

              onChange={(value) =>

                change(

                  "commercial_name",

                  value

                )

              }

            />
            <FormField

              label="Código TYS (opcional)"

              value={

                form.tys_code

              }

              onChange={(value) =>

                change(

                  "tys_code",

                  value

                )

              }

            />



            <FormField

              full

              label="Sustitución"

              value={

                form.substitution

              }

              onChange={(value) =>

                change(

                  "substitution",

                  value

                )

              }

            />



            <div className="md:col-span-2">



              <label className="mb-2 block text-sm font-medium text-zinc-700">

                Observaciones

              </label>



              <textarea

                rows={4}

                value={

                  form.observations

                }

                onChange={(e) =>

                  change(

                    "observations",

                    e.target.value

                  )

                }

                className="w-full rounded-lg border border-zinc-300 px-3.5 py-3 text-sm outline-none focus:border-[#8f2a85]"

              />



            </div>



          </div>



          <div className="mt-6 flex items-center justify-between rounded-xl bg-zinc-50 p-4">



            <div>



              <p className="text-sm font-semibold text-zinc-800">

                Estado

              </p>



              <p className="text-xs text-zinc-400">

                {

                  form.active

                    ? "Obra Social activa"

                    : "Obra Social inactiva"

                }

              </p>



            </div>



            <button

              type="button"

              onClick={() =>

                change(

                  "active",

                  !form.active

                )

              }

              className={[

                "relative h-7 w-12 rounded-full transition",

                form.active

                  ? "bg-[#8f2a85]"

                  : "bg-zinc-300",

              ].join(" ")}

            >



              <span

                className={[

                  "absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all",

                  form.active

                    ? "left-6"

                    : "left-1",

                ].join(" ")}

              />



            </button>



          </div>



        </div>



        <div className="flex justify-end gap-3 border-t border-zinc-200 px-6 py-4">



          <button

            type="button"

            onClick={

              onClose

            }

            disabled={

              saving

            }

            className="rounded-lg border border-zinc-200 px-4 py-2.5 text-sm text-zinc-600"

          >

            Cancelar

          </button>



          <button

            type="button"

            onClick={

              submit

            }

            disabled={

              saving ||

              !form.name.trim()

            }

            className="rounded-lg bg-[#8f2a85] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"

          >

            {

              saving

                ? "Guardando..."

                : "Guardar cambios"

            }

          </button>



        </div>



      </div>



    </div>

  );

}



function FormField({

  label,

  value,

  onChange,

  type = "text",

  full = false,

}) {

  return (

    <div

      className={

        full

          ? "md:col-span-2"

          : ""

      }

    >



      <label className="mb-2 block text-sm font-medium text-zinc-700">

        {label}

      </label>



      <input

        type={type}

        min={

          type === "number"

            ? "0"

            : undefined

        }

        value={value}

        onChange={(e) =>

          onChange(

            e.target.value

          )

        }

        className="w-full rounded-lg border border-zinc-300 bg-white px-3.5 py-2.5 text-sm outline-none focus:border-[#8f2a85]"

      />



    </div>

  );

}
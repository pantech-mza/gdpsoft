"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import { refreshStoredSession } from "../../../lib/client/session";

const field = "w-full min-w-0 rounded-xl border border-[#e6d5e5] bg-white px-3 py-2.5 text-sm outline-none transition focus:border-[#8f2a85] focus:ring-2 focus:ring-[#8f2a85]/10";
const btn = "rounded-xl border border-[#e6d5e5] px-3 py-2 text-sm font-semibold text-zinc-700 transition disabled:opacity-50 hover:border-[#d2b6d0] hover:bg-[#faf5fa]";
const btnPrimary = "rounded-xl bg-[#8f2a85] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#74216c] disabled:opacity-50";
const empty = { code: "", name: "", branch_type: "", username: "", email: "", password: "" };
const PAGE_SIZE = 10;

export default function SucursalesAdminPage() {
  const [branches, setBranches] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [newBranch, setNewBranch] = useState(null);
  const [editing, setEditing] = useState(null);
  const [reset, setReset] = useState(null);
  const [selected, setSelected] = useState(null);
  const [actionMenu, setActionMenu] = useState(null);

  const request = useCallback(async (url, options = {}) => {
    let token = sessionStorage.getItem("gdpsoft_access_token") || await refreshStoredSession();
    const make = access => fetch(url, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
    });
    let response = await make(token);
    if (response.status === 401) {
      token = await refreshStoredSession();
      response = await make(token);
    }
    const result = await response.json();
    if (!response.ok || !result.ok) throw new Error(result.error || "Error en la solicitud");
    return result;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await request("/api/admin/sucursales");
      setBranches(result.branches || []);
      setAccounts(result.accounts || []);
      setDevices(result.devices || []);
    } catch (error) {
      setNotice({ error: true, text: error.message });
    } finally {
      setLoading(false);
    }
  }, [request]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); setActionMenu(null); }, [search]);
  useEffect(() => {
    if (!actionMenu) return;
    const close = () => setActionMenu(null);
    const onKey = (event) => { if (event.key === "Escape") close(); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [actionMenu]);

  const rows = useMemo(
    () => branches.filter(b => `${b.code} ${b.name} ${b.branch_type || ""}`.toLowerCase().includes(search.toLowerCase())),
    [branches, search]
  );
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedRows = useMemo(() => rows.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [rows, currentPage]);

  const getAccounts = id => accounts.filter(a => String(a.branch_id) === String(id));
  const getDevices = id => devices.filter(d => String(d.branch_id) === String(id));

  function openActions(event, branch, account) {
    if (actionMenu?.id === branch.id) { setActionMenu(null); return; }
    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 210;
    const menuHeight = 208;
    const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
    const top = rect.bottom + menuHeight + 8 > window.innerHeight
      ? Math.max(8, rect.top - menuHeight - 6)
      : rect.bottom + 6;
    setActionMenu({ id: branch.id, branch, account, left, top });
  }

  function runAction(action) {
    if (!actionMenu) return;
    const { branch: b, account } = actionMenu;
    setActionMenu(null);
    if (action === "devices") setSelected(b.id);
    if (action === "edit") setEditing({ id: b.id, name: b.name, branch_type: b.branch_type || "" });
    if (action === "password" && account) setReset({ id: account.id, username: account.username, password: "" });
    if (action === "active" && confirm(`¿${b.active ? "Desactivar" : "Activar"} la sucursal ${b.name} y su cuenta?`)) {
      mutate("/api/admin/sucursales", "PATCH", { id: b.id, action: "set_active", active: !b.active }, "Estado actualizado");
    }
  }

  function ActionButton({ branch, account }) {
    return <button
      type="button"
      onClick={(event) => openActions(event, branch, account)}
      aria-label={`Acciones de ${branch.name}`}
      aria-haspopup="menu"
      aria-expanded={actionMenu?.id === branch.id}
      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[#e8d7e7] bg-white text-[#8f2a85] shadow-sm transition hover:border-[#8f2a85] hover:bg-[#faf1fa] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8f2a85]"
      title="Acciones"
    ><Icon icon="fluent:more-horizontal-24-filled" width="22" /></button>;
  }

  async function mutate(url, method, data, success) {
    setBusy(true);
    try {
      await request(url, { method, body: JSON.stringify(data) });
      setActionMenu(null);
      setNewBranch(null);
      setEditing(null);
      setReset(null);
      await load();
      setNotice({ error: false, text: success });
    } catch (error) {
      setNotice({ error: true, text: error.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1380px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#8f2a85]">Administración GDPSoft</p>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900">Gestión de sucursales</h1>
          <p className="mt-1 text-sm text-zinc-500">Una cuenta por sucursal. Los dispositivos se registran al ingresar por primera vez.</p>
        </div>
        <button className={btnPrimary} onClick={() => setNewBranch({ ...empty })}>+ Crear sucursal y cuenta</button>
      </div>

      {notice && (
        <div role="status" className={`rounded-2xl border p-3 text-sm ${notice.error ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>
          {notice.text}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Sucursales" value={branches.length} />
        <Stat label="Con una cuenta" value={branches.filter(b => getAccounts(b.id).length === 1).length} />
        <Stat label="Dispositivos" value={devices.length} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#eaddeb] bg-white shadow-sm">
        <div className="border-b border-[#f0e4ef] bg-gradient-to-r from-[#8f2a85]/8 via-white to-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Listado de sucursales</h2>
              <p className="mt-1 text-sm text-zinc-500">Mostrando {paginatedRows.length} de {rows.length} resultados.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <input className={`${field} w-full sm:w-[320px]`} placeholder="Buscar por nombre, código o circuito" value={search} onChange={e => setSearch(e.target.value)} />
              <button className={btn} onClick={load}>Actualizar listado</button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="p-5 text-sm text-zinc-500">Cargando…</div>
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr className="border-b border-[#f0e4ef] bg-[#fcf9fc] text-zinc-600">
                    <th className="p-3 font-semibold">Sucursal</th>
                    <th className="p-3 font-semibold">Cuenta</th>
                    <th className="p-3 font-semibold">Correo</th>
                    <th className="p-3 font-semibold">Dispositivos</th>
                    <th className="p-3 font-semibold">Estado</th>
                    <th className="p-3 font-semibold">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedRows.map((b, index) => {
                    const a = getAccounts(b.id);
                    const account = a[0];
                    const d = getDevices(b.id);
                    return (
                      <tr key={b.id} className={`border-b border-[#f6edf5] last:border-0 ${index % 2 === 0 ? "bg-white" : "bg-[#fffdfd]"}`}>
                        <td className="p-3 align-top">
                          <strong className="text-zinc-900">{b.name}</strong>
                          <p className="mt-1 text-xs text-zinc-400">{b.code} · {b.branch_type || "Sin circuito"}</p>
                        </td>
                        <td className="p-3 align-top">
                          {a.length === 1 ? (
                            <span className="inline-flex rounded-full bg-[#f4e7f3] px-2.5 py-1 text-xs font-semibold text-[#7c2474]">{account.username}</span>
                          ) : (
                            <span className="text-amber-700">{a.length === 0 ? "Sin cuenta" : `${a.length} cuentas: revisar`}</span>
                          )}
                        </td>
                        <td className="p-3 align-top text-zinc-600">{account?.email || "—"}</td>
                        <td className="p-3 align-top">
                          <button className="inline-flex rounded-full bg-[#f8f1f7] px-2.5 py-1 text-xs font-semibold text-[#8f2a85] hover:bg-[#f2e3f0]" onClick={() => setSelected(b.id)}>
                            {d.length} registrados
                          </button>
                        </td>
                        <td className="p-3 align-top">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${b.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>
                            {b.active ? "Activa" : "Inactiva"}
                          </span>
                        </td>
                        <td className="p-3 align-top">
                          <ActionButton branch={b} account={a.length === 1 ? account : null} />
                        </td>
                      </tr>
                    );
                  })}
                  {paginatedRows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-sm text-zinc-500">No se encontraron sucursales para la búsqueda actual.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>


            <div className="grid gap-3 p-3 md:hidden">
              {paginatedRows.map(b => {
                const linked = getAccounts(b.id);
                const account = linked[0];
                const count = getDevices(b.id).length;
                return <article key={b.id} className="min-w-0 rounded-2xl border border-[#eaddeb] bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="break-words text-base font-bold text-zinc-900">{b.name}</h3>
                      <p className="mt-1 break-all text-xs text-zinc-500">{b.code} · {b.branch_type || "Sin circuito"}</p>
                    </div>
                    <ActionButton branch={b} account={linked.length === 1 ? account : null} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${b.active ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-600"}`}>{b.active ? "Activa" : "Inactiva"}</span>
                    <span className="rounded-full bg-[#f4e7f3] px-2.5 py-1 text-xs font-semibold text-[#7c2474]">{linked.length === 1 ? account.username : linked.length === 0 ? "Sin cuenta" : `${linked.length} cuentas`}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 border-t border-[#f0e4ef] pt-3 text-xs">
                    <div className="min-w-0"><span className="text-zinc-500">Dispositivos</span><button type="button" className="mt-1 block font-semibold text-[#8f2a85]" onClick={() => setSelected(b.id)}>{count} registrados</button></div>
                    <div className="min-w-0"><span className="text-zinc-500">Correo</span><p className="mt-1 break-all font-medium text-zinc-700">{account?.email || "—"}</p></div>
                  </div>
                </article>;
              })}
              {paginatedRows.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">No se encontraron sucursales.</p>}
            </div>

            <div className="flex flex-col gap-3 border-t border-[#f0e4ef] bg-[#fcf9fc] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-zinc-500">
                Página <strong className="text-zinc-700">{currentPage}</strong> de <strong className="text-zinc-700">{totalPages}</strong>
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button className={btn} disabled={currentPage === 1} onClick={() => setPage(1)}>Primera</button>
                <button className={btn} disabled={currentPage === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>Anterior</button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(n => n === 1 || n === totalPages || Math.abs(n - currentPage) <= 1)
                  .map((n, idx, arr) => (
                    <div key={n} className="flex items-center gap-2">
                      {idx > 0 && arr[idx - 1] !== n - 1 ? <span className="px-1 text-zinc-400">…</span> : null}
                      <button
                        onClick={() => setPage(n)}
                        className={n === currentPage ? "rounded-xl bg-[#8f2a85] px-3 py-2 text-sm font-semibold text-white" : btn}
                      >
                        {n}
                      </button>
                    </div>
                  ))}
                <button className={btn} disabled={currentPage === totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>Siguiente</button>
                <button className={btn} disabled={currentPage === totalPages} onClick={() => setPage(totalPages)}>Última</button>
              </div>
            </div>
          </>
        )}
      </section>

      {actionMenu && (
        <>
          <button type="button" aria-label="Cerrar acciones" onClick={() => setActionMenu(null)} className="fixed inset-0 z-[220] cursor-default bg-transparent" />
          <div
            role="menu"
            aria-label={`Acciones de ${actionMenu.branch.name}`}
            className="fixed z-[221] w-[210px] overflow-hidden rounded-2xl border border-[#eaddeb] bg-white p-1.5 shadow-[0_12px_36px_rgba(45,17,47,.20)]"
            style={{ left: actionMenu.left, top: actionMenu.top }}
          >
            {[
              ["devices", "Dispositivos", "fluent:desktop-24-regular"],
              ["edit", "Editar sucursal", "fluent:edit-24-regular"],
              ...(actionMenu.account ? [["password", "Cambiar clave", "fluent:key-24-regular"]] : []),
              ["active", actionMenu.branch.active ? "Desactivar" : "Activar", "fluent:power-24-regular"],
            ].map(([action, label, icon]) => (
              <button key={action} role="menuitem" type="button" disabled={busy} onClick={() => runAction(action)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition hover:bg-[#faf1fa] disabled:opacity-50 ${action === "active" && actionMenu.branch.active ? "text-red-600" : "text-zinc-700"}`}>
                <Icon icon={icon} width="18" /><span>{label}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {selected !== null && (
        <Modal title={`Dispositivos · ${branches.find(b => b.id === selected)?.name || "Sucursal"}`} onClose={() => setSelected(null)}>
          <div className="space-y-3">
            {getDevices(selected).length === 0 && <p className="text-sm text-zinc-500">No hay dispositivos registrados.</p>}
            {getDevices(selected).map(d => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#eddfee] bg-[#fcfafc] p-3">
                <div>
                  <strong className="text-sm text-zinc-900">{d.device_name}</strong>
                  <p className="text-xs text-zinc-500">{d.device_type} · {d.active ? "Activo" : "Inactivo"}</p>
                </div>
                <button disabled={busy} className={btn} onClick={() => mutate("/api/admin/sucursales/dispositivos", "PATCH", { device_id: d.id, active: !d.active }, "Dispositivo actualizado")}>
                  {d.active ? "Desactivar" : "Activar"}
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}

      {newBranch && (
        <Modal title="Crear sucursal y cuenta" onClose={() => setNewBranch(null)}>
          <form onSubmit={e => { e.preventDefault(); mutate("/api/admin/sucursales", "POST", newBranch, "Sucursal y cuenta creadas correctamente"); }} className="grid gap-3 sm:grid-cols-2">
            {[ ["code", "Código"], ["name", "Nombre"], ["branch_type", "Circuito / tipo"], ["username", "Usuario de acceso"], ["email", "Correo"] ].map(([key, label]) => (
              <label key={key} className="text-xs text-zinc-600">
                {label}
                <input
                  className={`${field} mt-1`}
                  type={key === "email" ? "email" : "text"}
                  required={key !== "branch_type" && key !== "username"}
                  value={newBranch[key]}
                  onChange={e => setNewBranch({ ...newBranch, [key]: e.target.value })}
                />
              </label>
            ))}
            <label className="text-xs text-zinc-600">
              Contraseña inicial (12+)
              <input className={`${field} mt-1`} type="password" minLength={12} required value={newBranch.password} onChange={e => setNewBranch({ ...newBranch, password: e.target.value })} />
            </label>
            <div className="sm:col-span-2 flex justify-end"><button disabled={busy} className={btnPrimary}>Crear sucursal</button></div>
          </form>
        </Modal>
      )}

      {editing && (
        <Modal title="Editar sucursal" onClose={() => setEditing(null)}>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); mutate("/api/admin/sucursales", "PATCH", { ...editing, action: "edit" }, "Sucursal actualizada"); }}>
            <label className="block text-xs text-zinc-600">
              Nombre
              <input required className={`${field} mt-1`} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} />
            </label>
            <label className="block text-xs text-zinc-600">
              Circuito / tipo
              <input className={`${field} mt-1`} value={editing.branch_type} onChange={e => setEditing({ ...editing, branch_type: e.target.value })} />
            </label>
            <button disabled={busy} className={btnPrimary}>Guardar cambios</button>
          </form>
        </Modal>
      )}

      {reset && (
        <Modal title={`Nueva contraseña · ${reset.username}`} onClose={() => setReset(null)}>
          <form className="space-y-3" onSubmit={e => { e.preventDefault(); mutate("/api/admin/usuarios", "PATCH", { id: reset.id, action: "reset_password", password: reset.password }, "Contraseña temporal actualizada. Compartila por un canal seguro."); }}>
            <p className="text-sm text-zinc-500">La contraseña anterior no puede consultarse.</p>
            <input className={field} type="password" minLength={12} required placeholder="Nueva contraseña temporal" value={reset.password} onChange={e => setReset({ ...reset, password: e.target.value })} />
            <button disabled={busy} className={btnPrimary}>Guardar nueva contraseña</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-2xl border border-[#eaddeb] bg-gradient-to-br from-white to-[#fbf6fb] p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-[#8f2a85]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-zinc-900">{value}</p>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-zinc-900">{title}</h2>
          <button className="flex h-9 w-9 items-center justify-center rounded-xl text-xl text-zinc-500 transition hover:bg-zinc-100" onClick={onClose} type="button" aria-label="Cerrar">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

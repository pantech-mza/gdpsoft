"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const V = "#8f2a85";
const PAGE_SIZE = 20;

const SUITE_LABELS = {
  NORMATIVE: "Normativas",
  IMAGE: "Imágenes",
  QA: "QA general",
};

const CATEGORY_LABELS = {
  RESPONSE: "Respuesta normativa",
  INTEGRITY: "Integridad documental",
  IMAGE: "Análisis de imagen",
  DETECTION: "Detección",
};

const ROUTE_LABELS = {
  CACHE: "Caché",
  SEMANTIC: "Búsqueda normativa",
  STRUCTURED_PROFILE: "Ficha estructurada",
  STRUCTURED_OPERATION: "Regla operativa",
  STRUCTURED_CONTACT: "Contacto",
};

const SOURCE_LABELS = {
  CACHE: "Caché",
  OPENAI_FILE_SEARCH: "Normativa indexada",
  STRUCTURED_PROFILE: "Ficha estructurada",
  STRUCTURED_OPERATION: "Regla operativa",
  STRUCTURED_CONTACT: "Contacto",
};

function ms(value) {
  const n = Number(value || 0);
  if (!n) return "—";
  return n < 1000 ? `${Math.round(n)} ms` : `${(n / 1000).toFixed(1)} s`;
}

function dt(value) {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return String(value);
  }
}

function compact(value) {
  return Number(value || 0).toLocaleString("es-AR");
}

function suiteLabel(value) {
  return SUITE_LABELS[String(value || "").toUpperCase()] || value || "—";
}

function categoryLabel(value) {
  return CATEGORY_LABELS[String(value || "").toUpperCase()] || value || "—";
}

function routeLabel(value) {
  return ROUTE_LABELS[String(value || "").toUpperCase()] || value || "—";
}

function sourceLabel(value) {
  return SOURCE_LABELS[String(value || "").toUpperCase()] || value || "—";
}

function performanceLevel(value) {
  const n = Number(value || 0);
  if (!n) return { label: "Sin medir", cls: "neutral", icon: "⚪" };
  if (n <= 3000) return { label: "Óptimo", cls: "good", icon: "🟢" };
  if (n <= 6000) return { label: "No óptimo", cls: "warn", icon: "🟡" };
  return { label: "Crítico", cls: "bad", icon: "🔴" };
}

function qualityLevel(value) {
  if (value == null) return { label: "No aplica", cls: "neutral" };
  const n = Number(value);
  if (n >= 85) return { label: "Buena", cls: "good" };
  if (n >= 70) return { label: "Aceptable", cls: "warn" };
  return { label: "Crítica", cls: "bad" };
}

function StatusPill({ value }) {
  const s = String(value || "—").toUpperCase();
  const map = {
    PASS: ["Aprobado", "good"],
    WARNING: ["Atención", "warn"],
    FAIL: ["Falló", "bad"],
    ERROR: ["Error", "bad"],
  };
  const [label, cls] = map[s] || [s, "neutral"];
  return <span className={`pill ${cls}`}>{label}</span>;
}

function StatCard({ label, value, sub, accent = false }) {
  return (
    <div className={`statCard ${accent ? "accent" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {sub ? <small>{sub}</small> : null}
    </div>
  );
}

function EmptyChart({ text = "Sin datos para mostrar" }) {
  return <div className="emptyChart">{text}</div>;
}

function DonutChart({ value = 0, label = "Calidad", suffix = "/100" }) {
  const safe = Math.max(0, Math.min(100, Number(value || 0)));
  return (
    <div className="chartCard">
      <div className="chartHead">
        <div>
          <strong>{label}</strong>
          <span>Última corrida</span>
        </div>
      </div>
      <div className="donutWrap">
        <div className="donut" style={{ "--value": `${safe * 3.6}deg` }}>
          <div className="donutInner">
            <b>{safe ? safe.toFixed(0) : "—"}</b>
            <span>{safe ? suffix : ""}</span>
          </div>
        </div>
        <div className="chartNote">
          <span>85–100 · Buena</span>
          <span>70–84 · Aceptable</span>
          <span>&lt; 70 · Crítica</span>
        </div>
      </div>
    </div>
  );
}

function StatusBars({ run }) {
  const values = [
    ["Aprobado", Number(run?.passed || 0), "goodBar"],
    ["Atención", Number(run?.warnings || 0), "warnBar"],
    ["Fallos", Number(run?.failed || 0), "badBar"],
    ["Errores", Number(run?.errors || 0), "badBar"],
  ];
  const max = Math.max(1, ...values.map((x) => x[1]));
  return (
    <div className="chartCard">
      <div className="chartHead">
        <div>
          <strong>Resultado de la corrida</strong>
          <span>Distribución de casos</span>
        </div>
      </div>
      <div className="bars">
        {values.map(([label, value, cls]) => (
          <div className="barRow" key={label}>
            <span>{label}</span>
            <div className="barTrack">
              <i className={cls} style={{ width: `${(value / max) * 100}%` }} />
            </div>
            <b>{value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function TrendChart({ runs = [] }) {
  const data = [...runs].slice(0, 8).reverse();
  if (!data.length) {
    return (
      <div className="chartCard">
        <div className="chartHead"><div><strong>Performance</strong><span>P95 por corrida</span></div></div>
        <EmptyChart />
      </div>
    );
  }
  const max = Math.max(1, ...data.map((r) => Number(r.p95_ms || 0)));
  const points = data
    .map((r, i) => {
      const x = data.length === 1 ? 50 : 8 + (i * 84) / (data.length - 1);
      const y = 88 - (Number(r.p95_ms || 0) / max) * 70;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className="chartCard">
      <div className="chartHead">
        <div>
          <strong>Performance</strong>
          <span>P95 de las últimas corridas</span>
        </div>
      </div>
      <div className="svgChart">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Performance P95">
          <line x1="8" y1="88" x2="92" y2="88" className="axisLine" />
          <polyline points={points} className="trendLine" />
          {data.map((r, i) => {
            const x = data.length === 1 ? 50 : 8 + (i * 84) / (data.length - 1);
            const y = 88 - (Number(r.p95_ms || 0) / max) * 70;
            return <circle key={r.id || i} cx={x} cy={y} r="1.8" className="trendDot" />;
          })}
        </svg>
        <div className="trendLegend">
          <span>Más reciente: <b>{ms(data[data.length - 1]?.p95_ms)}</b></span>
          <span>Mejor: <b>{ms(Math.min(...data.map((r) => Number(r.p95_ms || 0)).filter(Boolean)))}</b></span>
        </div>
      </div>
    </div>
  );
}

function RouteChart({ rows = [] }) {
  const counts = {};
  rows.forEach((r) => {
    const key = routeLabel(r.route || "Sin ruta");
    counts[key] = (counts[key] || 0) + 1;
  });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(1, ...entries.map(([, n]) => n));
  return (
    <div className="chartCard">
      <div className="chartHead">
        <div>
          <strong>Rutas utilizadas</strong>
          <span>En los resultados visibles</span>
        </div>
      </div>
      {entries.length ? (
        <div className="bars compactBars">
          {entries.map(([label, value]) => (
            <div className="barRow" key={label}>
              <span>{label}</span>
              <div className="barTrack"><i style={{ width: `${(value / max) * 100}%` }} /></div>
              <b>{value}</b>
            </div>
          ))}
        </div>
      ) : <EmptyChart />}
    </div>
  );
}

function MiniBarChart({ title, subtitle, items = [] }) {
  const max = Math.max(1, ...items.map((x) => Number(x.value || 0)));
  return (
    <div className="chartCard">
      <div className="chartHead"><div><strong>{title}</strong><span>{subtitle}</span></div></div>
      {items.some((x) => Number(x.value || 0) > 0) ? (
        <div className="bars compactBars">
          {items.map((x) => (
            <div className="barRow" key={x.label}>
              <span>{x.label}</span>
              <div className="barTrack"><i style={{ width: `${(Number(x.value || 0) / max) * 100}%` }} /></div>
              <b>{x.value || 0}</b>
            </div>
          ))}
        </div>
      ) : <EmptyChart text="Todavía no hay actividad" />}
    </div>
  );
}

function Pager({ pagination, onPage }) {
  const p = pagination || { page: 1, totalPages: 1, total: 0 };
  return (
    <div className="pager">
      <button disabled={p.page <= 1} onClick={() => onPage(p.page - 1)}>← Anterior</button>
      <span>Página {p.page} de {p.totalPages} · {p.total} resultados</span>
      <button disabled={p.page >= p.totalPages} onClick={() => onPage(p.page + 1)}>Siguiente →</button>
    </div>
  );
}

function QaRows({ rows = [], pagination, onPage }) {
  const [open, setOpen] = useState(null);

  return (
    <>
      <div className="resultList">
        <div className="resultHeader">
          <span>Pregunta / Caso</span>
          <span>Suite</span>
          <span>Categoría</span>
          <span>Ruta</span>
          <span>Tiempo</span>
          <span>Calidad</span>
          <span />
        </div>

        {rows.length ? rows.map((r) => {
          const expanded = open === r.id;
          const perf = performanceLevel(r.elapsed_ms);
          const q = qualityLevel(r.quality_score);
          const answer = r.actual?.answer || r.actual?.direct_answer || r.actual?.summary || "";
          const breakdown = r.quality_breakdown || {};
          return (
            <div className={`resultItem ${expanded ? "expanded" : ""}`} key={r.id || r.case_id}>
              <button className="resultRow" onClick={() => setOpen(expanded ? null : r.id)}>
                <span className="questionCell">
                  <b>{r.question || "Control de integridad documental"}</b>
                  <small>{r.case_id}</small>
                </span>
                <span>{suiteLabel(r.suite)}</span>
                <span>{categoryLabel(r.category)}</span>
                <span className="routeTag">{routeLabel(r.route)}</span>
                <span><span className={`traffic ${perf.cls}`}>{perf.icon} {ms(r.elapsed_ms)}</span></span>
                <span><span className={`qualityTag ${q.cls}`}>{r.quality_score == null ? "—" : `${Number(r.quality_score).toFixed(0)}/100`}</span></span>
                <span className={`chevron ${expanded ? "up" : ""}`}>⌄</span>
              </button>

              {expanded ? (
                <div className="resultDetail">
                  <div className="detailGrid">
                    <div>
                      <label>Pregunta realizada</label>
                      <p>{r.question || "No aplica: control de integridad documental."}</p>
                    </div>
                    <div>
                      <label>Tiempo de respuesta</label>
                      <p><span className={`traffic ${perf.cls}`}>{perf.icon} {ms(r.elapsed_ms)} · {perf.label}</span></p>
                    </div>
                    <div>
                      <label>Origen de la respuesta</label>
                      <p>{sourceLabel(r.source)}{r.normative_id ? ` · Normativa ${r.normative_id}` : ""}</p>
                    </div>
                    <div>
                      <label>Estado del caso</label>
                      <p><StatusPill value={r.status} /></p>
                    </div>
                  </div>

                  <div className="answerBox">
                    <label>Respuesta dada</label>
                    <p>{answer || (r.category === "INTEGRITY" ? "Este caso valida la integridad del documento y no genera una respuesta al usuario." : "No se registró texto de respuesta.")}</p>
                  </div>

                  {breakdown?.applicable ? (
                    <div className="qualityBreakdown">
                      {[
                        ["Corrección", breakdown.correctness],
                        ["Fuente", breakdown.source],
                        ["Contexto", breakdown.context],
                        ["Concisión", breakdown.concision],
                        ["Seguridad", breakdown.safety],
                        ["Performance", breakdown.performance],
                      ].map(([label, value]) => (
                        <div key={label}>
                          <span>{label}</span>
                          <div className="miniTrack"><i style={{ width: `${Number(value || 0)}%` }} /></div>
                          <b>{Number(value || 0)}</b>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {r.failure_reason ? <div className="reasonBox"><b>Observación:</b> {r.failure_reason}</div> : null}
                </div>
              ) : null}
            </div>
          );
        }) : <div className="emptyList">Sin resultados.</div>}
      </div>
      <Pager pagination={pagination} onPage={onPage} />
    </>
  );
}

function RunsTable({ runs = [] }) {
  return (
    <div className="simpleTableWrap">
      <table className="simpleTable">
        <thead>
          <tr>
            <th>Fecha</th><th>Tipo</th><th>Casos</th><th>Aprobados</th><th>Atención</th><th>Fallos</th><th>P95</th><th>Calidad</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td>{dt(r.started_at)}</td>
              <td>{suiteLabel(r.suite)}</td>
              <td>{r.total_cases}</td>
              <td>{r.passed}</td>
              <td>{r.warnings}</td>
              <td>{r.failed}</td>
              <td>{ms(r.p95_ms)}</td>
              <td>{r.avg_quality == null ? "—" : `${Number(r.avg_quality).toFixed(0)}/100`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionNav({ value, onChange, items }) {
  return (
    <nav className="sectionNav">
      {items.map(([key, label, icon]) => (
        <button key={key} className={value === key ? "active" : ""} onClick={() => onChange(key)}>
          <span>{icon}</span>{label}
        </button>
      ))}
    </nav>
  );
}

export default function EstadisticasIA() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [main, setMain] = useState("qa");
  const [qaTab, setQaTab] = useState("runs");
  const [pilotTab, setPilotTab] = useState("queries");
  const [qaPageByTab, setQaPageByTab] = useState({ runs: 1, normatives: 1, images: 1, failures: 1 });
  const [qaSocialWorkId, setQaSocialWorkId] = useState("");
  const [qaCache, setQaCache] = useState({});
  const [pilotCache, setPilotCache] = useState({});
  const [openai, setOpenai] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem("gdpsoft_user") || "null");
      if (!u?.id || u?.is_super_admin !== true) {
        router.replace("/admin");
        return;
      }
      setProfile(u);
    } catch {
      router.replace("/admin");
    }
  }, [router]);

  const fetchQa = useCallback(async (tab = "runs", page = 1, socialWorkId = "") => {
    if (!profile?.id) return null;

    const suite =
      tab === "images" ? "IMAGE" :
      tab === "normatives" ? "NORMATIVE" :
      "";

    const status = tab === "failures" ? "FAIL" : "";
    const category = tab === "normatives" ? "RESPONSE" : "";

    const sw = tab === "normatives" ? String(socialWorkId || "") : "";
    const key = `${tab}:${page}:${sw || "all"}`;

    const url =
      `/api/admin/qa/dashboard?profileId=${profile.id}` +
      `&page=${page}&pageSize=${PAGE_SIZE}` +
      `${suite ? `&suite=${suite}` : ""}` +
      `${status ? `&status=${status}` : ""}` +
      `${category ? `&category=${category}` : ""}` +
      `${sw ? `&socialWorkId=${encodeURIComponent(sw)}` : ""}`;

    const r = await fetch(url, { cache: "no-store", headers: {Authorization: `Bearer ${sessionStorage.getItem("gdpsoft_access_token") || ""}`} });
    const j = await r.json();

    if (!r.ok || !j.ok) throw new Error(j.error || "Error QA");

    setQaCache((prev) => ({ ...prev, [key]: j }));
    return j;
  }, [profile?.id]);

  const fetchPilot = useCallback(async (tab = "queries", page = 1) => {
    if (!profile?.id) return null;
    const r = await fetch(`/api/admin/pilot/dashboard?profileId=${profile.id}&section=${tab}&page=${page}&pageSize=${PAGE_SIZE}`, { cache: "no-store", headers: {Authorization: `Bearer ${sessionStorage.getItem("gdpsoft_access_token") || ""}`} });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || "Error piloto");
    setPilotCache((prev) => ({ ...prev, [`${tab}:${page}`]: j }));
    return j;
  }, [profile?.id]);

  const fetchOpenAI = useCallback(async () => {
    if (!profile?.id) return null;
    const r = await fetch(`/api/admin/openai-usage?days=7`, { cache: "no-store", headers: {Authorization: `Bearer ${sessionStorage.getItem("gdpsoft_access_token") || ""}`} });
    const j = await r.json();
    if (!r.ok || !j.ok) throw new Error(j.error || "Error OpenAI");
    setOpenai(j);
    return j;
  }, [profile?.id]);

  useEffect(() => {
    if (!profile?.id) return;
    let alive = true;
    (async () => {
      try {
        // Precarga en paralelo: los menús quedan instantáneos.
        await Promise.allSettled([
          fetchQa("runs", 1, ""),
          fetchQa("normatives", 1, ""),
          fetchQa("images", 1, ""),
          fetchQa("failures", 1, ""),
          fetchPilot("queries", 1),
          fetchPilot("images", 1),
          fetchPilot("bugs", 1),
          fetchPilot("performance", 1),
          fetchOpenAI(),
        ]);
      } catch (e) {
        if (alive) setError(e.message);
      }
    })();
    return () => { alive = false; };
  }, [profile?.id, fetchQa, fetchPilot, fetchOpenAI]);

  const currentQaPage = qaPageByTab[qaTab] || 1;
  const qaKey = `${qaTab}:${currentQaPage}:${qaTab === "normatives" ? (qaSocialWorkId || "all") : "all"}`;
  const qa = qaCache[qaKey] || qaCache["runs:1:all"] || null;
  const currentQa = qaCache[qaKey] || (qaTab === "normatives" ? qaCache["normatives:1:all"] : null) || null;
  const pilot = pilotCache[`${pilotTab}:1`] || pilotCache["queries:1"] || null;
  const last = qaCache["runs:1:all"]?.active_run || qaCache["runs:1:all"]?.latest_run || null;

  const qaRowsForCharts = useMemo(() => {
    const candidates = [
      ...(qaCache["normatives:1:all"]?.results || []),
      ...(qaCache["images:1:all"]?.results || []),
    ];
    return candidates;
  }, [qaCache]);

  const refreshAll = useCallback(async () => {
    if (!profile?.id || refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      await Promise.allSettled([
        fetchQa("runs", 1, ""),
        fetchQa("normatives", 1, ""),
        fetchQa("images", 1, ""),
        fetchQa("failures", 1, ""),
        fetchPilot("queries", 1),
        fetchPilot("images", 1),
        fetchPilot("bugs", 1),
        fetchPilot("performance", 1),
        fetchOpenAI(),
      ]);
    } catch (e) {
      setError(e.message);
    } finally {
      setRefreshing(false);
    }
  }, [profile?.id, refreshing, fetchQa, fetchPilot, fetchOpenAI]);

  async function qaPage(page) {
    const sw = qaTab === "normatives" ? qaSocialWorkId : "";
    const key = `${qaTab}:${page}:${sw || "all"}`;

    setQaPageByTab((prev) => ({ ...prev, [qaTab]: page }));

    if (!qaCache[key]) {
      try {
        await fetchQa(qaTab, page, sw);
      } catch (e) {
        setError(e.message);
      }
    }
  }

  async function changeQaSocialWork(value) {
    const sw = String(value || "");
    setQaSocialWorkId(sw);
    setQaPageByTab((prev) => ({ ...prev, normatives: 1 }));

    const key = `normatives:1:${sw || "all"}`;
    if (!qaCache[key]) {
      try {
        await fetchQa("normatives", 1, sw);
      } catch (e) {
        setError(e.message);
      }
    }
  }

  async function pilotPage(page) {
    const key = `${pilotTab}:${page}`;
    if (!pilotCache[key]) {
      try { await fetchPilot(pilotTab, page); } catch (e) { setError(e.message); }
    }
  }

  if (!profile) return <main className="shell" />;

  return (
    <main className="shell">
      <div className="container">
        <header className="pageHeader">
          <div>
            <div className="eyebrow">SUPER ADMIN</div>
            <p>Control simple de calidad, performance y uso real de GDPSoft.</p>
          </div>
          <button className={`refreshBtn ${refreshing ? "rotating" : ""}`} onClick={refreshAll}>
            <span>↻</span> Actualizar
          </button>
        </header>

        <SectionNav
          value={main}
          onChange={setMain}
          items={[
            ["qa", "QA interno", "🧪"],
            ["pilot", "Piloto cliente", "👥"],
            ["openai", "OpenAI", "🤖"],
          ]}
        />

        {error ? <div className="errorBox">{error}</div> : null}

        {main === "qa" ? (
          <>
            <section className="sectionIntro">
              <div>
                <strong>QA interno</strong>
                <span>Pruebas automáticas separadas del uso real del cliente.</span>
              </div>
              <span className="runMeta">{last ? `${suiteLabel(last.suite)} · ${dt(last.started_at)}` : "Sin corridas todavía"}</span>
            </section>

            <section className="summaryGrid">
              <StatCard label="Casos" value={last?.total_cases || 0} />
              <StatCard label="Aprobados" value={last?.passed || 0} />
              <StatCard label="Atención" value={last?.warnings || 0} />
              <StatCard label="Fallos" value={last?.failed || 0} />
              <StatCard label="Promedio" value={ms(last?.avg_ms)} />
              <StatCard label="P95" value={ms(last?.p95_ms)} />
              <StatCard label="Calidad" value={last?.avg_quality == null ? "—" : `${Number(last.avg_quality).toFixed(0)}/100`} accent />
            </section>

            <section className="chartsGrid">
              <DonutChart value={last?.avg_quality || 0} />
              <StatusBars run={last} />
              <TrendChart runs={qaCache["runs:1:all"]?.runs || []} />
              <RouteChart rows={qaRowsForCharts} />
            </section>

            <SectionNav
              value={qaTab}
              onChange={async (tab) => {
                setQaTab(tab);
                const page = qaPageByTab[tab] || 1;
                const sw = tab === "normatives" ? qaSocialWorkId : "";
                const key = `${tab}:${page}:${sw || "all"}`;
                if (!qaCache[key]) {
                  try { await fetchQa(tab, page, sw); } catch (e) { setError(e.message); }
                }
              }}
              items={[
                ["runs", "Corridas", "📋"],
                ["normatives", "Normativas", "📄"],
                ["images", "Imágenes", "🖼️"],
                ["failures", "Fallos", "⚠️"],
              ]}
            />

            {qaTab === "normatives" ? (
              <>
                <div className="qaFilterBar">
                  <div>
                    <label>Obra social</label>
                    <select value={qaSocialWorkId} onChange={(e) => changeQaSocialWork(e.target.value)}>
                      <option value="">Todas las obras sociales</option>
                      {(currentQa?.social_works || qaCache["normatives:1:all"]?.social_works || []).map((sw) => (
                        <option key={sw.id} value={sw.id}>{sw.name}</option>
                      ))}
                    </select>
                  </div>
                  <span>
                    {qaSocialWorkId
                      ? "Mostrando únicamente las consultas de la obra social elegida."
                      : "Elegí una obra social para revisar sus preguntas sin mezclarlas."}
                  </span>
                </div>

                {qaSocialWorkId && currentQa?.social_work_summary ? (
                  <div className="oossSummaryGrid">
                    <div><span>Consultas</span><b>{currentQa.social_work_summary.total}</b></div>
                    <div><span>Aprobadas</span><b>{currentQa.social_work_summary.passed}</b></div>
                    <div><span>Atención</span><b>{currentQa.social_work_summary.warnings}</b></div>
                    <div><span>Fallos</span><b>{currentQa.social_work_summary.failed}</b></div>
                    <div><span>Promedio</span><b>{ms(currentQa.social_work_summary.avg_ms)}</b></div>
                    <div><span>Calidad</span><b>{currentQa.social_work_summary.avg_quality == null ? "—" : `${Number(currentQa.social_work_summary.avg_quality).toFixed(0)}/100`}</b></div>
                  </div>
                ) : null}
              </>
            ) : null}

            {qaTab === "runs" ? (
              <RunsTable runs={qaCache["runs:1:all"]?.runs || []} />
            ) : (
              <QaRows
                rows={currentQa?.results || []}
                pagination={currentQa?.pagination}
                onPage={qaPage}
              />
            )}
          </>
        ) : null}

        {main === "pilot" ? (
          <>
            <section className="sectionIntro">
              <div>
                <strong>Piloto cliente</strong>
                <span>Solo uso real marcado como PILOT. Hasta iniciar el piloto debe permanecer en cero.</span>
              </div>
              <span className="liveDot">● Uso real</span>
            </section>

            <section className="summaryGrid">
              <StatCard label="Consultas" value={pilot?.kpis?.queries || 0} />
              <StatCard label="Imágenes" value={pilot?.kpis?.images || 0} />
              <StatCard label="Bugs" value={pilot?.kpis?.bugs || 0} />
              <StatCard label="Promedio" value={ms(pilot?.kpis?.avg_ms)} />
              <StatCard label="P95" value={ms(pilot?.kpis?.p95_ms)} />
            </section>

            <section className="chartsGrid">
              <MiniBarChart title="Actividad" subtitle="Consultas e imágenes" items={[
                { label: "Consultas", value: pilot?.kpis?.queries || 0 },
                { label: "Imágenes", value: pilot?.kpis?.images || 0 },
              ]} />
              <MiniBarChart title="Incidencias" subtitle="Bugs detectados" items={[
                { label: "Bugs", value: pilot?.kpis?.bugs || 0 },
                { label: "Sin bug", value: Math.max(0, Number(pilot?.kpis?.queries || 0) - Number(pilot?.kpis?.bugs || 0)) },
              ]} />
              <DonutChart value={pilot?.kpis?.queries ? Math.max(0, 100 - ((pilot?.kpis?.bugs || 0) / pilot.kpis.queries) * 100) : 0} label="Estabilidad" suffix="%" />
              <MiniBarChart title="Performance" subtitle="Tiempo en milisegundos" items={[
                { label: "Promedio", value: Math.round(pilot?.kpis?.avg_ms || 0) },
                { label: "P95", value: Math.round(pilot?.kpis?.p95_ms || 0) },
              ]} />
            </section>

            <SectionNav
              value={pilotTab}
              onChange={setPilotTab}
              items={[
                ["queries", "Consultas", "💬"],
                ["images", "Imágenes", "🖼️"],
                ["bugs", "Bugs", "🐞"],
                ["performance", "Performance", "⚡"],
              ]}
            />

            <div className="simpleTableWrap">
              <table className="simpleTable">
                <thead>
                  <tr>
                    {pilotTab === "bugs"
                      ? ["Fecha", "Tipo", "Severidad", "Mensaje"].map((x) => <th key={x}>{x}</th>)
                      : ["Fecha", "Pregunta", "Ruta", "Origen", "OOSS", "Tiempo", "Error"].map((x) => <th key={x}>{x}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(pilot?.rows || []).length ? (pilot?.rows || []).map((r, i) => pilotTab === "bugs" ? (
                    <tr key={i}><td>{dt(r.created_at)}</td><td>{r.event_type}</td><td>{r.severity}</td><td>{r.message || "—"}</td></tr>
                  ) : (
                    <tr key={i}><td>{dt(r.created_at)}</td><td>{r.question || "—"}</td><td>{routeLabel(r.route)}</td><td>{sourceLabel(r.source)}</td><td>{r.social_work_id || "—"}</td><td>{ms(r.elapsed_ms)}</td><td>{r.error_code || "—"}</td></tr>
                  )) : <tr><td colSpan={7} className="emptyCell">Todavía no hay actividad del piloto.</td></tr>}
                </tbody>
              </table>
            </div>
            <Pager pagination={pilot?.pagination} onPage={pilotPage} />
          </>
        ) : null}

        {main === "openai" ? (
          <>
            <section className="sectionIntro">
              <div>
                <strong>OpenAI</strong>
                <span>Consumo, costos y modelos de la cuenta conectada.</span>
              </div>
              <span className="runMeta">Últimos 7 días</span>
            </section>

            {!openai?.configured ? (
              <>
                <section className="summaryGrid">
                  <StatCard label="Costo real" value="—" />
                  <StatCard label="Requests" value="—" />
                  <StatCard label="Input" value="—" />
                  <StatCard label="Output" value="—" />
                </section>
                <section className="chartsGrid">
                  {["Costo por día", "Requests", "Tokens", "Modelos"].map((t) => (
                    <div className="chartCard" key={t}>
                      <div className="chartHead"><div><strong>{t}</strong><span>OpenAI Usage</span></div></div>
                      <EmptyChart text="Falta conectar OPENAI_ADMIN_KEY" />
                    </div>
                  ))}
                </section>
                <div className="infoPanel">
                  <strong>Falta conectar el Usage Dashboard</strong>
                  <p>Agregá <code>OPENAI_ADMIN_KEY</code> cuando el cliente te la entregue. La API key normal del bot no sirve para costos de organización.</p>
                </div>
              </>
            ) : (
              <>
                <section className="summaryGrid">
                  <StatCard label="Costo real" value={`US$ ${new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(openai.summary?.total_cost_usd || 0))}`} accent />
                  <StatCard label="Requests" value={compact(openai.summary?.requests)} />
                  <StatCard label="Tokens input" value={compact(openai.summary?.input_tokens)} />
                  <StatCard label="Tokens output" value={compact(openai.summary?.output_tokens)} />
                  <StatCard label="Modelo principal" value={openai.summary?.top_model || "—"} />
                </section>

                <section className="chartsGrid">
                  <MiniBarChart title="Requests por modelo" subtitle="Últimos 7 días" items={(openai.by_model || []).slice(0, 5).map((x) => ({ label: x.model, value: x.requests }))} />
                  <MiniBarChart title="Tokens de entrada" subtitle="Por modelo" items={(openai.by_model || []).slice(0, 5).map((x) => ({ label: x.model, value: x.input_tokens }))} />
                  <MiniBarChart title="Tokens de salida" subtitle="Por modelo" items={(openai.by_model || []).slice(0, 5).map((x) => ({ label: x.model, value: x.output_tokens }))} />
                  <MiniBarChart title="Tokens totales" subtitle="Por modelo" items={(openai.by_model || []).slice(0, 5).map((x) => ({ label: x.model, value: x.total_tokens }))} />
                </section>

                <div className="simpleTableWrap">
                  <table className="simpleTable">
                    <thead><tr><th>Modelo</th><th>Requests</th><th>Input</th><th>Output</th><th>Total</th></tr></thead>
                    <tbody>
                      {(openai.by_model || []).map((r) => (
                        <tr key={r.model}>
                          <td>{r.model}</td><td>{compact(r.requests)}</td><td>{compact(r.input_tokens)}</td><td>{compact(r.output_tokens)}</td><td>{compact(r.total_tokens)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        ) : null}
      </div>

      <style jsx global>{`
        *{box-sizing:border-box}
        body{margin:0;background:#faf8fc}
        button{font:inherit}
        .shell{min-height:100vh;background:#faf8fc;color:#24182a;font-family:Arial,sans-serif;padding:26px clamp(18px,3vw,46px) 50px}
        .container{max-width:1500px;margin:0 auto}
        .pageHeader{display:flex;justify-content:space-between;gap:20px;align-items:center;margin-bottom:18px}
        .eyebrow{font-size:12px;font-weight:900;letter-spacing:.09em;color:${V}}
        .pageHeader h1{font-size:28px;line-height:1.1;margin:7px 0 5px;font-weight:500}
        .pageHeader p{margin:0;color:#776b7e;font-size:14px}
        .refreshBtn{border:0;border-radius:11px;padding:11px 15px;background:${V};color:#fff;font-weight:800;cursor:pointer;display:flex;gap:7px;align-items:center}
        .refreshBtn span{font-size:18px;line-height:1}
        .refreshBtn.rotating span{animation:spin .8s linear infinite}
        @keyframes spin{to{transform:rotate(360deg)}}

        .sectionNav{display:flex;gap:28px;align-items:center;border-bottom:1px solid #e7dce9;margin-bottom:24px;padding:0 12px;overflow-x:auto;scrollbar-width:none}
        .sectionNav::-webkit-scrollbar{display:none}
        .sectionNav button{white-space:nowrap;border:0;background:transparent;color:#6b5d71;padding:12px 5px 13px;font-size:14px;cursor:pointer;border-bottom:2px solid transparent;display:flex;gap:8px;align-items:center}
        .sectionNav button.active{color:${V};border-bottom-color:${V};font-weight:800}
        .sectionNav button span{font-size:16px}

        .sectionIntro{background:#f4edf6;border:1px solid #ead9ee;border-radius:13px;padding:14px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:16px}
        .sectionIntro>div{display:flex;flex-direction:column;gap:3px}
        .sectionIntro strong{color:${V};font-size:14px}
        .sectionIntro span{font-size:12px;color:#7c6c82}
        .runMeta,.liveDot{white-space:nowrap}
        .liveDot{color:#15945d!important;font-weight:800}

        .summaryGrid{display:grid;grid-template-columns:repeat(7,minmax(120px,1fr));gap:12px;margin-bottom:16px}
        .statCard{background:#fff;border:1px solid #e8e0ea;border-radius:15px;padding:14px 15px;min-height:93px;box-shadow:0 5px 18px rgba(66,36,72,.035)}
        .statCard.accent{border-color:#d8b5df;background:#fcf8fd}
        .statCard span{display:block;color:#817486;font-size:12px;margin-bottom:8px}
        .statCard strong{display:block;font-size:23px;line-height:1.1;color:#24182a}
        .statCard.accent strong{color:${V}}
        .statCard small{display:block;color:#a096a4;font-size:11px;margin-top:6px}

        .chartsGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:25px}
        .chartCard{background:#fff;border:1px solid #e8e0ea;border-radius:16px;min-height:230px;padding:16px;box-shadow:0 5px 18px rgba(66,36,72,.04);overflow:hidden}
        .chartHead{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}
        .chartHead strong{font-size:14px;color:#39273e}
        .chartHead span{display:block;font-size:11px;color:#9a8f9e;margin-top:3px}
        .emptyChart{height:155px;display:grid;place-items:center;color:#aaa0ae;font-size:12px;text-align:center}
        .donutWrap{display:flex;align-items:center;justify-content:center;gap:16px;height:165px}
        .donut{width:116px;height:116px;border-radius:50%;background:conic-gradient(${V} var(--value),#efe7f1 0);display:grid;place-items:center;flex:0 0 auto}
        .donutInner{width:80px;height:80px;border-radius:50%;background:#fff;display:grid;place-items:center;align-content:center}
        .donutInner b{font-size:24px}.donutInner span{font-size:10px;color:#918596}
        .chartNote{display:flex;flex-direction:column;gap:7px;color:#8c7e91;font-size:11px}
        .bars{display:flex;flex-direction:column;gap:13px;padding-top:8px}
        .barRow{display:grid;grid-template-columns:85px 1fr 28px;align-items:center;gap:8px;font-size:11px;color:#7a6d80}
        .barRow b{text-align:right;color:#443248}
        .barTrack{height:8px;background:#f0e9f2;border-radius:999px;overflow:hidden}
        .barTrack i{display:block;height:100%;background:${V};border-radius:999px;min-width:2px}
        .barTrack i.goodBar{background:#38a978}
        .barTrack i.warnBar{background:#d6a322}
        .barTrack i.badBar{background:#d65959}
        .compactBars .barRow{grid-template-columns:minmax(76px,110px) 1fr 34px}
        .svgChart{height:170px}
        .svgChart svg{width:100%;height:125px;overflow:visible}
        .axisLine{stroke:#eee6f0;stroke-width:1}
        .trendLine{fill:none;stroke:${V};stroke-width:2.5;vector-effect:non-scaling-stroke}
        .trendDot{fill:#fff;stroke:${V};stroke-width:1.8;vector-effect:non-scaling-stroke}
        .trendLegend{display:flex;justify-content:space-between;font-size:10px;color:#8e8193;margin-top:5px}

        .qaFilterBar{display:flex;align-items:end;justify-content:space-between;gap:16px;background:#fff;border:1px solid #e8e0ea;border-radius:14px;padding:12px 14px;margin:-8px 0 14px;box-shadow:0 5px 18px rgba(66,36,72,.025)}
        .qaFilterBar>div{display:flex;flex-direction:column;gap:5px;min-width:310px}
        .qaFilterBar label{font-size:10px;text-transform:uppercase;color:#8d8091;font-weight:800}
        .qaFilterBar select{height:38px;border:1px solid #dfd4e2;border-radius:9px;background:#fff;color:#3f3044;padding:0 11px;outline:none}
        .qaFilterBar select:focus{border-color:#8f2a85;box-shadow:0 0 0 3px rgba(143,42,133,.08)}
        .qaFilterBar>span{font-size:11px;color:#918497;padding-bottom:9px;text-align:right}
        .oossSummaryGrid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin:-2px 0 14px}
        .oossSummaryGrid>div{background:#fff;border:1px solid #e8e0ea;border-radius:12px;padding:10px 12px}
        .oossSummaryGrid span{display:block;font-size:10px;color:#8f8293;margin-bottom:5px}
        .oossSummaryGrid b{font-size:17px;color:#342439}
        .resultList{background:#fff;border:1px solid #e8e0ea;border-radius:16px;overflow:hidden;box-shadow:0 5px 18px rgba(66,36,72,.035)}
        .resultHeader,.resultRow{display:grid;grid-template-columns:minmax(280px,2.2fr) 110px 155px 145px 115px 95px 28px;gap:10px;align-items:center}
        .resultHeader{padding:11px 15px;background:#fbfafc;border-bottom:1px solid #eee7f0;color:#8b7e90;font-size:10px;text-transform:uppercase;font-weight:800}
        .resultItem{border-bottom:1px solid #f0eaf2}
        .resultItem:last-child{border-bottom:0}
        .resultRow{width:100%;border:0;background:#fff;padding:13px 15px;text-align:left;color:#4c3d51;cursor:pointer}
        .resultRow:hover{background:#fdfafd}
        .questionCell{display:flex;flex-direction:column;gap:4px;min-width:0}
        .questionCell b{font-size:12px;color:#342438;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .questionCell small{font-size:10px;color:#a195a5}
        .routeTag{font-size:11px;color:${V};font-weight:700}
        .chevron{font-size:18px;color:#918496;transition:.2s;display:inline-block}
        .chevron.up{transform:rotate(180deg)}
        .traffic{font-size:11px;font-weight:700;white-space:nowrap}
        .traffic.good{color:#16865a}.traffic.warn{color:#a77a12}.traffic.bad{color:#b93c3c}.traffic.neutral{color:#928797}
        .qualityTag,.pill{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:4px 8px;font-size:10px;font-weight:800;white-space:nowrap}
        .qualityTag.good,.pill.good{background:#eaf8f1;color:#177851}
        .qualityTag.warn,.pill.warn{background:#fff6df;color:#9c7212}
        .qualityTag.bad,.pill.bad{background:#fdecec;color:#b33f3f}
        .qualityTag.neutral,.pill.neutral{background:#f2eef3;color:#847989}

        .resultDetail{background:#fbf8fc;border-top:1px solid #eee6f0;padding:16px 18px 18px}
        .detailGrid{display:grid;grid-template-columns:2fr 1fr 1.5fr 1fr;gap:14px;margin-bottom:14px}
        .detailGrid>div,.answerBox{background:#fff;border:1px solid #eee6f0;border-radius:11px;padding:12px}
        .detailGrid label,.answerBox label{font-size:10px;text-transform:uppercase;color:#978a9b;font-weight:800}
        .detailGrid p,.answerBox p{margin:7px 0 0;font-size:12px;line-height:1.55;color:#413246}
        .answerBox p{white-space:pre-wrap}
        .qualityBreakdown{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-top:12px}
        .qualityBreakdown>div{background:#fff;border:1px solid #eee6f0;border-radius:10px;padding:10px;display:grid;grid-template-columns:1fr 28px;gap:7px;align-items:center}
        .qualityBreakdown span{font-size:9px;color:#8c7f90}
        .qualityBreakdown b{font-size:11px;text-align:right}
        .miniTrack{grid-column:1 / -1;height:5px;background:#efe9f0;border-radius:999px;overflow:hidden}
        .miniTrack i{display:block;height:100%;background:${V};border-radius:999px}
        .reasonBox{margin-top:12px;background:#fff5de;border:1px solid #f1dfac;color:#765713;padding:10px 12px;border-radius:10px;font-size:11px}

        .simpleTableWrap{background:#fff;border:1px solid #e8e0ea;border-radius:16px;overflow:auto;box-shadow:0 5px 18px rgba(66,36,72,.035)}
        .simpleTable{width:100%;border-collapse:collapse;min-width:760px;font-size:12px}
        .simpleTable th{padding:11px 14px;text-align:left;background:#fbfafc;color:#8c7f91;font-size:10px;text-transform:uppercase;border-bottom:1px solid #eee7f0}
        .simpleTable td{padding:12px 14px;border-bottom:1px solid #f0eaf2;color:#493b4d}
        .simpleTable tbody tr:last-child td{border-bottom:0}
        .emptyCell{text-align:center!important;color:#a397a7!important;padding:30px!important}
        .emptyList{padding:32px;text-align:center;color:#9d92a1}

        .pager{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-top:12px;color:#817486;font-size:11px}
        .pager button{border:1px solid #dfd5e2;background:#fff;border-radius:9px;padding:8px 11px;color:#625369;cursor:pointer}
        .pager button:disabled{opacity:.35;cursor:not-allowed}
        .infoPanel{background:#fff;border:1px solid #e8e0ea;border-radius:16px;padding:18px;margin-top:16px}
        .infoPanel strong{color:${V}}.infoPanel p{margin:6px 0 0;color:#75697a;font-size:12px}
        .errorBox{background:#fdeeee;border:1px solid #f4d0d0;color:#a93c3c;border-radius:11px;padding:10px 12px;margin-bottom:14px;font-size:12px}

        @media(max-width:1180px){
          .summaryGrid{grid-template-columns:repeat(4,1fr)}
          .chartsGrid{grid-template-columns:repeat(2,1fr)}
          .resultHeader,.resultRow{grid-template-columns:minmax(230px,2fr) 100px 135px 130px 105px 85px 25px}
        }
        @media(max-width:800px){
          .shell{padding:18px 12px 40px}
          .pageHeader{align-items:flex-start}.pageHeader h1{font-size:24px}
          .pageHeader p{font-size:12px}
          .refreshBtn{padding:9px 11px;font-size:12px}
          .sectionNav{gap:18px;padding:0 4px}
          .sectionIntro{align-items:flex-start;flex-direction:column}
          .summaryGrid{grid-template-columns:repeat(2,1fr)}
          .chartsGrid{grid-template-columns:1fr}
          .resultHeader{display:none}
          .resultRow{grid-template-columns:1fr auto;gap:8px;padding:13px}
          .resultRow>span:nth-child(2),.resultRow>span:nth-child(3),.resultRow>span:nth-child(4){display:none}
          .resultRow>span:nth-child(5){grid-column:1}
          .resultRow>span:nth-child(6){grid-column:2;grid-row:2}
          .resultRow>span:nth-child(7){grid-column:2;grid-row:1}
          .questionCell b{white-space:normal}
          .qaFilterBar{flex-direction:column;align-items:stretch}.qaFilterBar>div{min-width:0}.qaFilterBar>span{text-align:left;padding:0}
          .oossSummaryGrid{grid-template-columns:repeat(2,1fr)}
          .detailGrid{grid-template-columns:1fr}
          .qualityBreakdown{grid-template-columns:repeat(2,1fr)}
          .pager{flex-wrap:wrap;justify-content:center}
          .donutWrap{justify-content:flex-start}
        }
        @media(max-width:480px){
          .pageHeader{flex-direction:column}
          .refreshBtn{align-self:flex-end;margin-top:-44px}
          .summaryGrid{grid-template-columns:repeat(2,minmax(0,1fr))}
          .statCard{min-height:82px}.statCard strong{font-size:20px}
          .qualityBreakdown{grid-template-columns:1fr}
          .donutWrap{gap:10px}.chartNote{font-size:10px}
        }
      `}</style>
    </main>
  );
}

// Helpers puros para la pantalla de Preguntas Frecuentes de sucursal.

export const FAQ_PAGE_SIZE = 8;
export const FAQ_TOP_COUNT = 3;

export function faqPopularity(faq) {
  const detected = Number(faq?.detected_count) || 0;
  const used = Number(faq?.usage_count) || 0;
  return Math.max(detected, used);
}

export function faqSocialWorkName(faq, socialWorks = []) {
  const id = faq?.social_work_id ?? faq?.socialWorkId;
  const found = socialWorks.find((item) => String(item.id) === String(id));
  return (
    faq?.social_work_name ||
    faq?.socialWork?.name ||
    faq?.social_works?.name ||
    found?.name ||
    null
  );
}

export function sortFaqsByPopularity(faqs = []) {
  return [...faqs].sort((a, b) => {
    const diff = faqPopularity(b) - faqPopularity(a);
    if (diff !== 0) return diff;
    return String(a?.question || "").localeCompare(String(b?.question || ""), "es");
  });
}

export function filterFaqs(faqs = [], { search = "", socialWorkId = "", socialWorks = [] } = {}) {
  const q = String(search || "").trim().toLowerCase();
  return faqs.filter((faq) => {
    if (socialWorkId) {
      const id = String(faq.social_work_id ?? faq.socialWorkId ?? "");
      if (id !== String(socialWorkId)) return false;
    }
    if (!q) return true;
    const hay = [faq.question, faq.answer, faqSocialWorkName(faq, socialWorks)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

// Devuelve { top, pageItems, total, totalPages, page, from, to }.
// "Más consultadas" solo se muestra en la página 1 y sin búsqueda activa.
export function buildFaqPage(sorted = [], { page = 1, pageSize = FAQ_PAGE_SIZE, showTop = true } = {}) {
  const topCandidates = showTop
    ? sorted.filter((faq) => faqPopularity(faq) > 0).slice(0, FAQ_TOP_COUNT)
    : [];
  const topIds = new Set(topCandidates.map((faq) => faq.id));
  const rest = sorted.filter((faq) => !topIds.has(faq.id));
  const totalPages = Math.max(1, Math.ceil(rest.length / pageSize));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (safePage - 1) * pageSize;
  const pageItems = rest.slice(start, start + pageSize);
  return {
    top: safePage === 1 ? topCandidates : [],
    pageItems,
    total: sorted.length,
    totalPages,
    page: safePage,
    from: rest.length === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, rest.length),
    restTotal: rest.length,
  };
}

export function pageNumbers(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const set = new Set([1, totalPages, page - 1, page, page + 1]);
  const list = [...set].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out = [];
  list.forEach((n, i) => {
    if (i > 0 && n - list[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

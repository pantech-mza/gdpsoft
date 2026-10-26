"use client";

import { useMemo, useState } from "react";
import { Icon } from "@iconify/react";
import {
  parseAssistantMessage,
  isStructuredAssistantMessage,
  classifyStepIcon,
} from "../../lib/assistant/format-message.mjs";
import { parseRequirementsMessage } from "../../lib/assistant/requirements-view.mjs";
import { splitWithValidators } from "../../lib/assistant/validator-links.mjs";

// Texto con enlaces clickeables (solo http/https; React escapa el contenido, nunca se inserta HTML).
function Linkified({ text }) {
  return splitWithValidators(text).map((part, index) =>
    part.type === "link"
      ? <a key={index} href={part.href} target="_blank" rel="noopener noreferrer" className="break-words font-semibold text-[#8f2a85] underline">{part.label || part.value}</a>
      : <span key={index}>{part.value}</span>
  );
}

function InlineEmphasis({ text }) {
  // Markdown básico seguro: React escapa el contenido, nunca se inserta HTML.
  return String(text || "")
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={index} className="font-semibold text-zinc-900">{part.slice(2, -2)}</strong>
        : <Linkified key={index} text={part} />
    );
}

function RequirementsTabs({ view }) {
  const [active, setActive] = useState(0);
  const section = view.sections[Math.min(active, view.sections.length - 1)];
  return (
    <div className="min-w-0 text-[14px] leading-[1.5] text-zinc-700">
      <div className="mb-2 px-1 text-[15px] font-extrabold text-[#20132d]">
        {view.title}{view.circuit ? ` · ${view.circuit}` : ""}
      </div>
      {view.sections.length > 1 && (
        <div role="tablist" className="mb-3 flex flex-wrap gap-1 rounded-xl bg-[#f3f0f7] p-1">
          {view.sections.map((item, index) => (
            <button key={item.title} type="button" role="tab" aria-selected={index === active}
              onClick={() => setActive(index)}
              className={`flex-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] font-bold ${index === active ? "bg-white text-[#8f2a85] shadow-sm" : "text-zinc-500"}`}>
              {item.title}
            </button>
          ))}
        </div>
      )}
      {active === 0 && view.intro && <p className="mb-3 px-1 text-[13px] text-zinc-500">{view.intro}</p>}
      {active === 0 && view.ficha.length > 0 && (
        <div className="mb-3 grid grid-cols-2 gap-2">
          {view.ficha.map((cell) => (
            <div key={cell.label} className="rounded-xl border border-[#eee8f3] bg-[#faf9fc] px-2.5 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-400">{cell.label}</div>
              <div className="font-bold text-zinc-900">{cell.value}</div>
            </div>
          ))}
        </div>
      )}
      <ul className="divide-y divide-[#f1edf5]">
        {section.items.map((item, index) => (
          <li key={index} className="flex items-start gap-2 py-1.5">
            <Icon icon="fluent:checkmark-circle-20-regular" className="mt-0.5 shrink-0 text-[#2e9d6a]" width={17} aria-hidden="true" />
            <span className="min-w-0 break-words">{item}</span>
          </li>
        ))}
      </ul>
      {active === 0 && view.alerts.map((alert, index) => (
        <div key={index} role="note" className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950">
          <Icon icon="fluent:warning-20-regular" className="mt-0.5 shrink-0 text-amber-700" width={18} aria-hidden="true" />
          <span className="break-words font-semibold">{alert}</span>
        </div>
      ))}
      {(view.source || view.notice) && (
        <p className="mt-3 px-1 text-[11px] text-zinc-400">
          {view.source ? `Fuente: ${view.source}. ` : ""}{view.notice ? view.notice.charAt(0).toUpperCase() + view.notice.slice(1) : ""}
        </p>
      )}
    </div>
  );
}

export default function AssistantRichMessage({ text }) {
  const requirements = useMemo(() => parseRequirementsMessage(text), [text]);
  const blocks = useMemo(() => parseAssistantMessage(text), [text]);
  const structured = isStructuredAssistantMessage(blocks);
  const stepsCount = blocks.filter(block => block.type === "step").length;

  if (requirements) return <RequirementsTabs view={requirements} />;

  if (!structured) {
    return <div className="whitespace-pre-wrap break-words"><Linkified text={text} /></div>;
  }

  return (
    <div className="min-w-0 space-y-2.5 text-[14.5px] leading-[1.55] text-zinc-700">
      {stepsCount > 0 && (
        <div className="mb-2 flex items-center gap-2 px-1.5 text-[11px] font-semibold tracking-[0.02em] text-[#8f2a85]">
          <Icon icon="fluent:clipboard-task-list-20-regular" width={16} aria-hidden="true" />
          <span>Procedimiento · {stepsCount} {stepsCount === 1 ? "paso" : "pasos"}</span>
        </div>
      )}
      {blocks.map((block, index) => {
        if (block.type === "step") {
          const caution = /^(?:\*\*)?(?:no\s|nunca\s|detener\s)/iu.test(block.text)
            || /\bno (?:forzar|dispensar|continuar)\b/iu.test(block.text);
          return (
            <div key={index} className={`flex items-start gap-2.5 rounded-xl border px-2.5 py-3 shadow-[0_1px_2px_rgba(30,20,45,.025)] ${caution ? "border-amber-200 bg-amber-50/70" : "border-[#e9dce9] bg-white"}`}>
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-bold tabular-nums ${caution ? "bg-amber-100 text-amber-800" : "bg-[#f5e8f5] text-[#8f2a85]"}`} aria-label={`Paso ${block.number}`}>
                {block.number}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide ${caution ? "text-amber-800" : "text-[#8f2a85]"}`}>
                  <Icon icon={classifyStepIcon(block.text)} width={15} aria-hidden="true" />
                  <span>Paso {block.number}</span>
                </div>
                <div className="whitespace-pre-line break-words"><InlineEmphasis text={block.text}/></div>
              </div>
            </div>
          );
        }
        if (block.type === "bullet") {
          return (
            <div key={index} className="flex items-start gap-2 rounded-lg border border-zinc-100 bg-white px-2.5 py-2.5">
              <Icon icon="fluent:checkmark-circle-20-regular" className="mt-0.5 shrink-0 text-[#6b9f22]" width={17} aria-hidden="true" />
              <div className="min-w-0 whitespace-pre-line break-words"><InlineEmphasis text={block.text}/></div>
            </div>
          );
        }
        if (block.type === "warning") {
          return (
            <div key={index} role="note" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-950">
              <Icon icon="fluent:warning-20-regular" className="mt-0.5 shrink-0 text-amber-700" width={19} aria-hidden="true" />
              <div className="min-w-0 whitespace-pre-line break-words">
                <strong className="block text-[12px]">{block.title}</strong>
                <InlineEmphasis text={block.text}/>
              </div>
            </div>
          );
        }
        if (block.type === "heading") {
          return <h4 key={index} className="pt-1 text-[13px] font-bold text-[#63245e]">{block.text}</h4>;
        }
        return <p key={index} className="whitespace-pre-line break-words px-1"><InlineEmphasis text={block.text}/></p>;
      })}
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { Icon } from "@iconify/react";
import {
  parseAssistantMessage,
  isStructuredAssistantMessage,
  classifyStepIcon,
} from "../../lib/assistant/format-message.mjs";

function InlineEmphasis({ text }) {
  // Markdown básico seguro: React escapa el contenido, nunca se inserta HTML.
  return String(text || "")
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, index) =>
      part.startsWith("**") && part.endsWith("**")
        ? <strong key={index} className="font-semibold text-zinc-900">{part.slice(2, -2)}</strong>
        : <span key={index}>{part}</span>
    );
}

export default function AssistantRichMessage({ text }) {
  const blocks = useMemo(() => parseAssistantMessage(text), [text]);
  const structured = isStructuredAssistantMessage(blocks);
  const stepsCount = blocks.filter(block => block.type === "step").length;

  if (!structured) {
    return <div className="whitespace-pre-wrap break-words">{text}</div>;
  }

  return (
    <div className="min-w-0 space-y-2.5 text-[13px] leading-[1.55] text-zinc-700">
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

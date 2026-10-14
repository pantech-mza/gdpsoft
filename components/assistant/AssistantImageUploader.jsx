"use client";

import {
  useRef,
  useState,
} from "react";

import {
  Icon,
} from "@iconify/react";

export default function AssistantImageUploader({
  conversationId,
  ensureConversation,
  disabled = false,
  onUploaded,
}) {
  const [
    menuOpen,
    setMenuOpen,
  ] = useState(false);

  const [
    uploading,
    setUploading,
  ] = useState(false);

  const cameraInputRef =
    useRef(null);

  const galleryInputRef =
    useRef(null);

  // =========================================================
  // SUBIR IMAGEN
  // =========================================================

  async function uploadFile(
    file
  ) {
    if (
      !file ||
      uploading ||
      disabled
    ) {
      return;
    }

    setUploading(true);
    setMenuOpen(false);

    try {
      let currentConversationId =
        conversationId;

      // =====================================================
      // ASEGURAR CONVERSACIÓN
      // =====================================================

      if (
        !currentConversationId
      ) {
        if (
          typeof ensureConversation !==
          "function"
        ) {
          throw new Error(
            "No se puede iniciar la conversación."
          );
        }

        currentConversationId =
          await ensureConversation();
      }

      if (
        !currentConversationId
      ) {
        throw new Error(
          "No se pudo iniciar la conversación."
        );
      }

      // =====================================================
      // FORM DATA
      // =====================================================

      const formData =
        new FormData();

      formData.append(
        "file",
        file
      );

      // =====================================================
      // UPLOAD
      // =====================================================

      const response =
        await fetch(
          `/api/conversations/${currentConversationId}/images`,
          {
            method:
              "POST",

            body:
              formData,
          }
        );

      let data;

      try {
        data =
          await response.json();
      } catch {
        throw new Error(
          "El servidor devolvió una respuesta inválida."
        );
      }

      if (
        !response.ok ||
        data?.ok === false
      ) {
        throw new Error(
          data?.error ||
            "No se pudo subir la imagen."
        );
      }

      // =====================================================
      // CALLBACK
      // =====================================================

      if (
        typeof onUploaded ===
        "function"
      ) {
        onUploaded(
          data.image,
          data
        );
      }
    } catch (error) {
      console.error(
        "AssistantImageUploader:",
        error
      );

      alert(
        error?.message ||
          "No se pudo subir la imagen."
      );
    } finally {
      setUploading(false);

      /*
       * Permitimos volver a seleccionar
       * el mismo archivo.
       */

      if (
        cameraInputRef.current
      ) {
        cameraInputRef.current.value =
          "";
      }

      if (
        galleryInputRef.current
      ) {
        galleryInputRef.current.value =
          "";
      }
    }
  }

  // =========================================================
  // UI
  // =========================================================

  return (
    <div className="relative">

      {/* =================================================== */}
      {/* INPUT CÁMARA */}
      {/* =================================================== */}

      <input
        ref={
          cameraInputRef
        }
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(event) => {
          const file =
            event.target
              .files?.[0];

          if (file) {
            uploadFile(
              file
            );
          }
        }}
      />

      {/* =================================================== */}
      {/* INPUT GALERÍA */}
      {/* =================================================== */}

      <input
        ref={
          galleryInputRef
        }
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(event) => {
          const file =
            event.target
              .files?.[0];

          if (file) {
            uploadFile(
              file
            );
          }
        }}
      />

      {/* =================================================== */}
      {/* MENÚ */}
      {/* =================================================== */}

      {menuOpen && (
        <div className="absolute bottom-[52px] left-0 z-30 w-[190px] overflow-hidden rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl">

          {/* SACAR FOTO */}

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);

              cameraInputRef
                .current
                ?.click();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-700 transition hover:bg-[#8f2a85]/5 hover:text-[#8f2a85]"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#8f2a85]/10 text-[#8f2a85]">
              <Icon
                icon="fluent:camera-24-filled"
                width="19"
                height="19"
              />
            </div>

            <span className="font-medium">
              Sacar foto
            </span>
          </button>

          {/* ELEGIR IMAGEN */}

          <button
            type="button"
            onClick={() => {
              setMenuOpen(false);

              galleryInputRef
                .current
                ?.click();
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-zinc-700 transition hover:bg-[#8f2a85]/5 hover:text-[#8f2a85]"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#8f2a85]/10 text-[#8f2a85]">
              <Icon
                icon="fluent:image-24-filled"
                width="19"
                height="19"
              />
            </div>

            <span className="font-medium">
              Elegir imagen
            </span>
          </button>

        </div>
      )}

      {/* =================================================== */}
      {/* BOTÓN PRINCIPAL CÁMARA */}
      {/* =================================================== */}

      <button
        type="button"
        title={
          uploading
            ? "Subiendo imagen..."
            : "Adjuntar foto"
        }
        aria-label="Adjuntar foto"
        disabled={
          disabled ||
          uploading
        }
        onClick={() =>
          setMenuOpen(
            (current) =>
              !current
          )
        }
        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-xl border border-zinc-200 bg-white text-[#8f2a85] transition hover:border-[#8f2a85]/40 hover:bg-[#8f2a85]/5 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {uploading ? (
          <Icon
            icon="svg-spinners:ring-resize"
            width="21"
            height="21"
          />
        ) : (
          <Icon
            icon="fluent:camera-add-24-filled"
            width="22"
            height="22"
          />
        )}
      </button>

    </div>
  );
}
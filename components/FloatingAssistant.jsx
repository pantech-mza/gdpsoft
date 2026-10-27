"use client";

import Image from "next/image";

import AssistantImageUploader from "./assistant/AssistantImageUploader";
import AssistantRichMessage from "./assistant/AssistantRichMessage";

import {
  shouldUseActiveImage,
} from "../lib/assistant/imageRouting";

import { refreshStoredSession } from "../lib/client/session";

import { interpretPrescriptionContextReply } from "../lib/assistant/recipe-context-clarification.mjs";

import {
  useEffect,
  useRef,
  useState,
} from "react";

export default function FloatingAssistant() {
  const [
    open,
    setOpen,
  ] =
    useState(false);

  const [
    question,
    setQuestion,
  ] =
    useState("");

  const [
    messages,
    setMessages,
  ] =
    useState([]);

  const [
    loading,
    setLoading,
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    conversationId,
    setConversationId,
  ] =
    useState(null);

  const [
    activeSocialWork,
    setActiveSocialWork,
  ] =
    useState(null);

  const [
    activePlan,
    setActivePlan,
  ] =
    useState(null);

  const [
    activeImage,
    setActiveImage,
  ] =
    useState(null);

  const [
    pendingSocialWorkQuestion,
    setPendingSocialWorkQuestion,
  ] =
    useState(null);

  // Solo para la confirmación puntual de una receta NUEVA sin OOSS.
  const [pendingRecipeContext, setPendingRecipeContext] = useState(null);

  const [
    usedTopics,
    setUsedTopics,
  ] =
    useState([]);

  const [
    activeActionMessageId,
    setActiveActionMessageId,
  ] =
    useState(null);

  // GDPSoft: la navegación por rutas puede montar/desmontar el asistente.
  // Mantener la conversación en esta pestaña, aislada por usuario+sucursal+dispositivo.
  // No se guardan tokens; la sesión caduca después de 8 horas.
  const [chatRestored, setChatRestored] = useState(false);
  const chatOwnerRef = useRef(null);
  const CHAT_SNAPSHOT_KEY = "gdpsoft_assistant_chat_v1";
  function getChatOwner() {
    try {
      const u = JSON.parse(sessionStorage.getItem("gdpsoft_user") || "null");
      const b = JSON.parse(sessionStorage.getItem("gdpsoft_branch") || "null");
      const device = localStorage.getItem("gdpsoft_device_uuid") || "admin";
      if (!u?.id) return null;
      return [u.id, String(u.role || ""), b?.id || b?.branch_id || "admin", device].join(":");
    } catch { return null; }
  }

  useEffect(() => {
    try {
      chatOwnerRef.current = getChatOwner();
      const raw = sessionStorage.getItem(CHAT_SNAPSHOT_KEY);
      const saved = raw ? JSON.parse(raw) : null;
      if (saved && saved.owner === chatOwnerRef.current && chatOwnerRef.current &&
          Date.now() - Number(saved.savedAt || 0) < 8 * 60 * 60 * 1000) {
        setOpen(Boolean(saved.open));
        setMessages(Array.isArray(saved.messages) ? saved.messages.slice(-100) : []);
        setConversationId(saved.conversationId || null);
        setActiveSocialWork(saved.activeSocialWork || null);
        setActivePlan(saved.activePlan || null);
        setActiveImage(saved.activeImage || null);
        setPendingSocialWorkQuestion(saved.pendingSocialWorkQuestion || null);
        setPendingRecipeContext(saved.pendingRecipeContext || null);
        setUsedTopics(Array.isArray(saved.usedTopics) ? saved.usedTopics : []);
        setQuestion(saved.question || "");
        setActiveActionMessageId(saved.activeActionMessageId || null);
      } else if (saved) {
        sessionStorage.removeItem(CHAT_SNAPSHOT_KEY);
      }
    } catch (error) {
      console.warn("No se pudo restaurar la conversación local:", error);
    } finally {
      setChatRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!chatRestored) return;
    try {
      const owner = getChatOwner();
      if (!owner || owner !== chatOwnerRef.current) return;
      sessionStorage.setItem(CHAT_SNAPSHOT_KEY, JSON.stringify({
        owner, savedAt: Date.now(), open, messages: messages.slice(-100),
        conversationId, activeSocialWork, activePlan, activeImage,
        pendingSocialWorkQuestion, pendingRecipeContext, usedTopics, question, activeActionMessageId,
      }));
    } catch (error) {
      console.warn("No se pudo guardar la conversación local:", error);
    }
  }, [chatRestored, open, messages, conversationId, activeSocialWork,
      activePlan, activeImage, pendingSocialWorkQuestion, pendingRecipeContext, usedTopics,
      question, activeActionMessageId]);

  const messagesEndRef =
    useRef(null);

  const inputRef =
    useRef(null);

  // =========================================================
  // SCROLL
  // =========================================================

  useEffect(() => {
    // v3.13.68 — una respuesta nueva se abre desde su primera línea (no al final).
    const last = messages[messages.length - 1];
    if (!loading && last?.role === "assistant" && !last.error) {
      const answers = document.querySelectorAll("[data-assistant-msg]");
      const target = answers[answers.length - 1];
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
    }
    messagesEndRef
      .current
      ?.scrollIntoView({
        behavior:
          "smooth",
      });
  }, [
    messages,
    loading,
  ]);

  // =========================================================
  // PREGUNTAR DESDE OTRAS PANTALLAS (FAQs)
  // =========================================================

  useEffect(() => {
    function onAsk(event) {
      const text = String(event?.detail?.question || "").trim();
      if (!text) return;
      setOpen(true);
      setQuestion(text);
    }
    window.addEventListener("gdpsoft:ask-assistant", onAsk);
    return () =>
      window.removeEventListener("gdpsoft:ask-assistant", onAsk);
  }, []);

  // Avisa a otras piezas (p. ej. las noticias emergentes) si el chat está abierto, para que no queden tapadas.
  useEffect(() => {
    try { window.dispatchEvent(new CustomEvent("gdpsoft:assistant-state", { detail: { open: !!open } })); } catch {}
  }, [open]);

  // =========================================================
  // FOCO AUTOMÁTICO
  // =========================================================

  useEffect(() => {
    if (
      open &&
      !loading
    ) {
      const timeout =
        setTimeout(() => {
          inputRef
            .current
            ?.focus();
        }, 50);

      return () =>
        clearTimeout(
          timeout
        );
    }
  }, [
    loading,
    open,
  ]);

  // =========================================================
  // CONTEXTO LOCAL
  // =========================================================

  function getLocalContext() {
    let branch = null;
    let user = null;

    try {
      const rawBranch = sessionStorage.getItem("gdpsoft_branch");
      const rawUser = sessionStorage.getItem("gdpsoft_user");

      if (rawBranch) branch = JSON.parse(rawBranch);
      if (rawUser) user = JSON.parse(rawUser);
    } catch (err) {
      console.error("Error leyendo contexto local GDPSoft:", err);
    }

    const deviceUuid = localStorage.getItem("gdpsoft_device_uuid");
    const accessToken = sessionStorage.getItem("gdpsoft_access_token") || "";

    return {
      branch,
      user,
      deviceUuid,
      accessToken,
    };
  }

  // Cada consulta debe llevar un JWT vigente; de lo contrario puede responder,
  // pero el servidor no puede verificar que corresponde al tráfico PILOT.
  async function getValidAssistantToken() {
    const token = getLocalContext().accessToken;
    if (!token) throw new Error("La sesión venció. Ingresá nuevamente para continuar.");
    try {
      const payload = JSON.parse(atob(token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")));
      if (Number(payload?.exp || 0) * 1000 > Date.now() + 60_000) return token;
    } catch {}
    return await refreshStoredSession();
  }

  // =========================================================
  // CREAR CONVERSACIÓN
  // =========================================================

  async function createConversation() {
    const {
      branch,
      user,
      deviceUuid,
      accessToken,
    } = getLocalContext();

    const branchId = Number(branch?.id || branch?.branch_id);
    const isAdminUser = user?.is_super_admin === true || String(user?.role || "").toUpperCase() === "ADMIN";

    if ((!Number.isInteger(branchId) || branchId <= 0) && !isAdminUser) {
      throw new Error(
        "No encuentro la sucursal activa. Cerrá sesión e ingresá nuevamente."
      );
    }

    if (Number.isInteger(branchId) && branchId > 0 && !deviceUuid) {
      throw new Error(
        "Este dispositivo todavía no está identificado. Cerrá sesión e ingresá nuevamente."
      );
    }

    let currentAccessToken = accessToken;

    if (isAdminUser) {
      try {
        currentAccessToken = await refreshStoredSession();
      } catch {
        if (!currentAccessToken) {
          throw new Error("La sesión administrativa no es válida. Cerrá sesión e ingresá nuevamente.");
        }
      }
    }

    const headers = {
      "Content-Type": "application/json",
    };

    if (currentAccessToken) {
      headers.Authorization = `Bearer ${currentAccessToken}`;
    }

    const body = Number.isInteger(branchId) && branchId > 0
      ? { branchId, deviceUuid, userId: user?.id || null }
      : { adminMode: true, userId: user?.id || null };

    const response = await fetch(
      "/api/conversations",
      {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }
    );

    const data =
      await response.json();

    if (
      !response.ok ||
      data?.ok ===
        false
    ) {
      throw new Error(
        data?.error ||
          "No se pudo iniciar la conversación."
      );
    }

    const conversation =
      data?.conversation ||
      data?.data ||
      data;

    const id =
      conversation?.id ||
      data?.conversation_id;

    if (!id) {
      throw new Error(
        "La conversación fue creada pero no devolvió un identificador."
      );
    }

    setConversationId(
      id
    );

    return id;
  }

  // =========================================================
  // ASEGURAR CONVERSACIÓN
  // =========================================================

  async function ensureConversation() {
    if (
      conversationId
    ) {
      return conversationId;
    }

    return await createConversation();
  }

  // =========================================================
  // ACTUALIZAR OOSS / CONTEXTO
  // =========================================================

  function updateContextFromResponse(
    data
  ) {
    const socialWorkId =
      Number(
        data?.context
          ?.social_work_id
      );

    const socialWorkName =
      data?.social_work
        ?.name ||
      data?.structured_data
        ?.social_work_name ||
      null;

    if (
      Number.isInteger(
        socialWorkId
      ) &&
      socialWorkId > 0
    ) {
      if (
        activeSocialWork?.id &&
        Number(
          activeSocialWork.id
        ) !==
          socialWorkId
      ) {
        setActivePlan(
          null
        );

        setUsedTopics(
          []
        );
      }

      setActiveSocialWork({
        id:
          socialWorkId,

        name:
          socialWorkName ||
          (Number(activeSocialWork?.id) === socialWorkId ? activeSocialWork?.name : null) ||
          `Obra Social ${socialWorkId}`,
      });
    }

    if (
      data?.selected_plan
    ) {
      setActivePlan(
        data.selected_plan
      );
    }
  }

  // =========================================================
  // AGREGAR MENSAJE USUARIO
  // =========================================================

  function addUserMessage(
    text
  ) {
    setMessages(
      (current) => [
        ...current,
        {
          id:
            crypto.randomUUID(),

          role:
            "user",

          type:
            "text",

          text,
        },
      ]
    );
  }

  // =========================================================
  // IMAGEN SUBIDA
  // =========================================================

  function handleImageUploaded(
    image
  ) {
    if (!image) {
      return;
    }

    setActiveImage(
      image
    );

    // Al adjuntar receta digital, ofrecer una comprobación completa, sin enviar automáticamente.
    if (image.mime_type === "application/pdf") {
      setQuestion("Revisar receta adjunta: identificar la obra social y verificar los datos requeridos según normativa y Recordá/Ficha.");
    }

    setMessages(
      (current) => [
        ...current,
        {
          id:
            crypto.randomUUID(),

          role:
            "user",

          type:
            "image",

          image,
        },
      ]
    );

    setTimeout(() => {
      inputRef
        .current
        ?.focus();
    }, 50);
  }

  // =========================================================
  // PROCESAR RESPUESTA
  // =========================================================

  function processAssistantResponse(
    data
  ) {
    updateContextFromResponse(
      data
    );

    if (data?.route === "RECIPE_SOCIAL_WORK_CONFIRMATION" && data?.clarification?.original_question) {
      setPendingRecipeContext({
        originalQuestion: data.clarification.original_question,
        socialWorkId: Number(data?.context?.social_work_id),
        socialWorkName: data?.social_work?.name || activeSocialWork?.name || "la obra social activa",
        stage: "confirm",
      });
    }

    const messageId =
      crypto.randomUUID();

    const ui =
      data?.ui ||
      null;

    setMessages(
      (current) => [
        ...current,
        {
          id:
            messageId,

          role:
            "assistant",

          type:
            "text",

          text:
            data?.answer ||
            "No encontré una respuesta.",

          ui,

          source:
            data?.source ||
            null,

          route:
            data?.route ||
            null,
        },
      ]
    );

    if (ui) {
      setActiveActionMessageId(
        messageId
      );
    } else {
      setActiveActionMessageId(
        null
      );
    }
  }

  // =========================================================
  // ENVIAR AL ENDPOINT CORRECTO
  // =========================================================

  async function requestAssistant({
    displayText = null,
    question = "",
    topic = null,
    plan = null,
    recipeClarification = null,
  }) {
    if (loading) {
      return;
    }

    if (displayText) {
      addUserMessage(
        displayText
      );
    }

    setActiveActionMessageId(
      null
    );

    setLoading(
      true
    );

    setError("");

    try {
      const validAssistantToken = await getValidAssistantToken();
      const currentConversationId =
        await ensureConversation();

      /*
       * Una imagen cargada NO implica
       * que todas las preguntas usen visión.
       */
      const useImage =
        shouldUseActiveImage({
          activeImage,
          question,
          topic,
        });

      const endpoint =
        useImage
          ? "/api/assistant/analyze-image"
          : "/api/assistant/chat";

      const requestBody =
        useImage
          ? {
              conversationId:
                currentConversationId,

              imageId:
                activeImage.id,

              question,
            }
          : {
              conversationId:
                currentConversationId,

              question,

              topic,

              plan:
                plan ||
                activePlan ||
                null,

              usedTopics,
              ...(recipeClarification ? {recipeClarification} : {}),
            };

      const response =
        await fetch(
          endpoint,
          {
            method:
              "POST",

            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${validAssistantToken}`,
            },

            body:
              JSON.stringify(
                requestBody
              ),
          }
        );

      let data =
        null;

      const rawResponse =
        await response.text();

      try {
        data =
          rawResponse
            ? JSON.parse(
                rawResponse
              )
            : null;
      } catch {
        console.error(
          "Respuesta NO JSON del servidor:",
          {
            status:
              response.status,

            statusText:
              response.statusText,

            endpoint,

            body:
              rawResponse,
          }
        );

        throw new Error(
          `El servidor devolvió una respuesta inválida (${response.status}). Revisá la consola del servidor.`
        );
      }

      if (
        !response.ok ||
        data?.ok === false
      ) {
        // =====================================================
        // FALTA OOSS
        // =====================================================

        if (
          data?.code ===
          "SOCIAL_WORK_REQUIRED"
        ) {
          setPendingSocialWorkQuestion(
            (current) =>
              current ||
              question
          );

          const messageId =
            crypto.randomUUID();

          setMessages(
            (current) => [
              ...current,
              {
                id:
                  messageId,

                role:
                  "assistant",

                type:
                  "text",

                text:
                  data?.error ||
                  "Indicame la obra social que querés consultar.",
              },
            ]
          );

          return;
        }

        // =====================================================
        // MÁS DE UNA OOSS
        // =====================================================

        if (
          data?.code ===
          "MULTIPLE_SOCIAL_WORKS_DETECTED"
        ) {
          const names =
            Array.isArray(
              data?.social_works
            )
              ? data
                  .social_works
                  .map(
                    (item) =>
                      item.name
                  )
                  .filter(
                    Boolean
                  )
                  .join(
                    ", "
                  )
              : "";

          setMessages(
            (current) => [
              ...current,
              {
                id:
                  crypto.randomUUID(),

                role:
                  "assistant",

                type:
                  "text",

                text:
                  names
                    ? `Detecté más de una obra social: ${names}. Indicame cuál querés consultar.`
                    : "Detecté más de una obra social. Indicame cuál querés consultar.",
              },
            ]
          );

          return;
        }

        // =====================================================
        // IMAGEN NO DISPONIBLE
        // =====================================================

        if (
          data?.code ===
          "ACTIVE_IMAGE_NOT_FOUND"
        ) {
          setActiveImage(
            null
          );

          throw new Error(
            "La imagen ya no está disponible. Volvé a adjuntarla."
          );
        }

        console.error(
          "GDPSoft assistant backend error:",
          {
            endpoint,

            status:
              response.status,

            statusText:
              response.statusText,

            code:
              data?.code ||
              null,

            error:
              data?.error ||
              null,

            data,
          }
        );

        throw new Error(
          data?.error ||
            (
              data?.code
                ? `Error del asistente: ${data.code}`
                : `No pude responder la consulta. HTTP ${response.status}`
            )
        );
      }

      setPendingSocialWorkQuestion(
        null
      );

      processAssistantResponse(
        data
      );
      return true;
    } catch (err) {
      console.error(
        "FloatingAssistant:",
        err
      );

      setMessages(
        (current) => [
          ...current,
          {
            id:
              crypto.randomUUID(),

            role:
              "assistant",

            type:
              "text",

            error:
              true,

            text:
              err?.message ||
              "Ocurrió un error procesando la consulta.",
          },
        ]
      );
      return false;
    } finally {
      setLoading(
        false
      );
    }
  }

  // =========================================================
  // RESPUESTA A UNA RECETA NUEVA SIN OOSS EXPLÍCITA
  // =========================================================

  async function answerRecipeContext(rawText) {
    if (!pendingRecipeContext || loading) return;
    const reply = String(rawText || "").trim();
    if (!reply) return;
    const pending = pendingRecipeContext;
    const action = interpretPrescriptionContextReply(reply);
    if (pending.stage === "confirm" && action === "ASK_OTHER") {
      addUserMessage("No");
      setPendingRecipeContext({...pending,stage:"new"});
      setActiveActionMessageId(null);
      setMessages(current => [...current, {
        id: crypto.randomUUID(), role:"assistant",type:"text",
        text:"¿A qué obra social pertenece la receta?",
      }]);
      setQuestion("");
      return;
    }
    if (pending.stage === "new" && action === "ASK_OTHER") {
      addUserMessage(reply);
      setMessages(current => [...current, {
        id: crypto.randomUUID(), role:"assistant",type:"text",
        text:"Escribí el nombre de la obra social para poder continuar.",
      }]);
      setQuestion("");
      return;
    }
    const confirm = pending.stage === "confirm" && action === "CONFIRM_ACTIVE";
    // Al ingresar la nueva OOSS, el servidor la valida antes de cambiar el
    // contexto. Si no la reconoce, conserva la pregunta para volver a intentar.
    const recipeClarification = confirm
      ? {action:"CONFIRM_ACTIVE",expectedSocialWorkId:pending.socialWorkId}
      : {action:"SELECT_OTHER",socialWorkName:reply};
    setQuestion("");
    setActiveActionMessageId(null);
    const ok = await requestAssistant({
      displayText:reply,
      question:pending.originalQuestion,
      recipeClarification,
    });
    if (ok) setPendingRecipeContext(null);
  }

  // =========================================================
  // ENVIAR TEXTO DEL INPUT
  // =========================================================

  async function sendQuestion() {
    const cleanQuestion =
      question.trim();

    if (
      !cleanQuestion ||
      loading
    ) {
      return;
    }

    if (pendingRecipeContext) {
      await answerRecipeContext(cleanQuestion);
      return;
    }

    let effectiveQuestion =
      cleanQuestion;

    /*
     * requisitos receta
     * -> pide OOSS
     * -> usuario escribe OSDE
     *
     * Backend recibe:
     * requisitos receta OSDE
     *
     * También funciona con imagen:
     *
     * puedo recibir esta receta?
     * -> pide OOSS
     * -> OSDEPYM
     *
     * Backend recibe:
     * puedo recibir esta receta? OSDEPYM
     *
     * y vuelve a entrar por analyze-image.
     */
    if (
      pendingSocialWorkQuestion
    ) {
      effectiveQuestion =
        `${pendingSocialWorkQuestion} ${cleanQuestion}`;
    }

    setQuestion("");

    await requestAssistant({
      displayText:
        cleanQuestion,

      question:
        effectiveQuestion,
    });
  }

  // =========================================================
  // BOTONES / OPCIONES
  // =========================================================

  async function handleAction({
    message,
    action,
  }) {
    if (
      loading ||
      message.id !==
        activeActionMessageId
    ) {
      return;
    }

    if (message?.ui?.type === "CONFIRM_SOCIAL_WORK" && pendingRecipeContext) {
      if (action.type === "YES") await answerRecipeContext("Sí");
      if (action.type === "NO") await answerRecipeContext("No");
      return;
    }

    if (
      action.type ===
      "YES"
    ) {
      const topic =
        message?.ui
          ?.yes?.topic;

      if (!topic) {
        return;
      }

      setUsedTopics(
        (current) =>
          current.includes(
            topic
          )
            ? current
            : [
                ...current,
                topic,
              ]
      );

      await requestAssistant({
        displayText:
          "Sí",

        topic,

        plan:
          activePlan,
      });

      return;
    }

    if (
      action.type ===
      "NO"
    ) {
      addUserMessage(
        "No"
      );

      setActiveActionMessageId(
        null
      );

      setTimeout(() => {
        inputRef
          .current
          ?.focus();
      }, 50);

      return;
    }

    if (action.type === "CHOICE" && action.option?.label) {
      await requestAssistant({
        displayText: action.option.label,
        question: action.option.label,
      });
      return;
    }

    if (
      action.type ===
      "OPTION"
    ) {
      const option =
        action.option;

      if (!option) {
        return;
      }

      setActivePlan(
        option.plan ||
        null
      );

      const topic =
        option.topic ||
        "PLAN_REQUIREMENTS";

      setUsedTopics(
        (current) =>
          current.includes(
            topic
          )
            ? current
            : [
                ...current,
                topic,
              ]
      );

      await requestAssistant({
        displayText:
          option.label,

        topic,

        plan:
          option.plan ||
          null,
      });
    }
  }

  // =========================================================
  // ENTER
  // =========================================================

  function handleKeyDown(
    event
  ) {
    if (
      event.key ===
        "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();

      if (!loading) {
        sendQuestion();
      }
    }
  }

  // =========================================================
  // CERRAR CONVERSACIÓN
  // =========================================================

  async function closeCurrentConversation() {
    if (
      !conversationId
    ) {
      return;
    }

    try {
      await fetch(
        `/api/conversations/${conversationId}`,
        {
          method:
            "PATCH",

          headers: {
            "Content-Type":
              "application/json",
          },

          body:
            JSON.stringify({
              action:
                "CLOSE",
            }),
        }
      );
    } catch (err) {
      console.error(
        "FloatingAssistant close:",
        err
      );
    }
  }

  // =========================================================
  // NUEVA CONSULTA
  // =========================================================

  async function newConsultation() {
    if (loading) {
      return;
    }

    await closeCurrentConversation();

    setConversationId(
      null
    );

    setActiveSocialWork(
      null
    );

    setActivePlan(
      null
    );

    setActiveImage(
      null
    );

    setPendingSocialWorkQuestion(
      null
    );

    setPendingRecipeContext(null);

    setUsedTopics(
      []
    );

    setActiveActionMessageId(
      null
    );

    setQuestion("");

    setError("");

    setMessages(
      []
    );

    setTimeout(() => {
      inputRef
        .current
        ?.focus();
    }, 50);
  }

  // =========================================================
  // UI
  // =========================================================

  return (
    <>
      {open && (
        <div className="fixed inset-x-2 top-[84px] bottom-3 z-[700] flex min-h-0 w-auto flex-col overflow-hidden rounded-2xl sm:inset-x-auto sm:top-[84px] sm:bottom-3 sm:right-5 lg:top-[124px] sm:h-auto sm:w-[560px] sm:max-w-[calc(100vw-32px)] border border-zinc-200 bg-white shadow-2xl">

          <div className="border-b border-zinc-100 bg-white">

            <div className="flex items-center justify-between px-4 py-3">

              <div className="flex items-center gap-3">

                <div className="relative h-11 w-11 overflow-hidden rounded-full bg-[#f5edf5]">

                  <Image
                    src="/images/bot-gdpsoft.png"
                    alt="Asistente GDPSoft"
                    fill
                    className="object-contain"
                    sizes="44px"
                  />

                </div>

                <div>

                  <p className="text-sm font-semibold text-zinc-900">
                    Asistente GDPSoft
                  </p>

                  <p className="text-[11px] text-emerald-600">
                    ● Disponible
                  </p>

                </div>

              </div>

              <div className="flex items-center gap-1">

                {(conversationId ||
                  messages.length >
                    0) && (
                  <button
                    type="button"
                    onClick={
                      newConsultation
                    }
                    disabled={
                      loading
                    }
                    className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-[#8f2a85] transition hover:bg-[#8f2a85]/5 disabled:opacity-50"
                  >
                    Nueva consulta
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    setOpen(false)
                  }
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-700"
                  aria-label="Minimizar asistente"
                  title="Minimizar"
                >
                  <span className="mb-1 text-xl leading-none">−</span>
                </button>

              </div>

            </div>

            {(activeSocialWork ||
              activePlan) && (
              <div className="flex flex-wrap gap-2 px-4 pb-3">

                {activeSocialWork && (
                  <div className="inline-flex max-w-full items-center gap-2 rounded-full border-2 border-[#8f2a85]/40 bg-[#8f2a85]/10 px-3 py-2 shadow-sm">

                    <span className="h-2 w-2 shrink-0 rounded-full bg-[#8f2a85]" />

                    <span className="text-xs text-zinc-500">
                      Consultando sobre:
                    </span>

                    <span className="truncate text-sm font-extrabold uppercase tracking-wide text-[#6f1f67]">
                      {
                        activeSocialWork.name
                      }
                    </span>

                  </div>
                )}

                {activePlan &&
                  activePlan.label !==
                    "General" && (
                    <div className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5">

                      <span className="text-xs text-zinc-500">
                        Plan:
                      </span>

                      <span className="truncate text-xs font-semibold text-emerald-700">
                        {
                          activePlan.label
                        }
                      </span>

                    </div>
                  )}

              </div>
            )}

          </div>

          <div className="flex-1 overflow-y-auto bg-[#faf9fb] p-4">

            {messages.length ===
              0 && (
              <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-[17px] font-medium leading-7 text-zinc-900 shadow-sm">
                Hola, estoy disponible para ayudarte.
              </div>
            )}

            <div className="space-y-3">

              {messages.map(
                (message) => {
                  const actionsEnabled =
                    message.id ===
                      activeActionMessageId &&
                    !loading;

                  const isImageMessage =
                    message.type ===
                    "image";

                  let bubbleClass;

                  if (
                    message.role ===
                      "user" &&
                    isImageMessage
                  ) {
                    bubbleClass =
                      "ml-auto max-w-[85%] rounded-2xl rounded-tr-sm border border-zinc-200 bg-white p-2 shadow-sm";
                  } else if (
                    message.role ===
                    "user"
                  ) {
                    bubbleClass =
                      "ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#8f2a85] px-4 py-3 text-[17px] font-medium leading-7 text-white shadow-sm";
                  } else if (
                    message.error
                  ) {
                    bubbleClass =
                      "max-w-[88%] rounded-2xl rounded-tl-sm border border-red-100 bg-red-50 px-4 py-3 text-[17px] font-medium leading-7 text-red-700";
                  } else {
                    bubbleClass =
                      "max-w-[98%] rounded-2xl rounded-tl-sm border border-zinc-100 bg-white px-2.5 py-3 text-[17px] font-medium leading-7 text-zinc-900 shadow-sm";
                  }

                  return (
                    <div
                      key={
                        message.id
                      }
                    
                      data-assistant-msg={message.role === "assistant" ? "1" : undefined}
                    >

                      <div
                        className={
                          bubbleClass
                        }
                      >

                        {isImageMessage ? (
                          <div className="space-y-2">

                            {message.image?.mime_type === "application/pdf" ? (
                              <div className="rounded-xl border border-[#8f2a85]/20 bg-[#f8f2fa] px-3 py-3 text-sm text-[#75216c]">
                                <p className="font-semibold">Receta digital (PDF)</p>
                                <p className="mt-1 truncate text-xs">{message.image.original_filename || "Documento PDF"}</p>
                                {message.image.preview_url && <a href={message.image.preview_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs underline">Abrir documento</a>}
                              </div>
                            ) : message.image
                              ?.preview_url ? (
                              <img
                                src={
                                  message.image
                                    .preview_url
                                }
                                alt="Imagen adjunta"
                                className="max-h-[300px] w-full rounded-xl bg-zinc-50 object-contain"
                              />
                            ) : (
                              <div className="flex h-32 items-center justify-center rounded-xl bg-zinc-100 text-sm text-zinc-500">
                                Imagen adjunta
                              </div>
                            )}

                            {message.image
                              ?.original_filename && (
                              <p className="truncate px-1 text-[11px] text-zinc-500">
                                {
                                  message.image
                                    .original_filename
                                }
                              </p>
                            )}

                          </div>
                        ) : (
                          message.role === "assistant" && !message.error ? (
                            <AssistantRichMessage text={message.text} />
                          ) : (
                            <div className="whitespace-pre-wrap break-words">{message.text}</div>
                          )
                        )}

                      </div>

                      {message.role ===
                        "assistant" &&
                        message?.ui
                          ?.type && ["YES_NO", "CONFIRM_SOCIAL_WORK"].includes(message.ui.type) && (
                          <div className="mt-2 max-w-[88%]">

                            {message.ui
                              .prompt && (
                              <p className="mb-2 text-xs font-medium leading-5 text-zinc-600">
                                {
                                  message
                                    .ui
                                    .prompt
                                }
                              </p>
                            )}

                            <div className="flex gap-2">

                              <button
                                type="button"
                                disabled={
                                  !actionsEnabled
                                }
                                onClick={() =>
                                  handleAction({
                                    message,

                                    action: {
                                      type:
                                        "YES",
                                    },
                                  })
                                }
                                className="min-w-[74px] rounded-xl bg-[#8f2a85] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#7c2474] disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Sí
                              </button>

                              <button
                                type="button"
                                disabled={
                                  !actionsEnabled
                                }
                                onClick={() =>
                                  handleAction({
                                    message,

                                    action: {
                                      type:
                                        "NO",
                                    },
                                  })
                                }
                                className="min-w-[74px] rounded-xl border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                No
                              </button>

                            </div>

                          </div>
                        )}

                      {message.role === "assistant" && message?.ui?.type === "CHOICES" && (
                        <div className="mt-2 max-w-[90%]">
                          {message.ui.prompt && (
                            <p className="mb-2 text-xs font-medium leading-5 text-zinc-600">{message.ui.prompt}</p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {(message.ui.options || []).map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                disabled={!actionsEnabled}
                                onClick={() => handleAction({ message, action: { type: "CHOICE", option } })}
                                className="rounded-xl border border-[#8f2a85]/20 bg-white px-3 py-2 text-xs font-semibold text-[#8f2a85] shadow-sm transition hover:border-[#8f2a85]/40 hover:bg-[#8f2a85]/5 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {message.role ===
                        "assistant" &&
                        message?.ui
                          ?.type ===
                          "OPTIONS" && (
                          <div className="mt-2 flex max-w-[90%] flex-wrap gap-2">

                            {(
                              message.ui
                                .options ||
                              []
                            ).map(
                              (
                                option
                              ) => (
                                <button
                                  key={
                                    option.id
                                  }
                                  type="button"
                                  disabled={
                                    !actionsEnabled
                                  }
                                  onClick={() =>
                                    handleAction({
                                      message,

                                      action: {
                                        type:
                                          "OPTION",

                                        option,
                                      },
                                    })
                                  }
                                  className="rounded-xl border border-[#8f2a85]/20 bg-white px-3 py-2 text-xs font-semibold text-[#8f2a85] shadow-sm transition hover:border-[#8f2a85]/40 hover:bg-[#8f2a85]/5 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {
                                    option.label
                                  }
                                </button>
                              )
                            )}

                          </div>
                        )}

                    </div>
                  );
                }
              )}

              {loading && (
                <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm text-zinc-500 shadow-sm">

                  <span className="animate-pulse">
                    Consultando...
                  </span>

                </div>
              )}

              <div
                ref={
                  messagesEndRef
                }
              />

            </div>

          </div>

          {error && (
            <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="border-t border-zinc-100 bg-white p-3">

            <div className="flex items-end gap-2">

              <AssistantImageUploader
                conversationId={
                  conversationId
                }
                ensureConversation={
                  ensureConversation
                }
                disabled={
                  loading
                }
                onUploaded={
                  handleImageUploaded
                }
              />

              <input
                ref={
                  inputRef
                }
                type="text"
                value={
                  question
                }
                onChange={(e) =>
                  setQuestion(
                    e.target.value
                  )
                }
                onKeyDown={
                  handleKeyDown
                }
                placeholder={
                  activeImage
                    ? "¿Qué querés verificar de la imagen?"
                    : "Escribí tu consulta..."
                }
                className="min-w-0 flex-1 rounded-xl border border-zinc-200 px-3.5 py-3 text-base font-medium outline-none transition focus:border-[#8f2a85] focus:ring-2 focus:ring-[#8f2a85]/10"
              />

              <button
                type="button"
                onClick={
                  sendQuestion
                }
                disabled={
                  !question.trim() ||
                  loading
                }
                className="rounded-xl bg-[#8f2a85] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#7c2474] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Enviar
              </button>

            </div>

            {loading && (
              <p className="mt-1.5 px-1 text-[10px] text-zinc-400">
                Podés ir escribiendo la próxima consulta mientras espero la respuesta.
              </p>
            )}

          </div>

        </div>
      )}

      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group fixed bottom-4 right-3 z-[650] h-[64px] w-[64px] border-0 bg-transparent p-0 shadow-none outline-offset-4 transition-transform hover:-translate-y-1 focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#8f2a85] sm:bottom-5 sm:right-5 sm:h-[76px] sm:w-[76px]"
          aria-label="Abrir asistente GDPSoft"
          title="Abrir asistente GDPSoft"
        >
          <Image
            src="/images/bot-gdpsoft.png"
            alt=""
            fill
            className="object-contain"
            sizes="(max-width: 640px) 64px, 76px"
          />
        </button>
      )}
    </>
  );
}
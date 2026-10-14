"use client";

import Link from "next/link";

import {
  useEffect,
  useState,
} from "react";

import { Icon } from "@iconify/react";

const DEFAULT_WEATHER = {
  latitude: -32.8895,
  longitude: -68.8458,
};

const CARDS = [
  {
    title: "Obras Sociales",
    description:
      "Consultá requisitos, planes, validación y documentación.",
    icon: "fluent-emoji:hospital",
    href:
      "/sucursal/obras-sociales",
    iconClass:
      "bg-[#f9eafa]",
  },
  {
    title: "Normativas",
    description:
      "Revisá las normativas vigentes disponibles.",
    icon:
      "fluent-color:document-text-24",
    href:
      "/sucursal/normativas",
    iconClass:
      "bg-[#f4ecf9]",
  },
  {
    title:
      "Árboles de Decisión",
    description:
      "Resolvé situaciones operativas paso a paso.",
    icon:
      "fluent-emoji:herb",
    href:
      "/sucursal/arboles",
    iconClass:
      "bg-[#edf7e8]",
  },
  {
    title:
      "Preguntas Frecuentes",
    description:
      "Consultá respuestas operativas previamente aprobadas.",
    icon:
      "fluent-emoji:red-question-mark",
    href:
      "/sucursal/faqs",
    iconClass:
      "bg-[#f9eafa]",
  },
];

export default function SucursalHomePage() {
  const [
    user,
    setUser,
  ] = useState(null);

  const [
    weather,
    setWeather,
  ] = useState(null);

  useEffect(() => {
    try {
      const rawUser =
        sessionStorage.getItem(
          "gdpsoft_user"
        );

      if (rawUser) {
        setUser(
          JSON.parse(rawUser)
        );
      }
    } catch {}
  }, []);

  useEffect(() => {
    async function loadWeather() {
      try {
        const response =
          await fetch(
            `/api/weather?latitude=${DEFAULT_WEATHER.latitude}&longitude=${DEFAULT_WEATHER.longitude}`
          );

        const result =
          await response.json();

        if (
          response.ok &&
          result.ok
        ) {
          setWeather(
            result.weather
          );
        }
      } catch {}
    }

    loadWeather();
  }, []);

  return (
    <div>

      {/* SALUDO */}

      <div className="mb-8">

        <div className="flex items-center gap-3">

          <h1 className="text-[34px] font-bold tracking-[-1.1px] text-[#171021]">
            Hola,{" "}
            {user?.username ||
              "Sucursal"}
          </h1>

          {weather && (
            <span
              className="text-[30px]"
              title={
                weather.description
              }
            >
              {weather.icon}
            </span>
          )}

        </div>

        <p className="mt-1 text-[15px] text-[#777083]">
          Accedé a la información
          operativa que necesitás para
          tu atención diaria.
        </p>

      </div>

      {/* HERO */}

      <div className="relative mb-8 overflow-hidden rounded-[17px] border border-[#e6d7eb] bg-gradient-to-r from-[#fbf3fd] via-[#fffaff] to-[#fbf2ff] px-7 py-7">

        <div className="relative z-10">

          <p className="text-[12px] font-bold uppercase tracking-[.13em] text-[#9c2cb5]">
            GDP SOFT
          </p>

          <h2 className="mt-1 text-[20px] font-bold text-[#20142b]">
            ¿En qué podemos ayudarte hoy?
          </h2>

          <p className="mt-1 text-[14px] text-[#7c7485]">
            Consultá obras sociales,
            normativas, árboles o
            utilizá el asistente
            GDPSoft.
          </p>

        </div>

        <div className="absolute -bottom-[65px] -right-[30px] h-[170px] w-[400px] rotate-[-9deg] rounded-[50%] bg-[#c99bea]/15" />

        <div className="absolute -bottom-[85px] right-[120px] h-[140px] w-[330px] rotate-[-13deg] rounded-[50%] bg-[#b26ddc]/10" />

      </div>

      {/* CARDS */}

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">

        {CARDS.map(
          (card) => (
            <Link
              key={card.href}
              href={card.href}
              className="group min-h-[225px] rounded-[17px] border border-zinc-200/90 bg-white p-6 shadow-[0_7px_18px_rgba(40,27,55,.06)] transition-all hover:-translate-y-1 hover:border-[#9b44aa]/25 hover:shadow-[0_12px_28px_rgba(55,30,70,.10)]"
            >

              <div
                className={[
                  "flex h-[54px] w-[54px] items-center justify-center rounded-[14px]",
                  card.iconClass,
                ].join(" ")}
              >
                <Icon
                  icon={
                    card.icon
                  }
                  width="30"
                  height="30"
                />
              </div>

              <h3 className="mt-5 text-[17px] font-bold text-[#1f1528]">
                {card.title}
              </h3>

              <p className="mt-2 min-h-[48px] text-[14px] leading-[1.55] text-[#797183]">
                {
                  card.description
                }
              </p>

              <p className="mt-4 inline-flex items-center gap-1 text-[13px] font-bold text-[#9827b6]">
                Consultar

                <Icon
                  icon="fluent:arrow-right-20-regular"
                  width="15"
                  height="15"
                />
              </p>

            </Link>
          )
        )}

      </div>

      {/* BOT */}

      <div className="mt-7 rounded-[17px] border border-zinc-200 bg-white px-6 py-5 shadow-[0_5px_15px_rgba(45,30,55,.035)]">

        <div className="flex items-center gap-4">

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#edf8dc]">

            <Icon
              icon="fluent-emoji:robot"
              width="27"
              height="27"
            />

          </div>

          <div>

            <p className="text-[15px] font-bold text-[#211629]">
              Asistente GDPSoft
            </p>

            <p className="mt-1 text-[13px] text-[#77707f]">
              El bot está disponible
              desde cualquier pantalla.
              Consultale sobre obras
              sociales, validaciones,
              requisitos y
              procedimientos.
            </p>

          </div>

        </div>

      </div>

    </div>
  );
}
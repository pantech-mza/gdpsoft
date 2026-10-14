"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";

import { useRouter } from "next/navigation";
import { Icon } from "@iconify/react";

const DEFAULT_WEATHER_LOCATION = {
  city: "Mendoza",
  latitude: -32.8895,
  longitude: -68.8458,
};

const SUPPORT_WHATSAPP =
  process.env.NEXT_PUBLIC_GDPSOFT_SUPPORT_WHATSAPP || "";

export default function SucursalTopbar() {
  const router = useRouter();
  const dropdownRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [branch, setBranch] = useState(null);
  const [device, setDevice] = useState(null);
  const [weather, setWeather] = useState(null);

  useEffect(() => {
    try {
      const rawUser =
        sessionStorage.getItem("gdpsoft_user");

      const rawBranch =
        sessionStorage.getItem("gdpsoft_branch");

      const rawDevice =
        sessionStorage.getItem("gdpsoft_device");

      if (rawUser) {
        setUser(JSON.parse(rawUser));
      }

      if (rawBranch) {
        setBranch(JSON.parse(rawBranch));
      }

      if (rawDevice) {
        setDevice(JSON.parse(rawDevice));
      } else {
        const name =
          localStorage.getItem("gdpsoft_device_name");

        const type =
          localStorage.getItem("gdpsoft_device_type");

        if (name) {
          setDevice({
            device_name: name,
            device_type: type,
          });
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    function handleOutside(event) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener(
      "mousedown",
      handleOutside
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleOutside
      );
    };
  }, []);

  useEffect(() => {
    async function loadWeather() {
      try {
        const response = await fetch(
          `/api/weather?latitude=${DEFAULT_WEATHER_LOCATION.latitude}&longitude=${DEFAULT_WEATHER_LOCATION.longitude}`
        );

        const result =
          await response.json();

        if (response.ok && result.ok) {
          setWeather(result.weather);
        }
      } catch {}
    }

    loadWeather();
  }, []);

  function logout() {
    sessionStorage.clear();
    router.replace("/");
  }

  function contactSupport() {
    if (!SUPPORT_WHATSAPP) {
      alert(
        "El número de soporte todavía no está configurado."
      );
      return;
    }

    const message = [
      "Hola, necesito soporte técnico con GDP Soft.",
      "",
      `Sucursal: ${branch?.name || "-"}`,
      `Usuario: ${user?.username || "-"}`,
      `Dispositivo: ${device?.device_name || "-"}`,
    ].join("\n");

    window.open(
      `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(
        message
      )}`,
      "_blank"
    );
  }

  const initials =
    String(
      user?.username ||
        branch?.name ||
        "S"
    )
      .slice(0, 2)
      .toUpperCase();

  return (
    <header className="sticky top-0 z-40 px-3 pt-3 sm:px-6 lg:px-8">
      <div className="flex h-[64px] min-w-0 items-center justify-between rounded-[16px] border border-zinc-200 bg-white px-3 shadow-[0_8px_28px_rgba(43,28,61,.07)] sm:h-[72px] sm:px-5">

        {/* BRAND DESKTOP */}

        <div className="hidden min-w-0 items-center gap-3 md:flex">
          <img
            src="/images/gdpsoft-icon.png"
            alt="GDP Soft"
            className="h-9 w-9 object-contain"
          />

          <div>
            <p className="text-[15px] font-bold leading-tight text-[#20132d]">
              GDP Soft
            </p>

            <p className="mt-0.5 text-[10px] text-zinc-400">
              Portal de Sucursal
            </p>
          </div>
        </div>

        {/* MOBILE SPACER */}

        <div className="w-12 md:hidden" />

        {/* RIGHT */}

        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">

          {weather && (
            <div className="flex shrink-0 items-center gap-2 rounded-xl bg-[#faf9fc] px-2.5 py-2 sm:px-4">

              <span className="text-xl">
                {weather.icon}
              </span>

              <div>
                <span className="text-[13px] font-bold text-[#21162c] sm:text-[16px]">
                  {weather.temperature}°
                </span>

                <span className="ml-1 hidden text-[9px] text-zinc-500 sm:inline">
                  Mendoza
                </span>

                <p className="hidden text-[9px] text-zinc-400 sm:block">
                  {weather.description}
                </p>
              </div>
            </div>
          )}

          <div className="hidden h-8 w-px bg-zinc-200 sm:block" />

          <div
            ref={dropdownRef}
            className="relative min-w-0"
          >
            <button
              type="button"
              onClick={() =>
                setOpen((value) => !value)
              }
              className="flex min-w-0 items-center gap-2 rounded-xl px-1.5 py-1.5 hover:bg-zinc-50 sm:gap-3 sm:px-2"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#a829a0] to-[#7b1db8] text-xs font-bold text-white sm:h-10 sm:w-10">
                {initials}
              </div>

              <div className="hidden min-w-0 text-left sm:block">
                <p className="max-w-[90px] truncate text-[13px] font-bold text-[#21162c]">
                  {user?.username || "Sucursal"}
                </p>

                <p className="text-[10px] text-zinc-400">
                  Mi cuenta
                </p>
              </div>

              <Icon
                icon="fluent:chevron-down-20-regular"
                width="15"
                className={[
                  "hidden shrink-0 text-zinc-500 sm:block",
                  open ? "rotate-180" : "",
                ].join(" ")}
              />
            </button>

            {open && (
              <div className="absolute right-0 top-[54px] z-[100] w-[290px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl sm:w-[320px]">

                <div className="border-b border-zinc-100 p-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#8f2a85] text-sm font-bold text-white">
                      {initials}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {user?.username}
                      </p>

                      <p className="truncate text-xs text-zinc-400">
                        Sucursal {branch?.name}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <DataItem
                    label="Usuario"
                    value={user?.username}
                  />

                  <DataItem
                    label="Email"
                    value={
                      user?.email ||
                      "No disponible"
                    }
                  />

                  <DataItem
                    label="Circuito"
                    value={
                      branch?.branch_type ||
                      "-"
                    }
                  />

                  <DataItem
                    label="Dispositivo"
                    value={
                      device?.device_name ||
                      "-"
                    }
                  />
                </div>

                <div className="border-t border-zinc-100 p-3">
                  <button
                    type="button"
                    onClick={contactSupport}
                    className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-[#8f2a85] hover:bg-[#8f2a85]/5"
                  >
                    <Icon
                      icon="fluent:headset-24-regular"
                      width="20"
                    />

                    Soporte técnico
                  </button>

                  <button
                    type="button"
                    onClick={logout}
                    className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    <Icon
                      icon="fluent:sign-out-24-regular"
                      width="20"
                    />

                    Cerrar sesión
                  </button>
                </div>

              </div>
            )}
          </div>

        </div>
      </div>
    </header>
  );
}

function DataItem({
  label,
  value,
}) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-[.1em] text-zinc-400">
        {label}
      </p>

      <p className="mt-1 break-words text-sm font-medium text-zinc-700">
        {value || "-"}
      </p>
    </div>
  );
}
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";

export const revalidate = 900;

function getWeatherIcon(
  code,
  isDay
) {
  if (code === 0) {
    return isDay
      ? "☀️"
      : "🌙";
  }

  if ([1, 2].includes(code)) {
    return isDay
      ? "🌤️"
      : "☁️";
  }

  if (code === 3) {
    return "☁️";
  }

  if (
    [45, 48].includes(
      code
    )
  ) {
    return "🌫️";
  }

  if (
    [
      51,
      53,
      55,
      56,
      57,
    ].includes(code)
  ) {
    return "🌦️";
  }

  if (
    [
      61,
      63,
      65,
      66,
      67,
    ].includes(code)
  ) {
    return "🌧️";
  }

  if (
    [
      71,
      73,
      75,
      77,
      85,
      86,
    ].includes(code)
  ) {
    return "🌨️";
  }

  if (
    [
      80,
      81,
      82,
    ].includes(code)
  ) {
    return "🌦️";
  }

  if (
    [
      95,
      96,
      99,
    ].includes(code)
  ) {
    return "⛈️";
  }

  return "🌡️";
}

function getWeatherDescription(
  code
) {
  const descriptions = {
    0: "Despejado",

    1:
      "Mayormente despejado",

    2:
      "Parcialmente nublado",

    3:
      "Nublado",

    45:
      "Niebla",

    48:
      "Niebla",

    51:
      "Llovizna leve",

    53:
      "Llovizna",

    55:
      "Llovizna intensa",

    56:
      "Llovizna helada",

    57:
      "Llovizna helada",

    61:
      "Lluvia leve",

    63:
      "Lluvia",

    65:
      "Lluvia intensa",

    66:
      "Lluvia helada",

    67:
      "Lluvia helada",

    71:
      "Nevada leve",

    73:
      "Nevada",

    75:
      "Nevada intensa",

    77:
      "Nieve",

    80:
      "Chaparrones leves",

    81:
      "Chaparrones",

    82:
      "Chaparrones intensos",

    85:
      "Nevadas leves",

    86:
      "Nevadas intensas",

    95:
      "Tormenta",

    96:
      "Tormenta con granizo",

    99:
      "Tormenta fuerte",
  };

  return (
    descriptions[code] ||
    "Condición actual"
  );
}

export async function GET(
  request
) {
  try {
    const {
      searchParams,
    } = new URL(
      request.url
    );

    const latitude =
      Number(
        searchParams.get(
          "latitude"
        )
      );

    const longitude =
      Number(
        searchParams.get(
          "longitude"
        )
      );

    if (
      !Number.isFinite(
        latitude
      ) ||
      !Number.isFinite(
        longitude
      )
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Coordenadas inválidas",
        },
        {
          status: 400,
        }
      );
    }

    const url =
      new URL(
        "https://api.open-meteo.com/v1/forecast"
      );

    url.searchParams.set(
      "latitude",
      String(
        latitude
      )
    );

    url.searchParams.set(
      "longitude",
      String(
        longitude
      )
    );

    url.searchParams.set(
      "current",
      [
        "temperature_2m",
        "weather_code",
        "is_day",
      ].join(",")
    );

    url.searchParams.set(
      "timezone",
      "America/Argentina/Mendoza"
    );

    const response =
      await fetch(
        url.toString(),
        {
          next: {
            revalidate:
              900,
          },
        }
      );

    if (
      !response.ok
    ) {
      throw new Error(
        `Open-Meteo respondió ${response.status}`
      );
    }

    const data =
      await response.json();

    const current =
      data?.current;

    if (!current) {
      throw new Error(
        "No se recibió clima actual"
      );
    }

    const weatherCode =
      Number(
        current.weather_code
      );

    const isDay =
      Number(
        current.is_day
      ) === 1;

    const temperature =
      Math.round(
        Number(
          current.temperature_2m
        )
      );

    return NextResponse.json({
      ok: true,

      weather: {
        temperature,

        weather_code:
          weatherCode,

        description:
          getWeatherDescription(
            weatherCode
          ),

        icon:
          getWeatherIcon(
            weatherCode,
            isDay
          ),

        is_day:
          isDay,
      },
    });
  } catch (error) {
    console.error(
      "GET /api/weather:",
      error
    );

    return NextResponse.json(
      {
        ok: false,

        error:
          "No se pudo obtener el clima",
      },
      {
        status: 500,
      }
    );
  }
}
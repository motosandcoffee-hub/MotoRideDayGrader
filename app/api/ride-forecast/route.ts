import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const latitude = searchParams.get("latitude");
  const longitude = searchParams.get("longitude");
  const timezone = searchParams.get("timezone") || "America/Vancouver";

  if (!latitude || !longitude) {
    return NextResponse.json({ error: "Missing latitude or longitude." }, { status: 400 });
  }

  try {
    const forecastParams = new URLSearchParams({
      latitude,
      longitude,
      timezone,
      forecast_days: "7",
      models: "gem_global",
      hourly: "temperature_2m,precipitation,snowfall,relative_humidity_2m,is_day",
      daily: "temperature_2m_min,temperature_2m_max,precipitation_sum,snowfall_sum,sunrise,sunset"
    });

    const forecastRes = await fetch(`https://api.open-meteo.com/v1/forecast?${forecastParams.toString()}`, {
      cache: "no-store"
    });

    if (!forecastRes.ok) {
      return NextResponse.json({ error: "Forecast request failed." }, { status: 500 });
    }

    const forecast = await forecastRes.json();

    const bboxPad = 0.35;
    const bbox = [
      Number(longitude) - bboxPad,
      Number(latitude) - bboxPad,
      Number(longitude) + bboxPad,
      Number(latitude) + bboxPad
    ].join(",");

    let alerts: any[] = [];
    try {
      const alertsRes = await fetch(
        `https://api.weather.gc.ca/collections/weather-alerts/items?lang=en&f=json&limit=50&bbox=${bbox}`,
        { cache: "no-store" }
      );
      if (alertsRes.ok) {
        const alertJson = await alertsRes.json();
        alerts = alertJson.features ?? [];
      }
    } catch {
      alerts = [];
    }

    return NextResponse.json({ forecast, alerts });
  } catch {
    return NextResponse.json({ error: "Failed to fetch ride forecast." }, { status: 500 });
  }
}

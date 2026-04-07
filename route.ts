import { NextRequest, NextResponse } from "next/server";

async function geocodeLocation(search: string) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(search)}&count=1&language=en&format=json`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Location lookup failed.");
  const data = await res.json();
  if (!data.results?.length) throw new Error("No matching location found.");
  const match = data.results[0];
  return {
    name: [match.name, match.admin1, match.country_code].filter(Boolean).join(", "),
    latitude: match.latitude,
    longitude: match.longitude,
    timezone: match.timezone || "America/Vancouver",
  };
}

async function fetchForecast(location: { latitude: number; longitude: number; timezone: string }) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: location.timezone,
    forecast_days: "7",
    models: "gem_global",
    hourly: ["temperature_2m", "precipitation", "snowfall", "relative_humidity_2m", "is_day"].join(","),
    daily: ["temperature_2m_min", "temperature_2m_max", "precipitation_sum", "snowfall_sum", "sunrise", "sunset"].join(","),
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Forecast request failed.");
  return await res.json();
}

async function fetchAlerts(location: { latitude: number; longitude: number }) {
  const pad = 0.35;
  const bbox = [
    location.longitude - pad,
    location.latitude - pad,
    location.longitude + pad,
    location.latitude + pad,
  ].join(",");
  try {
    const res = await fetch(`https://api.weather.gc.ca/collections/weather-alerts/items?lang=en&f=json&limit=50&bbox=${bbox}`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.features ?? [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const search = url.searchParams.get("search");

    let location;
    if (search) {
      location = await geocodeLocation(search);
    } else {
      const latitude = Number(url.searchParams.get("latitude"));
      const longitude = Number(url.searchParams.get("longitude"));
      const timezone = url.searchParams.get("timezone") || "America/Vancouver";
      const name = url.searchParams.get("name") || "Selected location";
      if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
        return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
      }
      location = { name, latitude, longitude, timezone };
    }

    const [forecast, alerts] = await Promise.all([
      fetchForecast(location),
      fetchAlerts(location),
    ]);

    return NextResponse.json({ location, forecast, alerts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load data." }, { status: 500 });
  }
}

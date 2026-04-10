import type { LocationInput, RideSettings, ScoringModel } from "@/lib/types";

export const DEFAULT_LOCATION: LocationInput = {
  name: "Delta, BC",
  latitude: 49.0847,
  longitude: -123.0586,
  timezone: "America/Vancouver"
};

export const DEFAULT_SCORING_MODEL: ScoringModel = {
  precipitation: [
    { grade: "A+", maxMm: 0 },
    { grade: "A", maxMm: 0.05 },
    { grade: "B", maxMm: 0.6 },
    { grade: "C", maxMm: 3 },
    { grade: "D", maxMm: 999 }
  ],
  temperature: [
    { grade: "D", minC: -50, maxC: 2.9 },
    { grade: "C", minC: 3, maxC: 4.9 },
    { grade: "B", minC: 5, maxC: 9.9 },
    { grade: "B+", minC: 10, maxC: 14.9 },
    { grade: "A", minC: 15, maxC: 19.9 },
    { grade: "A+", minC: 20, maxC: 27.9 },
    { grade: "A", minC: 28, maxC: 30.9 },
    { grade: "C", minC: 31, maxC: 35.9 },
    { grade: "D", minC: 36, maxC: 40 },
    { grade: "F", minC: 40.1, maxC: 60 }
  ]
};

export const DEFAULT_SETTINGS: RideSettings = {
  weekdayMorningStart: 7,
  weekdayMorningEnd: 9,
  weekdayEveningStart: 17,
  weekdayEveningEnd: 18,
  weekendMorningStart: 9,
  weekendMorningEnd: 12,
  weekendMiddayStart: 12,
  weekendMiddayEnd: 16,
  weekendLateStart: 16,
  weekendLateEnd: 19,
  briefingHour: 7,
  briefingMinute: 0,
  scoringModel: DEFAULT_SCORING_MODEL,
  savedLocation: DEFAULT_LOCATION
};

export async function geocodeLocation(search: string): Promise<LocationInput> {
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
    timezone: match.timezone || DEFAULT_LOCATION.timezone
  };
}

export async function fetchRideForecast(location: LocationInput) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: location.timezone,
    forecast_days: "7",
    models: "gem_global",
    hourly: ["temperature_2m", "precipitation", "snowfall", "cloud_cover", "relative_humidity_2m", "is_day"].join(","),
    daily: ["temperature_2m_min", "temperature_2m_max", "precipitation_sum", "snowfall_sum", "sunrise", "sunset"].join(",")
  });

  const forecastRes = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { cache: "no-store" });
  if (!forecastRes.ok) throw new Error("Forecast request failed.");
  const forecast = await forecastRes.json();

  const bboxPad = 0.35;
  const bbox = [
    location.longitude - bboxPad,
    location.latitude - bboxPad,
    location.longitude + bboxPad,
    location.latitude + bboxPad
  ].join(",");

  let alerts: any[] = [];
  try {
    const alertsRes = await fetch(`https://api.weather.gc.ca/collections/weather-alerts/items?lang=en&f=json&limit=50&bbox=${bbox}`, { cache: "no-store" });
    if (alertsRes.ok) {
      const alertJson = await alertsRes.json();
      alerts = alertJson.features ?? [];
    }
  } catch {
    alerts = [];
  }

  return { forecast, alerts };
}

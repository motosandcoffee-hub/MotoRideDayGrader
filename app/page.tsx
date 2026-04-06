
"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";

type Settings = {
  weekdayMorningStart: number;
  weekdayMorningEnd: number;
  weekdayEveningStart: number;
  weekdayEveningEnd: number;
  weekendMorningStart: number;
  weekendMorningEnd: number;
  weekendMiddayStart: number;
  weekendMiddayEnd: number;
  weekendLateStart: number;
  weekendLateEnd: number;
  savedLocation: {
    name: string;
    latitude: number;
    longitude: number;
    timezone: string;
  };
};

const DEFAULT_LOCATION = {
  name: "Delta, BC",
  latitude: 49.0847,
  longitude: -123.0586,
  timezone: "America/Vancouver",
};

const DEFAULT_SETTINGS: Settings = {
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
  savedLocation: DEFAULT_LOCATION,
};

const STORAGE_KEY = "ride-day-grader-settings-v1";
const GRADE_STEPS = ["F", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"] as const;
const GRADE_INDEX: Record<string, number> = Object.fromEntries(GRADE_STEPS.map((grade, index) => [grade, index]));
type Grade = typeof GRADE_STEPS[number];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function shiftGrade(grade: Grade, halfSteps: number): Grade {
  const current = GRADE_INDEX[grade] ?? 0;
  const next = clamp(current + halfSteps, 0, GRADE_STEPS.length - 1);
  return GRADE_STEPS[next];
}

function averageGrades(grades: Grade[]): Grade {
  const avg = grades.reduce((sum, grade) => sum + GRADE_INDEX[grade], 0) / grades.length;
  return GRADE_STEPS[Math.round(avg)];
}

function precipitationBand(mm: number) {
  if (mm <= 0.05) return 0;
  if (mm <= 0.6) return 1;
  if (mm <= 3) return 2;
  return 3;
}

function precipitationGrade(mm: number, hasSnow: boolean): Grade {
  if (hasSnow) return "F";
  if (mm <= 0.05) return "A";
  if (mm <= 0.6) return "B";
  if (mm <= 3) return "C";
  return "D";
}

function temperatureBand(tempC: number) {
  if (tempC < 5) return 0;
  if (tempC <= 9) return 1;
  if (tempC <= 19) return 2;
  if (tempC <= 30) return 3;
  return 4;
}

function temperatureGrade(tempC: number): Grade {
  if (tempC > 30) return "B";
  if (tempC >= 20) return "A";
  if (tempC >= 10) return "B";
  if (tempC >= 5) return "C";
  return "D";
}

function gradeClass(grade: Grade) {
  if (grade.startsWith("A")) return "badge badge-a";
  if (grade.startsWith("B")) return "badge badge-b";
  if (grade.startsWith("C")) return "badge badge-c";
  if (grade.startsWith("D")) return "badge badge-d";
  return "badge badge-f";
}

function getLocalDateKey(time: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(time));
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function getLocalHour(time: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(time));
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

function formatDisplayDate(dateStr: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(`${dateStr}T12:00:00`));
}

function formatTime(hour: number) {
  return new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(`2026-01-01T${String(hour).padStart(2, "0")}:00:00`));
}

function isWeekend(dateStr: string) {
  const day = new Date(`${dateStr}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

function getRideWindows(dateStr: string, settings: Settings) {
  if (isWeekend(dateStr)) {
    return [
      { key: "late-morning", label: "Late morning", startHour: settings.weekendMorningStart, endHour: settings.weekendMorningEnd },
      { key: "midday", label: "Midday", startHour: settings.weekendMiddayStart, endHour: settings.weekendMiddayEnd },
      { key: "late-day", label: "Late day", startHour: settings.weekendLateStart, endHour: settings.weekendLateEnd },
    ];
  }
  return [
    { key: "am", label: "AM commute", startHour: settings.weekdayMorningStart, endHour: settings.weekdayMorningEnd },
    { key: "pm", label: "PM commute", startHour: settings.weekdayEveningStart, endHour: settings.weekdayEveningEnd },
  ];
}

function summarizeAlertFeature(feature: any) {
  const properties = feature.properties ?? {};
  return {
    title: properties.event || properties.title || "Weather alert",
    description: properties.description || properties.headline || properties.instruction || "",
  };
}

function isWindWarning(alert: { title: string; description: string }) {
  const haystack = `${alert.title} ${alert.description}`.toLowerCase();
  return haystack.includes("wind warning") || haystack.includes("high wind") || haystack.includes("damaging wind");
}

function getPreviousDateKey(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readStoredSettings(): Settings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(settings: Settings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export default function Page() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [locationQuery, setLocationQuery] = useState(DEFAULT_LOCATION.name);
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [forecast, setForecast] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = readStoredSettings();
    setSettings(stored);
    setLocation(stored.savedLocation || DEFAULT_LOCATION);
    setLocationQuery((stored.savedLocation || DEFAULT_LOCATION).name);
    void refresh(stored.savedLocation || DEFAULT_LOCATION);
  }, []);

  useEffect(() => {
    persistSettings(settings);
  }, [settings]);

  async function geocode(search: string) {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(search)}&count=1&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Location lookup failed.");
    const data = await res.json();
    if (!data.results?.length) throw new Error("No matching location found.");
    const match = data.results[0];
    return {
      name: [match.name, match.admin1, match.country_code].filter(Boolean).join(", "),
      latitude: match.latitude,
      longitude: match.longitude,
      timezone: match.timezone || DEFAULT_LOCATION.timezone,
    };
  }

  async function refresh(nextLocation = location) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        name: nextLocation.name,
        latitude: String(nextLocation.latitude),
        longitude: String(nextLocation.longitude),
        timezone: nextLocation.timezone,
      });
      const res = await fetch(`/api/ride-forecast?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load forecast.");
      setForecast(data.forecast);
      setAlerts(data.alerts ?? []);
    } catch (err: any) {
      setError(err?.message || "Failed to load ride forecast.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const nextLocation = await geocode(locationQuery);
      setLocation(nextLocation);
      setSettings((current) => ({ ...current, savedLocation: nextLocation }));
      await refresh(nextLocation);
    } catch (err: any) {
      setError(err?.message || "Location update failed.");
      setLoading(false);
    }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const nextLocation = {
          name: "Current location",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_LOCATION.timezone,
        };
        setLocation(nextLocation);
        setLocationQuery("Current location");
        setSettings((current) => ({ ...current, savedLocation: nextLocation }));
        await refresh(nextLocation);
      },
      () => setError("Could not access your location."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const gradedDays = useMemo(() => {
    if (!forecast?.hourly?.time?.length || !forecast?.daily?.time?.length) return [];

    const hourlyRows = forecast.hourly.time.map((time: string, index: number) => ({
      time,
      dateKey: getLocalDateKey(time, forecast.timezone),
      hour: getLocalHour(time, forecast.timezone),
      temperature_2m: forecast.hourly.temperature_2m?.[index] ?? 0,
      precipitation: forecast.hourly.precipitation?.[index] ?? 0,
      snowfall: forecast.hourly.snowfall?.[index] ?? 0,
      relative_humidity_2m: forecast.hourly.relative_humidity_2m?.[index] ?? 0,
      is_day: forecast.hourly.is_day?.[index] ?? 1,
    }));

    const dailyRows = forecast.daily.time.map((dateStr: string, index: number) => ({
      dateStr,
      temperatureMin: forecast.daily.temperature_2m_min?.[index] ?? 0,
      temperatureMax: forecast.daily.temperature_2m_max?.[index] ?? 0,
      precipitationSum: forecast.daily.precipitation_sum?.[index] ?? 0,
      snowfallSum: forecast.daily.snowfall_sum?.[index] ?? 0,
    }));

    const byDate = new Map<string, any[]>();
    for (const row of hourlyRows) {
      if (!byDate.has(row.dateKey)) byDate.set(row.dateKey, []);
      byDate.get(row.dateKey)!.push(row);
    }

    const normalizedAlerts = alerts.map(summarizeAlertFeature);
    const windWarning = normalizedAlerts.some(isWindWarning);

    return dailyRows.map((dailyRow: any) => {
      const dayRows = byDate.get(dailyRow.dateStr) ?? [];
      const previousDay = byDate.get(getPreviousDateKey(dailyRow.dateStr)) ?? [];
      const overnightRows = [
        ...previousDay.filter((row) => row.hour >= 21),
        ...dayRows.filter((row) => row.hour <= 7),
      ];

      const minTemp = overnightRows.length ? Math.min(...overnightRows.map((r) => r.temperature_2m)) : 99;
      const totalPrecipOvernight = overnightRows.reduce((sum, r) => sum + (r.precipitation ?? 0), 0);
      const maxHumidity = overnightRows.length ? Math.max(...overnightRows.map((r) => r.relative_humidity_2m ?? 0)) : 0;
      const snowOvernight = overnightRows.some((r) => (r.snowfall ?? 0) > 0);
      const saltLikely = minTemp <= 0 && (totalPrecipOvernight >= 0.05 || maxHumidity >= 85 || snowOvernight);
      const saltReasons = [
        minTemp <= 0 ? `overnight low ${minTemp.toFixed(1)}°C` : null,
        totalPrecipOvernight >= 0.05 ? `${totalPrecipOvernight.toFixed(1)} mm overnight precipitation` : null,
        maxHumidity >= 85 ? `${Math.round(maxHumidity)}% peak overnight humidity` : null,
        snowOvernight ? "snow signal present overnight" : null,
      ].filter(Boolean) as string[];

      const snowLikely = dailyRow.snowfallSum > 0 || dayRows.some((row) => row.snowfall > 0);
      const baselineTemp = (dailyRow.temperatureMin + dailyRow.temperatureMax) / 2;
      const dayPrecipPerHour = dayRows.length ? dailyRow.precipitationSum / dayRows.length : dailyRow.precipitationSum;

      const windows = getRideWindows(dailyRow.dateStr, settings).map((window) => {
        const rows = dayRows.filter((row) => row.hour >= window.startHour && row.hour <= window.endHour);
        const avgTemp = rows.length ? rows.reduce((sum, row) => sum + row.temperature_2m, 0) / rows.length : baselineTemp;
        const totalPrecip = rows.reduce((sum, row) => sum + row.precipitation, 0);
        const precipPerHour = rows.length ? totalPrecip / rows.length : dayPrecipPerHour;
        const windowHasSnow = snowLikely || rows.some((row) => row.snowfall > 0);

        const precipBase = precipitationGrade(dailyRow.precipitationSum, windowHasSnow);
        let precipGrade = precipBase;
        const dayBand = precipitationBand(dayPrecipPerHour);
        const windowBand = precipitationBand(precipPerHour);
        if (!windowHasSnow) {
          if (windowBand < dayBand) precipGrade = shiftGrade(precipBase, 1);
          if (windowBand > dayBand) precipGrade = shiftGrade(precipBase, -1);
        }

        const tempBase = temperatureGrade(baselineTemp);
        let tempGrade = tempBase;
        const baseTempBand = temperatureBand(baselineTemp);
        const windowTempBand = temperatureBand(avgTemp);
        if (windowTempBand > baseTempBand) tempGrade = shiftGrade(tempBase, 1);
        if (windowTempBand < baseTempBand) tempGrade = shiftGrade(tempBase, -1);

        let grade = averageGrades([precipGrade, tempGrade]);
        const penalties: string[] = [];

        const darkness = rows.some((row) => row.is_day !== 1);
        if (darkness) {
          grade = shiftGrade(grade, -2);
          penalties.push("darkness");
        }
        if (windWarning) {
          grade = shiftGrade(grade, -2);
          penalties.push("wind warning");
        }
        if (saltLikely || windowHasSnow) {
          grade = "F";
          if (saltLikely) penalties.push("salt risk");
          if (windowHasSnow) penalties.push("snow");
        }

        return {
          ...window,
          grade,
          precipGrade,
          tempGrade,
          avgTemp,
          totalPrecip,
          penalties,
          timeText: `${formatTime(window.startHour)}–${formatTime(window.endHour)}`,
        };
      });

      let overallGrade = averageGrades(windows.map((window) => window.grade));
      if (snowLikely || saltLikely) overallGrade = "F";

      let summary = "Avoid riding";
      if (["A+", "A", "A-"].includes(overallGrade)) summary = "Excellent riding conditions";
      else if (["B+", "B", "B-"].includes(overallGrade)) summary = "Good riding conditions with minor compromises";
      else if (["C+", "C", "C-"].includes(overallGrade)) summary = "Rideable, but notably compromised";
      else if (["D+", "D"].includes(overallGrade)) summary = "Poor riding day";

      return {
        label: formatDisplayDate(dailyRow.dateStr, forecast.timezone),
        overallGrade,
        summary,
        windows,
        snowLikely,
        saltLikely,
        saltReasons,
        tempMin: dailyRow.temperatureMin,
        tempMax: dailyRow.temperatureMax,
        baselineTemp,
        dailyPrecip: dailyRow.precipitationSum,
        windWarning,
      };
    });
  }, [forecast, alerts, settings]);

  const today = gradedDays[0] ?? null;

  return (
    <main className="container">
      <div className="grid" style={{ gap: 24 }}>
        <div className="grid-2">
          <section className="card">
            <div className="grid" style={{ gap: 14 }}>
              <div className="small muted">{location.name}</div>
              <div className="grid" style={{ gap: 8 }}>
                <h1>Ride Day Grader</h1>
                <p className="muted">
                  A stripped-down, deploy-safe version of the motorcycle ride-day forecast app.
                </p>
              </div>

              <form onSubmit={handleSearch} className="row">
                <div style={{ flex: 1, minWidth: 220 }}>
                  <input
                    value={locationQuery}
                    onChange={(event) => setLocationQuery(event.target.value)}
                    placeholder="Search location"
                  />
                </div>
                <button type="submit" disabled={loading}>{loading ? "Loading..." : "Update"}</button>
                <button type="button" className="secondary" onClick={handleUseMyLocation}>Use my location</button>
              </form>

              <div className="row small muted">
                <span>{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</span>
                <span>•</span>
                <span>{location.timezone}</span>
                <span style={{ marginLeft: "auto" }}>
                  <button type="button" className="secondary" onClick={() => refresh()} disabled={loading}>Refresh</button>
                </span>
              </div>

              {error ? <div className="alert">{error}</div> : null}
            </div>
          </section>

          <section className="card">
            <div className="grid" style={{ gap: 14 }}>
              <div>
                <h2>Today at a glance</h2>
                <p className="small muted">{today ? "Your nearest-term ride decision" : "Loading ride outlook"}</p>
              </div>

              {today ? (
                <div className="grid" style={{ gap: 14 }}>
                  <div className="row space-between">
                    <div>
                      <div className="small muted">{today.label}</div>
                      <div style={{ fontSize: 40, fontWeight: 700 }}>{today.overallGrade}</div>
                    </div>
                    <span className={gradeClass(today.overallGrade)}>{today.summary}</span>
                  </div>

                  <div className="grid">
                    {today.windows.map((window) => (
                      <div key={window.key} className="metric">
                        <div className="row space-between">
                          <div>
                            <div style={{ fontWeight: 700 }}>{window.label}</div>
                            <div className="small muted">{window.timeText}</div>
                          </div>
                          <span className={gradeClass(window.grade)}>{window.grade}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <div className="small muted">Loading...</div>}
            </div>
          </section>
        </div>

        <section className="card">
          <div className="grid" style={{ gap: 10 }}>
            <div>
              <h2 className="section-title">Ride windows</h2>
              <p className="small muted">Saved locally on this device.</p>
            </div>
            <div className="settings-grid">
              {[
                ["weekdayMorningStart", "Weekday AM start"],
                ["weekdayMorningEnd", "Weekday AM end"],
                ["weekdayEveningStart", "Weekday PM start"],
                ["weekdayEveningEnd", "Weekday PM end"],
                ["weekendMorningStart", "Weekend late morning start"],
                ["weekendMorningEnd", "Weekend late morning end"],
                ["weekendMiddayStart", "Weekend midday start"],
                ["weekendMiddayEnd", "Weekend midday end"],
                ["weekendLateStart", "Weekend late day start"],
                ["weekendLateEnd", "Weekend late day end"],
              ].map(([key, label]) => (
                <div key={key}>
                  <div className="small muted" style={{ marginBottom: 6 }}>{label}</div>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    value={(settings as any)[key]}
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, [key]: Number(event.target.value) }))
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid">
          {gradedDays.map((day) => (
            <article key={day.label} className="card">
              <div className="grid" style={{ gap: 16 }}>
                <div className="row space-between">
                  <div>
                    <h2>{day.label}</h2>
                    <p className="small muted">{day.summary}</p>
                  </div>
                  <div className="row">
                    <span className={gradeClass(day.overallGrade)}>Overall {day.overallGrade}</span>
                    {day.snowLikely ? <span className="badge badge-f">Snow fail</span> : null}
                  </div>
                </div>

                <div className="grid-3">
                  {day.windows.map((window) => (
                    <div key={window.key} className="metric">
                      <div className="row space-between">
                        <div>
                          <div style={{ fontWeight: 700 }}>{window.label}</div>
                          <div className="small muted">{window.timeText}</div>
                        </div>
                        <span className={gradeClass(window.grade)}>{window.grade}</span>
                      </div>
                      <div style={{ height: 10 }} />
                      <div className="small">Precipitation: {window.precipGrade}</div>
                      <div className="small muted">{window.totalPrecip.toFixed(1)} mm in window</div>
                      <div style={{ height: 8 }} />
                      <div className="small">Temperature: {window.tempGrade}</div>
                      <div className="small muted">{window.avgTemp.toFixed(1)}°C average</div>
                      {window.penalties.length ? (
                        <>
                          <div style={{ height: 8 }} />
                          <div className="small muted">Penalties: {window.penalties.join(", ")}</div>
                        </>
                      ) : null}
                    </div>
                  ))}
                </div>

                <hr />

                <div className="grid-4">
                  <div className="metric">
                    <div style={{ fontWeight: 700 }}>Daily precipitation</div>
                    <div>{day.dailyPrecip.toFixed(1)} mm</div>
                    <div className="small muted">{day.snowLikely ? "Snow signal present" : "No snow signal"}</div>
                  </div>
                  <div className="metric">
                    <div style={{ fontWeight: 700 }}>Temperature range</div>
                    <div>{day.tempMin.toFixed(0)}° to {day.tempMax.toFixed(0)}°C</div>
                    <div className="small muted">Baseline {day.baselineTemp.toFixed(1)}°C</div>
                  </div>
                  <div className="metric">
                    <div style={{ fontWeight: 700 }}>Wind alerts</div>
                    <div>{day.windWarning ? "Wind warning active" : "No wind warning"}</div>
                    <div className="small muted">{day.windWarning ? "All ride grades downgraded one letter" : "No alert penalty"}</div>
                  </div>
                  <div className="metric">
                    <div style={{ fontWeight: 700 }}>Road salt risk</div>
                    <div>{day.saltLikely ? "Likely" : "Unlikely"}</div>
                    <div className="small muted">{day.saltLikely ? day.saltReasons.join("; ") : "No fail trigger"}</div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="card">
          <div className="grid" style={{ gap: 10 }}>
            <div>
              <h2 className="section-title">Scoring model</h2>
              <p className="small muted">Plain-English rules implemented in this stripped-down version.</p>
            </div>
            <div className="grid-4">
              <div className="metric">
                <div style={{ fontWeight: 700 }}>Precipitation</div>
                <div className="small muted">Snow = F. No rain = A. Very light rain = B. Moderate rain = C. Heavy rain = D. Ride windows can shift by half a grade.</div>
              </div>
              <div className="metric">
                <div style={{ fontWeight: 700 }}>Temperature</div>
                <div className="small muted">20–30°C = A. Above 30°C = B. 10–19°C = B. 5–9°C = C. Below 5°C = D. Ride windows can shift by half a grade.</div>
              </div>
              <div className="metric">
                <div style={{ fontWeight: 700 }}>Penalties</div>
                <div className="small muted">Wind warnings downgrade ride grades one full letter. Darkness during a ride window downgrades that window one full letter.</div>
              </div>
              <div className="metric">
                <div style={{ fontWeight: 700 }}>Road salt proxy</div>
                <div className="small muted">A conservative fail trigger based on overnight freezing plus precipitation, humidity, or snow indicators.</div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { buildDayResults, gradeTone } from "@/lib/scoring";
import { DEFAULT_LOCATION, DEFAULT_SETTINGS, geocodeLocation } from "@/lib/weather";

const STORAGE_KEY = "ride-day-grader-settings-v1";

type IconKey = "sun" | "partly-cloudy" | "cloud" | "drizzle" | "rain" | "snow" | "ice";

function readStoredSettings() {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function persistSettings(nextSettings: typeof DEFAULT_SETTINGS) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextSettings));
}

function getLocalDateKey(time: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
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
    hour12: false
  }).formatToParts(new Date(time));
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0);
}

function isWeekend(dateStr: string) {
  const day = new Date(`${dateStr}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

function getRideWindows(dateStr: string, settings: typeof DEFAULT_SETTINGS) {
  if (isWeekend(dateStr)) {
    return [
      { key: "late-morning", label: "Late morning", startHour: settings.weekendMorningStart, endHour: settings.weekendMorningEnd },
      { key: "midday", label: "Midday", startHour: settings.weekendMiddayStart, endHour: settings.weekendMiddayEnd },
      { key: "late-day", label: "Late day", startHour: settings.weekendLateStart, endHour: settings.weekendLateEnd }
    ];
  }

  return [
    { key: "am", label: "AM commute", startHour: settings.weekdayMorningStart, endHour: settings.weekdayMorningEnd },
    { key: "pm", label: "PM commute", startHour: settings.weekdayEveningStart, endHour: settings.weekdayEveningEnd }
  ];
}

function WeatherIcon({ kind, size = 28 }: { kind: IconKey; size?: number }) {
  const stroke = "currentColor";
  const fill = "none";
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill,
    stroke,
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true
  };

  if (kind === "sun") {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="4.2" />
        <path d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
      </svg>
    );
  }

  if (kind === "partly-cloudy") {
    return (
      <svg {...props}>
        <circle cx="9" cy="9" r="3.2" />
        <path d="M9 3.2v1.5M9 13.3v1.5M4.9 4.9 6 6M12 12l1.1 1.1M3.2 9h1.5M12.3 9h1.5" />
        <path d="M8.8 18.2h8a3.2 3.2 0 0 0 .4-6.4 4.8 4.8 0 0 0-9.1-.8 3.2 3.2 0 0 0 .7 7.2Z" />
      </svg>
    );
  }

  if (kind === "cloud") {
    return (
      <svg {...props}>
        <path d="M7.5 18.2h9.1a3.7 3.7 0 0 0 .4-7.4 5.6 5.6 0 0 0-10.7-.9 3.7 3.7 0 0 0 1.2 8.3Z" />
      </svg>
    );
  }

  if (kind === "drizzle") {
    return (
      <svg {...props}>
        <path d="M7.5 15.4h9.1a3.7 3.7 0 0 0 .4-7.4 5.6 5.6 0 0 0-10.7-.9 3.7 3.7 0 0 0 1.2 8.3Z" />
        <path d="M9 18.2 8.2 20M13 18.2 12.2 20M17 18.2 16.2 20" />
      </svg>
    );
  }

  if (kind === "rain") {
    return (
      <svg {...props}>
        <path d="M7.5 14.9h9.1a3.7 3.7 0 0 0 .4-7.4 5.6 5.6 0 0 0-10.7-.9 3.7 3.7 0 0 0 1.2 8.3Z" />
        <path d="M8.8 17.5 7.8 20M12.8 17.5 11.8 20M16.8 17.5 15.8 20" />
      </svg>
    );
  }

  if (kind === "ice") {
    return (
      <svg {...props}>
        <path d="M12 3.5v17" />
        <path d="M5.7 7.2 18.3 16.8" />
        <path d="M18.3 7.2 5.7 16.8" />
        <path d="M12 3.5 9.8 5.7M12 3.5l2.2 2.2M12 20.5l-2.2-2.2M12 20.5l2.2-2.2" />
        <path d="M5.7 7.2 6 10.3M5.7 7.2l3 .6M18.3 16.8l-3-.6M18.3 16.8l-.3-3.1" />
        <path d="M18.3 7.2l-3 .6M18.3 7.2l-.3 3.1M5.7 16.8l3-.6M5.7 16.8l.3-3.1" />
      </svg>
    );
  }

  return (
    <svg {...props}>
      <path d="M7.5 14.9h9.1a3.7 3.7 0 0 0 .4-7.4 5.6 5.6 0 0 0-10.7-.9 3.7 3.7 0 0 0 1.2 8.3Z" />
      <path d="M9.2 17.7l-.6 2.1M14.8 17.7l-.6 2.1" />
      <path d="M11.6 16.6 10.2 19M15.9 16.6 14.5 19" />
    </svg>
  );
}

function getWeatherVisual(rows: any[]): { kind: IconKey; label: string } {
  if (!rows.length) return { kind: "cloud", label: "Forecast pending" };

  const totalSnow = rows.reduce((sum, row) => sum + (row.snowfall ?? 0), 0);
  const totalPrecip = rows.reduce((sum, row) => sum + (row.precipitation ?? 0), 0);
  const maxPrecip = Math.max(...rows.map((row) => row.precipitation ?? 0));
  const avgCloud = rows.reduce((sum, row) => sum + (row.cloud_cover ?? 0), 0) / rows.length;
  const minTemp = Math.min(...rows.map((row) => row.temperature_2m ?? 99));
  const maxHumidity = Math.max(...rows.map((row) => row.relative_humidity_2m ?? 0));
  const anyDaylight = rows.some((row) => row.is_day === 1);

  if (totalSnow > 0) return { kind: "snow", label: "Snow" };
  if (minTemp <= 0 && (totalPrecip >= 0.1 || maxPrecip > 0.05 || maxHumidity >= 90)) {
    return { kind: "ice", label: "Icy risk" };
  }
  if (totalPrecip >= 2 || maxPrecip >= 1) return { kind: "rain", label: "Rain" };
  if (totalPrecip >= 0.1 || maxPrecip > 0.05) return { kind: "drizzle", label: "Light precipitation" };
  if (avgCloud >= 70) return { kind: "cloud", label: "Cloudy" };
  if (avgCloud >= 35) return { kind: "partly-cloudy", label: anyDaylight ? "Partly cloudy" : "Variable cloud" };
  return { kind: "sun", label: anyDaylight ? "Sunny" : "Clear" };
}

function buildWeatherPresentation(forecast: any, settings: typeof DEFAULT_SETTINGS) {
  const hourlyRows = forecast.hourly.time.map((time: string, index: number) => ({
    time,
    dateKey: getLocalDateKey(time, forecast.timezone),
    hour: getLocalHour(time, forecast.timezone),
    temperature_2m: forecast.hourly.temperature_2m?.[index] ?? 0,
    precipitation: forecast.hourly.precipitation?.[index] ?? 0,
    snowfall: forecast.hourly.snowfall?.[index] ?? 0,
    cloud_cover: forecast.hourly.cloud_cover?.[index] ?? 0,
    relative_humidity_2m: forecast.hourly.relative_humidity_2m?.[index] ?? 0,
    is_day: forecast.hourly.is_day?.[index] ?? 1
  }));

  const byDate = new Map<string, any[]>();
  for (const row of hourlyRows) {
    if (!byDate.has(row.dateKey)) byDate.set(row.dateKey, []);
    byDate.get(row.dateKey)!.push(row);
  }

  return forecast.daily.time.map((dateStr: string) => {
    const dayRows = byDate.get(dateStr) ?? [];
    const dayWeather = getWeatherVisual(dayRows);
    const windows = getRideWindows(dateStr, settings).map((window) => {
      const windowRows = dayRows.filter((row) => row.hour >= window.startHour && row.hour <= window.endHour);
      const weather = getWeatherVisual(windowRows.length ? windowRows : dayRows);
      return {
        key: window.key,
        iconKind: weather.kind,
        iconLabel: weather.label
      };
    });

    return {
      iconKind: dayWeather.kind,
      iconLabel: dayWeather.label,
      windows
    };
  });
}

function DetailsCard({
  title,
  subtitle,
  children
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <details className="cardish bottom-spacing">
      <summary>
        <div className="summary-title">{title}</div>
        <div className="muted spacer-4">{subtitle}</div>
      </summary>
      <div className="details-body">{children}</div>
    </details>
  );
}

function GradeBadge({ grade, label }: { grade: string; label?: string }) {
  const tone = gradeTone(grade as any);
  return <span className={`badge ${tone}`}>{label ?? grade}</span>;
}

function gradeVisualPalette(grade: string) {
  const letter = grade.trim().toUpperCase().charAt(0);

  if (letter === "A") return { background: "#1f8f4d", borderColor: "#35b96d" };
  if (letter === "B") return { background: "#9acd32", borderColor: "#c4ee5c" };
  if (letter === "C") return { background: "#f3d547", borderColor: "#ffe878" };
  if (letter === "D") return { background: "#ef8a24", borderColor: "#ffad55" };
  return { background: "#c83232", borderColor: "#ee5a5a" };
}

function GradeVisual({
  grade,
  iconKind,
  size = "large"
}: {
  grade: string;
  iconKind: IconKey;
  size?: "large" | "medium";
}) {
  const iconSize = size === "large" ? 34 : 26;
  const gradeSize = size === "large" ? 42 : 30;
  const palette = gradeVisualPalette(grade);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 12,
        padding: size === "large" ? "12px 14px" : "10px 12px",
        borderRadius: 18,
        border: `1px solid ${palette.borderColor}`,
        background: palette.background,
        color: "#111827"
      }}
    >
      <WeatherIcon kind={iconKind} size={iconSize} />
      <div style={{ fontSize: gradeSize, fontWeight: 700, lineHeight: 1, letterSpacing: 0 }}>{grade}</div>
    </div>
  );
}

function TodayCard({ today }: { today: any | null }) {
  return (
    <div className="card">
      <div className="card-inner">
        <h2 style={{ fontSize: 28 }}>Today at a glance</h2>
        <p className="muted spacer-8">{today ? "Your nearest-term ride decision" : "Loading ride outlook"}</p>

        {today ? (
          <div className="spacer-16">
            <div className="row space-between wrap" style={{ alignItems: "flex-start" }}>
              <div>
                <div className="muted">{today.label}</div>
                <div className="muted spacer-4">{today.iconLabel}</div>
                <div className="spacer-8">
                  <GradeBadge grade={today.overallGrade} label={today.summary} />
                </div>
              </div>
              <GradeVisual grade={today.overallGrade} iconKind={today.iconKind} size="large" />
            </div>

            {today.surfaceHazardRisk?.likely && (
              <div className="alert spacer-16">
                <div className="alert-title">Fail trigger: likely ice or road salt</div>
                <div>{today.surfaceHazardRisk.reasons.join("; ")}</div>
              </div>
            )}

            <div className="section-stack spacer-16">
              {today.windows.map((window: any) => (
                <div className="window-card" key={window.key}>
                  <div className="row space-between wrap">
                    <div>
                      <div style={{ fontWeight: 700 }}>{window.label}</div>
                      <div className="muted spacer-4">{window.timeText}</div>
                      <div className="muted spacer-4">{window.iconLabel}</div>
                    </div>
                    <GradeVisual grade={window.grade} iconKind={window.iconKind} size="medium" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="muted spacer-12">Loading...</div>
        )}
      </div>
    </div>
  );
}

function DayCard({ day }: { day: any }) {
  return (
    <details className="cardish bottom-spacing">
      <summary>
        <div className="row space-between wrap" style={{ alignItems: "flex-start", gap: 16 }}>
          <div>
            <div>
              <div className="summary-title" style={{ fontSize: 28 }}>{day.label}</div>
              <div className="muted spacer-4">{day.iconLabel}</div>
              <div className="muted spacer-4">{day.summary}</div>
              <div className="muted spacer-8">Tap to expand ride details</div>
            </div>
          </div>

          <div className="row wrap" style={{ justifyContent: "flex-end", gap: 10 }}>
            <GradeVisual grade={day.overallGrade} iconKind={day.iconKind} size="large" />
            {day.snowLikely && <span className="badge bad">Snow fail</span>}
          </div>
        </div>
      </summary>

      <div className="details-body">
        <div className="small-grid">
          <div className="metric-card">
            <div className="title">Daily precipitation</div>
            <div className="value">{day.dailyPrecip.toFixed(1)} mm</div>
            <div className="note">{day.snowLikely ? "Snow signal present" : "No snow signal"}</div>
          </div>
          <div className="metric-card">
            <div className="title">Temperature range</div>
            <div className="value">{day.tempMin.toFixed(0)}° to {day.tempMax.toFixed(0)}°C</div>
            <div className="note">Baseline {day.baselineTemp.toFixed(1)}°C</div>
          </div>
          <div className="metric-card">
            <div className="title">Wind alerts</div>
            <div className="value">{day.windWarning ? "Wind warning active" : "No wind warning"}</div>
            <div className="note">{day.windWarning ? "All ride grades downgraded one letter" : "No alert penalty"}</div>
          </div>
          <div className="metric-card">
            <div className="title">Ice / salt risk</div>
            <div className="value">{day.surfaceHazardRisk.likely ? "Likely" : "Unlikely"}</div>
            <div className="note">{day.surfaceHazardRisk.likely ? `${day.surfaceHazardRisk.confidence} confidence` : "No fail trigger"}</div>
          </div>
        </div>

        {day.surfaceHazardRisk.likely && (
          <div className="alert spacer-20">
            <div className="alert-title">Fail due to likely ice or road salt</div>
            <div>{day.surfaceHazardRisk.reasons.join("; ")}. This is a conservative forecast-based proxy for hazardous road-surface conditions, not a live municipal operations feed.</div>
          </div>
        )}

        <div className="window-grid spacer-20">
          {day.windows.map((window: any) => (
            <div className="window-card" key={window.key}>
              <div className="row space-between wrap" style={{ alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{window.label}</div>
                  <div className="muted spacer-4">{window.timeText}</div>
                  <div className="muted spacer-4">{window.iconLabel}</div>
                </div>
                <GradeVisual grade={window.grade} iconKind={window.iconKind} size="medium" />
              </div>

              <div className="sub-grid spacer-12">
                <div className="sub-box">
                  <div className="muted">Precipitation</div>
                  <div className="spacer-4" style={{ fontWeight: 700 }}>{window.precipGrade}</div>
                  <div className="muted spacer-4">{window.precipSummary}</div>
                </div>
                <div className="sub-box">
                  <div className="muted">Temperature</div>
                  <div className="spacer-4" style={{ fontWeight: 700 }}>{window.tempGrade}</div>
                  <div className="muted spacer-4">{window.tempSummary}</div>
                </div>
              </div>

              {window.penalties.length > 0 && (
                <div className="muted spacer-12">Penalties: {window.penalties.join(", ")}</div>
              )}
            </div>
          ))}
        </div>

        {day.alertTitles.length > 0 && (
          <div className="muted spacer-16">Alerts considered: {day.alertTitles.join(", ")}</div>
        )}
      </div>
    </details>
  );
}

function SettingsPanel({
  settings,
  onSettingsChange
}: {
  settings: typeof DEFAULT_SETTINGS;
  onSettingsChange: (value: typeof DEFAULT_SETTINGS) => void;
}) {
  const fields = [
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
    ["briefingHour", "Briefing hour"],
    ["briefingMinute", "Briefing minute"]
  ] as const;

  return (
    <DetailsCard
      title="Ride windows and preferences"
      subtitle={`Weekday ${settings.weekdayMorningStart}:00–${settings.weekdayMorningEnd}:00 / ${settings.weekdayEveningStart}:00–${settings.weekdayEveningEnd}:00`}
    >
      <div className="settings-grid">
        {fields.map(([key, label]) => (
          <div key={key}>
            <label className="label" htmlFor={key}>{label}</label>
            <input
              id={key}
              type="number"
              min={0}
              max={23}
              step={1}
              value={settings[key]}
              onChange={(event) => onSettingsChange({ ...settings, [key]: Number(event.target.value) })}
            />
          </div>
        ))}
      </div>
    </DetailsCard>
  );
}

export default function RideDayGraderApp() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [locationQuery, setLocationQuery] = useState(DEFAULT_LOCATION.name);
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [forecast, setForecast] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function refresh(nextLocation = location) {
    setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams({
        latitude: String(nextLocation.latitude),
        longitude: String(nextLocation.longitude),
        timezone: nextLocation.timezone,
        name: nextLocation.name
      });

      const response = await fetch(`/api/ride-forecast?${params.toString()}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Forecast request failed.");
      }

      setForecast(payload.forecast);
      setAlerts(payload.alerts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ride forecast.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const stored = readStoredSettings();
    setSettings(stored);
    setLocation(stored.savedLocation || DEFAULT_LOCATION);
    setLocationQuery((stored.savedLocation || DEFAULT_LOCATION).name);
    refresh(stored.savedLocation || DEFAULT_LOCATION);
  }, []);

  useEffect(() => {
    persistSettings(settings);
  }, [settings]);

  async function handleSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");

    try {
      const nextLocation = await geocodeLocation(locationQuery);
      setLocation(nextLocation);
      setSettings((current) => ({ ...current, savedLocation: nextLocation }));
      await refresh(nextLocation);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Location update failed.");
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
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_LOCATION.timezone
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

    const baseDays = buildDayResults(forecast, alerts, settings);
    const weatherPresentation = buildWeatherPresentation(forecast, settings);

    return baseDays.map((day: any, dayIndex: number) => ({
      ...day,
      iconKind: weatherPresentation[dayIndex]?.iconKind ?? "cloud",
      iconLabel: weatherPresentation[dayIndex]?.iconLabel ?? "Forecast pending",
      windows: day.windows.map((window: any, windowIndex: number) => ({
        ...window,
        iconKind: weatherPresentation[dayIndex]?.windows[windowIndex]?.iconKind ?? "cloud",
        iconLabel: weatherPresentation[dayIndex]?.windows[windowIndex]?.iconLabel ?? "Forecast pending"
      }))
    }));
  }, [forecast, alerts, settings]);

  const today = gradedDays[0] ?? null;

  return (
    <main>
      <div className="container">
        <div className="grid-top">
          <div className="card">
            <div className="card-inner">
              <div className="iconline muted">
                <img src="/icon-192.png" alt="Ride Day Grader" width="20" height="20" style={{ borderRadius: 4 }} />
                {location.name}
              </div>

              <div className="spacer-12">
                <h1 className="top-title">Ride Day Grader</h1>
                <p className="muted spacer-8">
                  A motorcycle-specific forecast app that grades your ride day using precipitation,
                  temperature, daylight, wind alerts, and conservative ice / road-salt risk.
                </p>
              </div>

              <form className="form-grid spacer-20" onSubmit={handleSearch}>
                <input
                  placeholder="Search location"
                  value={locationQuery}
                  onChange={(event) => setLocationQuery(event.target.value)}
                />
                <button type="submit" disabled={loading}>{loading ? "Loading..." : "Update"}</button>
                <button type="button" className="secondary" onClick={handleUseMyLocation}>Use my location</button>
              </form>

              <div className="row wrap spacer-16">
                <span className="muted">{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</span>
                <span className="muted">•</span>
                <span className="muted">{location.timezone}</span>
                <button style={{ marginLeft: "auto" }} type="button" className="secondary" onClick={() => refresh()} disabled={loading}>
                  Refresh
                </button>
              </div>

              {error && (
                <div className="alert spacer-16">
                  <div className="alert-title">Unable to load forecast</div>
                  <div>{error}</div>
                </div>
              )}
            </div>
          </div>

          <TodayCard today={today} />
        </div>

        <div className="section-stack">
          {gradedDays.map((day: any) => (
            <DayCard key={day.label} day={day} />
          ))}

          <DetailsCard
            title="Scoring model"
            subtitle="Expand to review the grading and fail-trigger rules."
          >
            <div className="small-grid">
              <div className="metric-card">
                <div className="title">Precipitation</div>
                <div className="note">Snow = F. 0 mm rain = A+. Trace rain = A. Very light rain = B. Moderate rain = C. Heavy rain = D. Ride-window rain can shift by half a grade.</div>
              </div>
              <div className="metric-card">
                <div className="title">Temperature</div>
                <div className="note">20–27°C = A+. 28–30°C and 15–19°C = A. 10–14°C = B+. 5–9°C = B. 3–4°C and 31–35°C = C. 36°C+ or below 3°C = D. Above 40°C = F.</div>
              </div>
              <div className="metric-card">
                <div className="title">Penalties</div>
                <div className="note">Wind warnings downgrade all ride grades one full letter. Darkness during a ride window downgrades that window one full letter.</div>
              </div>
              <div className="metric-card">
                <div className="title">Road surface fail</div>
                <div className="note">A conservative fail trigger based on near-freezing or freezing conditions plus precipitation, humidity, snow, or freeze-thaw timing that may indicate ice or road salt risk.</div>
              </div>
            </div>
          </DetailsCard>

          <SettingsPanel settings={settings} onSettingsChange={setSettings} />
        </div>
      </div>
    </main>
  );
}

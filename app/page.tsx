"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";

type Grade = "F" | "D" | "D+" | "C-" | "C" | "C+" | "B-" | "B" | "B+" | "A-" | "A" | "A+";
type Tone = "good" | "ok" | "warn" | "bad";

type LocationInput = {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

type RideSettings = {
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
  briefingHour: number;
  briefingMinute: number;
  savedLocation: LocationInput;
};

type DayResult = {
  label: string;
  summary: string;
  overallGrade: Grade;
  windows: {
    key: string;
    label: string;
    grade: Grade;
    precipGrade: Grade;
    tempGrade: Grade;
    penalties: string[];
    timeText: string;
    precipSummary: string;
    tempSummary: string;
  }[];
  snowLikely: boolean;
  surfaceHazardRisk: {
    likely: boolean;
    confidence: string;
    iceLikely: boolean;
    saltLikely: boolean;
    reasons: string[];
  };
  tempMin: number;
  tempMax: number;
  baselineTemp: number;
  dailyPrecip: number;
  windWarning: boolean;
  alertTitles: string[];
};

const DEFAULT_LOCATION: LocationInput = {
  name: "Delta, BC",
  latitude: 49.0847,
  longitude: -123.0586,
  timezone: "America/Vancouver",
};

const DEFAULT_SETTINGS: RideSettings = {
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
  savedLocation: DEFAULT_LOCATION,
};

const STORAGE_KEY = "ride-day-grader-settings-v2";
const GRADE_STEPS: Grade[] = ["F", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];
const GRADE_INDEX: Record<Grade, number> = Object.fromEntries(GRADE_STEPS.map((g, i) => [g, i])) as Record<Grade, number>;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
function shiftGrade(grade: Grade, halfSteps: number): Grade {
  return GRADE_STEPS[clamp(GRADE_INDEX[grade] + halfSteps, 0, GRADE_STEPS.length - 1)];
}
function averageGrades(grades: Grade[]): Grade {
  const avg = grades.reduce((sum, grade) => sum + GRADE_INDEX[grade], 0) / grades.length;
  return GRADE_STEPS[Math.round(avg)] ?? "F";
}
function gradeTone(grade: Grade): Tone {
  if (["A+", "A", "A-"].includes(grade)) return "good";
  if (["B+", "B", "B-"].includes(grade)) return "ok";
  if (["C+", "C", "C-"] .includes(grade)) return "warn";
  return "bad";
}
function badgeClass(grade: Grade) {
  return `badge ${gradeTone(grade)}`;
}
function formatClock(hour: number, minute = 0) {
  return new Intl.DateTimeFormat("en-CA", { hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(`2026-01-01T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`));
}
function isWeekend(dateStr: string) {
  const day = new Date(`${dateStr}T12:00:00`).getDay();
  return day === 0 || day === 6;
}
function getRideWindows(dateStr: string, settings: RideSettings) {
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
function precipitationGrade(mm: number, hasSnow: boolean): Grade {
  if (hasSnow) return "F";
  if (mm <= 0.05) return "A";
  if (mm <= 0.6) return "B";
  if (mm <= 3) return "C";
  return "D";
}
function precipitationBand(mm: number) {
  if (mm <= 0.05) return 0;
  if (mm <= 0.6) return 1;
  if (mm <= 3) return 2;
  return 3;
}
function temperatureGrade(tempC: number): Grade {
  if (tempC > 30) return "B";
  if (tempC >= 20) return "A";
  if (tempC >= 10) return "B";
  if (tempC >= 5) return "C";
  return "D";
}
function temperatureBand(tempC: number) {
  if (tempC < 5) return 0;
  if (tempC <= 9) return 1;
  if (tempC <= 19) return 2;
  if (tempC <= 30) return 3;
  return 4;
}
function adjustPrecipitationGrade(dayGrade: Grade, dayMmPerHour: number, windowMmPerHour: number, hasSnow: boolean) {
  if (hasSnow) return "F" as Grade;
  const baseBand = precipitationBand(dayMmPerHour);
  const windowBand = precipitationBand(windowMmPerHour);
  if (windowBand < baseBand) return shiftGrade(dayGrade, 1);
  if (windowBand > baseBand) return shiftGrade(dayGrade, -1);
  return dayGrade;
}
function adjustTemperatureGrade(dayGrade: Grade, baselineTemp: number, windowTemp: number) {
  const baseBand = temperatureBand(baselineTemp);
  const windowBand = temperatureBand(windowTemp);
  if (windowBand > baseBand) return shiftGrade(dayGrade, 1);
  if (windowBand < baseBand) return shiftGrade(dayGrade, -1);
  return dayGrade;
}
function summarizeDay(overallGrade: Grade) {
  if (["A+", "A", "A-"].includes(overallGrade)) return "Excellent riding conditions";
  if (["B+", "B", "B-"].includes(overallGrade)) return "Good riding conditions with minor compromises";
  if (["C+", "C", "C-"].includes(overallGrade)) return "Rideable, but notably compromised";
  if (["D+", "D"].includes(overallGrade)) return "Poor riding day";
  return "Avoid riding";
}
function buildDailyBriefing(day: DayResult | null) {
  if (!day) return "Ride briefing unavailable.";
  const reasons: string[] = [];
  if (day.snowLikely) reasons.push("snow in forecast");
  if (day.surfaceHazardRisk.iceLikely) reasons.push("ice likely");
  if (day.surfaceHazardRisk.saltLikely) reasons.push("road salt likely");
  if (day.windWarning) reasons.push("wind warning active");
  if (!reasons.length) {
    const bestWindow = [...day.windows].sort((a, b) => GRADE_INDEX[b.grade] - GRADE_INDEX[a.grade])[0];
    if (bestWindow) reasons.push(`${bestWindow.label.toLowerCase()} looks strongest`);
  }
  return `${day.label}: overall ${day.overallGrade}. ${day.summary}. ${reasons.join(". ")}.`;
}
function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  return Notification.permission;
}
async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported" as const;
  return await Notification.requestPermission();
}
function sendRideNotification(title: string, body: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return false;
  if (Notification.permission !== "granted") return false;
  new Notification(title, { body });
  return true;
}
function isStandaloneMode() {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || nav.standalone === true);
}
function isiPhoneLike() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}
function formatDisplayDate(dateStr: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, weekday: "short", month: "short", day: "numeric" }).format(new Date(`${dateStr}T12:00:00`));
}

function readStoredSettings(): RideSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export default function Page() {
  const [settings, setSettings] = useState<RideSettings>(DEFAULT_SETTINGS);
  const [locationQuery, setLocationQuery] = useState(DEFAULT_LOCATION.name);
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [forecast, setForecast] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("unsupported");

  useEffect(() => {
    const stored = readStoredSettings();
    setSettings(stored);
    setLocation(stored.savedLocation || DEFAULT_LOCATION);
    setLocationQuery((stored.savedLocation || DEFAULT_LOCATION).name);
    setNotificationPermission(getNotificationPermission());
    void loadForecast(stored.savedLocation || DEFAULT_LOCATION);
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  }, [settings]);

  async function loadForecast(nextLocation = location) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        name: nextLocation.name,
        latitude: String(nextLocation.latitude),
        longitude: String(nextLocation.longitude),
        timezone: nextLocation.timezone,
      });
      const res = await fetch(`/api/ride-forecast?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load forecast.");
      setForecast(data.forecast);
      setAlerts(data.alerts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load forecast.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/ride-forecast?search=${encodeURIComponent(locationQuery)}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Location update failed.");
      setLocation(data.location);
      setSettings((current) => ({ ...current, savedLocation: data.location }));
      setForecast(data.forecast);
      setAlerts(data.alerts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Location update failed.");
    } finally {
      setLoading(false);
    }
  }

  function handleUseMyLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(async (position) => {
      const nextLocation = {
        name: "Current location",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_LOCATION.timezone,
      };
      setLocation(nextLocation);
      setLocationQuery("Current location");
      setSettings((current) => ({ ...current, savedLocation: nextLocation }));
      await loadForecast(nextLocation);
    }, () => setError("Could not access your location."), { enableHighAccuracy: true, timeout: 10000 });
  }

  const gradedDays = useMemo<DayResult[]>(() => {
    if (!forecast?.hourly?.time?.length || !forecast?.daily?.time?.length) return [];

    const hourlyRows = forecast.hourly.time.map((time: string, index: number) => {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: forecast.timezone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        hour12: false,
      }).formatToParts(new Date(time));
      const year = parts.find((p) => p.type === "year")?.value;
      const month = parts.find((p) => p.type === "month")?.value;
      const day = parts.find((p) => p.type === "day")?.value;
      const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
      return {
        dateKey: `${year}-${month}-${day}`,
        hour,
        temperature_2m: forecast.hourly.temperature_2m?.[index] ?? 0,
        precipitation: forecast.hourly.precipitation?.[index] ?? 0,
        snowfall: forecast.hourly.snowfall?.[index] ?? 0,
        relative_humidity_2m: forecast.hourly.relative_humidity_2m?.[index] ?? 0,
        is_day: forecast.hourly.is_day?.[index] ?? 1,
      };
    });

    const byDate = new Map<string, any[]>();
    for (const row of hourlyRows) {
      if (!byDate.has(row.dateKey)) byDate.set(row.dateKey, []);
      byDate.get(row.dateKey)!.push(row);
    }

    const normalizedAlerts = (alerts || []).map((feature: any) => {
      const props = feature.properties || feature;
      return {
        title: props.event || props.title || "Weather alert",
        description: props.description || props.headline || props.instruction || "",
      };
    });
    const windAlerts = normalizedAlerts.filter((alert: any) => `${alert.title} ${alert.description}`.toLowerCase().match(/wind warning|high wind|damaging wind/));
    const windWarning = windAlerts.length > 0;

    return forecast.daily.time.map((dateStr: string, index: number) => {
      const dayRows = byDate.get(dateStr) ?? [];
      const prev = new Date(`${dateStr}T12:00:00`);
      prev.setDate(prev.getDate() - 1);
      const prevKey = prev.toISOString().slice(0, 10);
      const overnightRows = [
        ...((byDate.get(prevKey) ?? []).filter((row: any) => row.hour >= 21)),
        ...dayRows.filter((row: any) => row.hour <= 9),
      ];

      const minTemp = overnightRows.length ? Math.min(...overnightRows.map((r: any) => r.temperature_2m)) : 999;
      const maxTemp = overnightRows.length ? Math.max(...overnightRows.map((r: any) => r.temperature_2m)) : -999;
      const totalPrecip = overnightRows.reduce((sum: number, r: any) => sum + (r.precipitation ?? 0), 0);
      const maxHumidity = overnightRows.length ? Math.max(...overnightRows.map((r: any) => r.relative_humidity_2m ?? 0)) : 0;
      const snowPresent = overnightRows.some((r: any) => (r.snowfall ?? 0) > 0);
      const freezing = minTemp <= 0;
      const thawRefreezeBand = minTemp <= 0 && maxTemp >= 1;
      const strongMoisture = totalPrecip >= 0.2 || maxHumidity >= 90 || snowPresent;
      const moderateMoisture = totalPrecip >= 0.05 || maxHumidity >= 85;
      const iceLikely = freezing && (strongMoisture || moderateMoisture);
      const saltLikely = freezing && (strongMoisture || snowPresent || thawRefreezeBand);
      const surfaceHazardRisk = {
        likely: iceLikely || saltLikely,
        confidence: (iceLikely || saltLikely) ? (strongMoisture || snowPresent ? "high" : "medium") : "low",
        iceLikely,
        saltLikely,
        reasons: [
          freezing ? `surface temperature window reaches ${minTemp.toFixed(1)}°C` : null,
          thawRefreezeBand ? "freeze-thaw pattern could leave slick surfaces" : null,
          totalPrecip >= 0.05 ? `${totalPrecip.toFixed(1)} mm recent precipitation` : null,
          maxHumidity >= 85 ? `${Math.round(maxHumidity)}% peak humidity` : null,
          snowPresent ? "snow signal present" : null,
          iceLikely ? "icy road risk likely" : null,
          saltLikely ? "road salt likely" : null,
        ].filter(Boolean) as string[],
      };

      const tempMin = forecast.daily.temperature_2m_min?.[index] ?? 0;
      const tempMax = forecast.daily.temperature_2m_max?.[index] ?? 0;
      const dailyPrecip = forecast.daily.precipitation_sum?.[index] ?? 0;
      const baselineTemp = (tempMin + tempMax) / 2;
      const snowLikely = (forecast.daily.snowfall_sum?.[index] ?? 0) > 0 || dayRows.some((row: any) => row.snowfall > 0);
      const dayPrecipPerHour = dayRows.length ? dailyPrecip / dayRows.length : dailyPrecip;

      const windows = getRideWindows(dateStr, settings).map((window) => {
        const rows = dayRows.filter((row: any) => row.hour >= window.startHour && row.hour <= window.endHour);
        const avgTemp = rows.length ? rows.reduce((sum: number, row: any) => sum + row.temperature_2m, 0) / rows.length : baselineTemp;
        const totalPrecipWindow = rows.reduce((sum: number, row: any) => sum + row.precipitation, 0);
        const precipPerHour = rows.length ? totalPrecipWindow / rows.length : dayPrecipPerHour;
        const windowHasSnow = snowLikely || rows.some((row: any) => row.snowfall > 0);
        const precipGrade = adjustPrecipitationGrade(precipitationGrade(dailyPrecip, windowHasSnow), dayPrecipPerHour, precipPerHour, windowHasSnow);
        const tempGrade = adjustTemperatureGrade(temperatureGrade(baselineTemp), baselineTemp, avgTemp);
        let grade = averageGrades([precipGrade, tempGrade]);
        const penalties: string[] = [];
        if (rows.some((row: any) => row.is_day !== 1)) {
          grade = shiftGrade(grade, -2);
          penalties.push("darkness");
        }
        if (windWarning) {
          grade = shiftGrade(grade, -2);
          penalties.push("wind warning");
        }
        if (surfaceHazardRisk.likely) {
          grade = "F";
          penalties.push("ice / salt risk");
        }
        if (windowHasSnow) penalties.push("snow");
        return {
          key: window.key,
          label: window.label,
          grade: windowHasSnow ? "F" as Grade : grade,
          precipGrade,
          tempGrade,
          penalties,
          timeText: `${formatClock(window.startHour)}–${formatClock(window.endHour)}`,
          precipSummary: `${totalPrecipWindow.toFixed(1)} mm in window`,
          tempSummary: `${avgTemp.toFixed(1)}°C average`,
        };
      });

      let overallGrade = averageGrades(windows.map((w) => w.grade));
      if (snowLikely || surfaceHazardRisk.likely) overallGrade = "F";

      return {
        label: formatDisplayDate(dateStr, forecast.timezone),
        summary: summarizeDay(overallGrade),
        overallGrade,
        windows,
        snowLikely,
        surfaceHazardRisk,
        tempMin,
        tempMax,
        baselineTemp,
        dailyPrecip,
        windWarning,
        alertTitles: windAlerts.map((a: any) => a.title),
      };
    });
  }, [forecast, alerts, settings]);

  const today = gradedDays[0] ?? null;

  async function handleEnableNotifications() {
    const permission = await requestNotificationPermission();
    setNotificationPermission(permission);
  }
  function handleSendTestNotification() {
    if (!today) return;
    sendRideNotification("Ride Day Grader", buildDailyBriefing(today));
  }

  return (
    <main className="page">
      <div className="grid-top">
        <section className="card">
          <div className="card-header">
            <div className="muted small">{location.name}</div>
            <h1 className="title">Ride Day Grader</h1>
            <div className="subtitle section">A motorcycle-specific forecast app that grades your ride day using precipitation, temperature, daylight, wind alerts, and a conservative road-surface fail trigger.</div>
          </div>
          <div className="card-content">
            <form onSubmit={handleSearch} className="toolbar">
              <input className="input" value={locationQuery} onChange={(e) => setLocationQuery(e.target.value)} placeholder="Search location" />
              <button className="btn" type="submit" disabled={loading}>{loading ? "Loading..." : "Update"}</button>
              <button className="btn secondary" type="button" onClick={handleUseMyLocation}>Use my location</button>
            </form>
            <div className="meta-line">
              <span>{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</span>
              <span>•</span>
              <span>{location.timezone}</span>
              <button className="btn secondary" type="button" onClick={() => void loadForecast()} disabled={loading}>Refresh</button>
            </div>
            {error ? <div className="alert section"><strong>Unable to load forecast</strong>{error}</div> : null}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div className="title" style={{ fontSize: "1.6rem" }}>Today at a glance</div>
            <div className="subtitle">{today ? "Your nearest-term ride decision" : "Loading ride outlook"}</div>
          </div>
          <div className="card-content">
            {today ? (
              <>
                <div className="score-card-title">
                  <div>
                    <div className="muted small">{today.label}</div>
                    <div className="today-score">{today.overallGrade}</div>
                  </div>
                  <span className={badgeClass(today.overallGrade)}>{today.summary}</span>
                </div>
                {today.surfaceHazardRisk.likely ? (
                  <div className="alert section"><strong>Fail trigger: likely ice or road salt</strong>{today.surfaceHazardRisk.reasons.join("; ")}</div>
                ) : null}
                <div className="section">
                  {today.windows.map((window) => (
                    <div className="mini-window" key={window.key} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <div>
                          <div>{window.label}</div>
                          <div className="muted small">{window.timeText}</div>
                        </div>
                        <span className={badgeClass(window.grade)}>{window.grade}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : <div className="muted">Loading...</div>}
          </div>
        </section>
      </div>

      <section className="card section">
        <div className="card-header">
          <div className="title" style={{ fontSize: "1.6rem" }}>Install and daily use</div>
          <div className="subtitle">The fastest path to daily use on phone is adding this app to your home screen and opening it at your saved briefing time.</div>
        </div>
        <div className="card-content">
          <div className="meta-line">
            <span className={`badge ${isStandaloneMode() ? "good" : "warn"}`}>{isStandaloneMode() ? "Running in app mode" : "Browser mode"}</span>
            {isStandaloneMode() ? <span className="badge ok">Home screen ready</span> : null}
          </div>
          <div className="mini-window section small muted">
            {isiPhoneLike()
              ? <>On iPhone or iPad: open the Share menu in Safari, then choose <strong style={{ color: "var(--text)" }}>Add to Home Screen</strong>. Launching from the icon will feel more app-like, but background notifications still need a real deployed PWA setup.</>
              : <>In supported browsers, installability is most reliable after deployment as a proper PWA. Once deployed, you should see an install prompt or browser menu option to install the app.</>}
          </div>
        </div>
      </section>

      <section className="card section">
        <div className="card-header">
          <div className="title" style={{ fontSize: "1.6rem" }}>Daily briefing</div>
          <div className="subtitle">Browser notifications can be enabled now for testing. Your preferred briefing time is saved, but true automatic alerts still require a real PWA or backend scheduler.</div>
        </div>
        <div className="card-content">
          <div className="mini-window small">{buildDailyBriefing(today)}</div>
          <div className="section muted small">Preferred delivery time: <strong style={{ color: "var(--text)" }}>{formatClock(settings.briefingHour, settings.briefingMinute)}</strong></div>
          <div className="meta-line">
            <span className={`badge ${notificationPermission === "granted" ? "good" : notificationPermission === "denied" ? "bad" : "warn"}`}>Notifications {notificationPermission}</span>
            <button className="btn secondary" type="button" onClick={() => void handleEnableNotifications()} disabled={notificationPermission === "granted" || notificationPermission === "unsupported"}>Enable notifications</button>
            <button className="btn" type="button" onClick={handleSendTestNotification} disabled={notificationPermission !== "granted" || !today}>Send test briefing</button>
          </div>
        </div>
      </section>

      <div className="day-list">
        {gradedDays.map((day) => (
          <section className="card" key={day.label}>
            <div className="card-header">
              <div className="score-card-title">
                <div>
                  <div className="title" style={{ fontSize: "1.5rem" }}>{day.label}</div>
                  <div className="subtitle">{day.summary}</div>
                </div>
                <div>
                  <span className={badgeClass(day.overallGrade)}>Overall {day.overallGrade}</span>
                  {day.snowLikely ? <span className="badge bad" style={{ marginLeft: 8 }}>Snow fail</span> : null}
                </div>
              </div>
            </div>
            <div className="card-content">
              <div className="window-grid">
                {day.windows.map((window) => (
                  <div className="window-card" key={window.key}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                      <div>
                        <div>{window.label}</div>
                        <div className="muted small">{window.timeText}</div>
                      </div>
                      <span className={badgeClass(window.grade)}>{window.grade}</span>
                    </div>
                    <div className="summary-grid section small">
                      <div className="mini-window">
                        <div className="muted">Precipitation</div>
                        <div>{window.precipGrade}</div>
                        <div className="muted">{window.precipSummary}</div>
                      </div>
                      <div className="mini-window">
                        <div className="muted">Temperature</div>
                        <div>{window.tempGrade}</div>
                        <div className="muted">{window.tempSummary}</div>
                      </div>
                    </div>
                    {window.penalties.length ? <div className="muted small section">Penalties: {window.penalties.join(", ")}</div> : null}
                  </div>
                ))}
              </div>
              <div className="metric-grid">
                <div className="metric"><div className="muted small">Daily precipitation</div><div>{day.dailyPrecip.toFixed(1)} mm</div><div className="muted small">{day.snowLikely ? "Snow signal present" : "No snow signal"}</div></div>
                <div className="metric"><div className="muted small">Temperature range</div><div>{day.tempMin.toFixed(0)}° to {day.tempMax.toFixed(0)}°C</div><div className="muted small">Baseline {day.baselineTemp.toFixed(1)}°C</div></div>
                <div className="metric"><div className="muted small">Wind alerts</div><div>{day.windWarning ? "Wind warning active" : "No wind warning"}</div><div className="muted small">{day.windWarning ? "All ride grades downgraded one letter" : "No alert penalty"}</div></div>
                <div className="metric"><div className="muted small">Ice / salt risk</div><div>{day.surfaceHazardRisk.likely ? "Likely" : "Unlikely"}</div><div className="muted small">{day.surfaceHazardRisk.likely ? `${day.surfaceHazardRisk.confidence} confidence` : "No fail trigger"}</div></div>
              </div>
              {day.surfaceHazardRisk.likely ? <div className="alert section"><strong>Fail due to likely ice or road salt</strong>{day.surfaceHazardRisk.reasons.join("; ")}</div> : null}
              {day.alertTitles.length ? <div className="muted small section">Alerts considered: {day.alertTitles.join(", ")}</div> : null}
            </div>
          </section>
        ))}
      </div>

      <section className="card section">
        <div className="card-header">
          <div className="title" style={{ fontSize: "1.6rem" }}>Scoring model</div>
          <div className="subtitle">Current production rules implemented in code</div>
        </div>
        <div className="card-content">
          <div className="scoring-grid small muted">
            <div className="metric"><strong style={{ color: "var(--text)" }}>Precipitation</strong><div className="spacer" />Snow = F. No rain = A. Very light rain = B. Moderate rain = C. Heavy rain = D. Ride-window intensity can shift by half a grade.</div>
            <div className="metric"><strong style={{ color: "var(--text)" }}>Temperature</strong><div className="spacer" />20–30°C = A. Above 30°C = B. 10–19°C = B. 5–9°C = C. Below 5°C = D. Ride-window temperature can shift by half a grade.</div>
            <div className="metric"><strong style={{ color: "var(--text)" }}>Penalties</strong><div className="spacer" />Wind warnings downgrade all ride grades one full letter. Darkness during a ride window downgrades that window one full letter.</div>
            <div className="metric"><strong style={{ color: "var(--text)" }}>Road surface fail</strong><div className="spacer" />A conservative fail trigger based on near-freezing or freezing conditions plus precipitation, humidity, snow, or freeze-thaw timing that may indicate ice or road salt risk.</div>
          </div>
        </div>
      </section>

      <details className="card section">
        <summary className="details-summary">
          <div className="score-card-title">
            <div>
              <div className="title" style={{ fontSize: "1.4rem" }}>Ride windows and preferences</div>
              <div className="subtitle">Fine-tune commute windows and daily briefing time.</div>
            </div>
            <div className="muted small">Weekday {settings.weekdayMorningStart}:00–{settings.weekdayMorningEnd}:00 / {settings.weekdayEveningStart}:00–{settings.weekdayEveningEnd}:00</div>
          </div>
        </summary>
        <div className="details-body">
          <div className="field-grid">
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
              ["briefingHour", "Briefing hour"],
              ["briefingMinute", "Briefing minute"],
            ].map(([key, label]) => (
              <div className="field" key={key}>
                <label htmlFor={key}>{label}</label>
                <input
                  id={key}
                  className="num-input"
                  type="number"
                  min={0}
                  max={23}
                  step={1}
                  value={(settings as Record<string, number | LocationInput>)[key] as number}
                  onChange={(e) => setSettings((current) => ({ ...current, [key]: Number(e.target.value) }))}
                />
              </div>
            ))}
          </div>
        </div>
      </details>
    </main>
  );
}

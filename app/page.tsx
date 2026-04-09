"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Cloud,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudSun,
  LocateFixed,
  MapPin,
  RefreshCw,
  Sun,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const DEFAULT_LOCATION = {
  name: "Delta, BC",
  latitude: 49.0847,
  longitude: -123.0586,
  timezone: "America/Vancouver",
};

const DEFAULT_SETTINGS = {
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

const STORAGE_KEY = "ride-day-grader-settings-v1";

const CANADIAN_PROVINCE_MAP: Record<string, string> = {
  AB: "Alberta",
  BC: "British Columbia",
  MB: "Manitoba",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  NS: "Nova Scotia",
  NT: "Northwest Territories",
  NU: "Nunavut",
  ON: "Ontario",
  PE: "Prince Edward Island",
  QC: "Quebec",
  SK: "Saskatchewan",
  YT: "Yukon",
};

const FORECAST_DAYS = 7;
const WIND_ALERT_BBOX_PAD = 0.35;

const GRADE_STEPS = ["F", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];
const GRADE_INDEX = Object.fromEntries(GRADE_STEPS.map((grade, index) => [grade, index]));

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function shiftGrade(grade: string, halfSteps: number) {
  const current = GRADE_INDEX[grade as keyof typeof GRADE_INDEX] ?? 0;
  const next = clamp(current + halfSteps, 0, GRADE_STEPS.length - 1);
  return GRADE_STEPS[next];
}

function averageGrades(grades: string[]) {
  const valid = grades.filter((g) => g in GRADE_INDEX);
  if (!valid.length) return "F";
  const avg =
    valid.reduce((sum, grade) => sum + (GRADE_INDEX[grade as keyof typeof GRADE_INDEX] ?? 0), 0) /
    valid.length;
  return GRADE_STEPS[Math.round(avg)];
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

function formatTime(hour: number, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(`2026-01-01T${String(hour).padStart(2, "0")}:00:00`));
}

function isWeekend(dateStr: string) {
  const day = new Date(`${dateStr}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

function getRideWindows(dateStr: string, settings: typeof DEFAULT_SETTINGS) {
  if (isWeekend(dateStr)) {
    return [
      {
        key: "late-morning",
        label: "Late morning",
        startHour: settings.weekendMorningStart,
        endHour: settings.weekendMorningEnd,
      },
      {
        key: "midday",
        label: "Midday",
        startHour: settings.weekendMiddayStart,
        endHour: settings.weekendMiddayEnd,
      },
      {
        key: "late-day",
        label: "Late day",
        startHour: settings.weekendLateStart,
        endHour: settings.weekendLateEnd,
      },
    ];
  }

  return [
    {
      key: "am",
      label: "AM commute",
      startHour: settings.weekdayMorningStart,
      endHour: settings.weekdayMorningEnd,
    },
    {
      key: "pm",
      label: "PM commute",
      startHour: settings.weekdayEveningStart,
      endHour: settings.weekdayEveningEnd,
    },
  ];
}

function precipitationBand(mm: number) {
  if (mm <= 0.05) return 0;
  if (mm <= 0.6) return 1;
  if (mm <= 3) return 2;
  return 3;
}

function precipitationGrade(mm: number, hasSnow: boolean) {
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

function temperatureGrade(tempC: number) {
  if (tempC > 30) return "B";
  if (tempC >= 20) return "A";
  if (tempC >= 10) return "B";
  if (tempC >= 5) return "C";
  return "D";
}

function adjustPrecipitationGrade(
  dayGrade: string,
  dayMmPerHour: number,
  windowMmPerHour: number,
  hasSnow: boolean
) {
  if (hasSnow) return "F";
  const baseBand = precipitationBand(dayMmPerHour);
  const windowBand = precipitationBand(windowMmPerHour);
  if (windowBand < baseBand) return shiftGrade(dayGrade, 1);
  if (windowBand > baseBand) return shiftGrade(dayGrade, -1);
  return dayGrade;
}

function adjustTemperatureGrade(dayGrade: string, baselineTemp: number, windowTemp: number) {
  const baseBand = temperatureBand(baselineTemp);
  const windowBand = temperatureBand(windowTemp);
  if (windowBand > baseBand) return shiftGrade(dayGrade, 1);
  if (windowBand < baseBand) return shiftGrade(dayGrade, -1);
  return dayGrade;
}

function buildHourlyRows(forecast: any) {
  return forecast.hourly.time.map((time: string, index: number) => ({
    time,
    dateKey: getLocalDateKey(time, forecast.timezone),
    hour: getLocalHour(time, forecast.timezone),
    temperature_2m: forecast.hourly.temperature_2m?.[index] ?? 0,
    precipitation: forecast.hourly.precipitation?.[index] ?? 0,
    snowfall: forecast.hourly.snowfall?.[index] ?? 0,
    cloud_cover: forecast.hourly.cloud_cover?.[index] ?? 0,
    relative_humidity_2m: forecast.hourly.relative_humidity_2m?.[index] ?? 0,
    is_day: forecast.hourly.is_day?.[index] ?? 1,
  }));
}

function buildDailyRows(forecast: any) {
  return forecast.daily.time.map((dateStr: string, index: number) => ({
    dateStr,
    temperatureMin: forecast.daily.temperature_2m_min?.[index] ?? 0,
    temperatureMax: forecast.daily.temperature_2m_max?.[index] ?? 0,
    precipitationSum: forecast.daily.precipitation_sum?.[index] ?? 0,
    snowfallSum: forecast.daily.snowfall_sum?.[index] ?? 0,
  }));
}

function groupByDate(rows: any[]) {
  const map = new Map<string, any[]>();
  for (const row of rows) {
    if (!map.has(row.dateKey)) map.set(row.dateKey, []);
    map.get(row.dateKey)!.push(row);
  }
  return map;
}

function getPreviousDateKey(dateStr: string) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getOvernightRows(byDate: Map<string, any[]>, dateStr: string) {
  const previousDay = byDate.get(getPreviousDateKey(dateStr)) ?? [];
  const currentDay = byDate.get(dateStr) ?? [];
  return [
    ...previousDay.filter((row) => row.hour >= 21),
    ...currentDay.filter((row) => row.hour <= 7),
  ];
}

function inferSurfaceHazardRisk(overnightRows: any[], morningRows: any[] = []) {
  if (!overnightRows.length && !morningRows.length) {
    return {
      likely: false,
      confidence: "low",
      reasons: ["insufficient overnight forecast detail"],
      iceLikely: false,
      saltLikely: false,
    };
  }

  const relevantRows = [...overnightRows, ...morningRows];
  const minTemp = Math.min(...relevantRows.map((r) => r.temperature_2m));
  const maxTemp = Math.max(...relevantRows.map((r) => r.temperature_2m));
  const totalPrecip = relevantRows.reduce((sum, r) => sum + (r.precipitation ?? 0), 0);
  const maxHumidity = Math.max(...relevantRows.map((r) => r.relative_humidity_2m ?? 0));
  const snowPresent = relevantRows.some((r) => (r.snowfall ?? 0) > 0);
  const freezing = minTemp <= 0;
  const thawRefreezeBand = minTemp <= 0 && maxTemp >= 1;
  const strongMoistureSignal = totalPrecip >= 0.2 || maxHumidity >= 90 || snowPresent;
  const moderateMoistureSignal = totalPrecip >= 0.05 || maxHumidity >= 85;
  const moisturePresent = strongMoistureSignal || moderateMoistureSignal;
  const iceLikely = freezing && moisturePresent;
  const saltLikely = freezing && (strongMoistureSignal || snowPresent || thawRefreezeBand);

  let confidence = "low";
  if ((iceLikely || saltLikely) && (strongMoistureSignal || snowPresent)) confidence = "high";
  else if (iceLikely || saltLikely) confidence = "medium";

  return {
    likely: iceLikely || saltLikely,
    confidence,
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
    ].filter(Boolean),
  };
}

function summarizeAlertFeature(feature: any) {
  const properties = feature.properties ?? {};
  return {
    title: properties.event || properties.title || "Weather alert",
    description: properties.description || properties.headline || properties.instruction || "",
    severity: properties.severity || "unknown",
  };
}

function isWindWarning(alert: any) {
  const haystack = `${alert.title} ${alert.description}`.toLowerCase();
  return (
    haystack.includes("wind warning") ||
    haystack.includes("high wind") ||
    haystack.includes("damaging wind")
  );
}

function getWindowRows(rows: any[], startHour: number, endHour: number) {
  return rows.filter((row) => row.hour >= startHour && row.hour <= endHour);
}

function applyPenalties(
  baseGrade: string,
  {
    windWarning,
    darkness,
    surfaceHazardLikely,
  }: { windWarning: boolean; darkness: boolean; surfaceHazardLikely: boolean }
) {
  let grade = baseGrade;
  const penalties: string[] = [];

  if (darkness) {
    grade = shiftGrade(grade, -2);
    penalties.push("darkness");
  }

  if (windWarning) {
    grade = shiftGrade(grade, -2);
    penalties.push("wind warning");
  }

  if (surfaceHazardLikely) {
    grade = "F";
    penalties.push("ice / salt risk");
  }

  return { grade, penalties };
}

function summarizeDay(overallGrade: string) {
  if (["A+", "A", "A-"].includes(overallGrade)) return "Excellent riding conditions";
  if (["B+", "B", "B-"].includes(overallGrade)) return "Good riding conditions with minor compromises";
  if (["C+", "C", "C-"].includes(overallGrade)) return "Rideable, but notably compromised";
  if (["D+", "D"].includes(overallGrade)) return "Poor riding day";
  return "Avoid riding";
}

function gradeTone(grade: string) {
  if (["A+", "A", "A-"].includes(grade)) return "default";
  if (["B+", "B", "B-"].includes(grade)) return "secondary";
  if (["C+", "C", "C-", "D+", "D"].includes(grade)) return "outline";
  return "destructive";
}

type WeatherIconKey = "sun" | "sun-cloud" | "cloud" | "drizzle" | "rain" | "snow";

function getWeatherIcon(rows: any[]): { key: WeatherIconKey; label: string } {
  if (!rows.length) return { key: "cloud", label: "Forecast unavailable" };

  const snowfallTotal = rows.reduce((sum, row) => sum + (row.snowfall ?? 0), 0);
  const precipitationTotal = rows.reduce((sum, row) => sum + (row.precipitation ?? 0), 0);
  const averageCloudCover =
    rows.reduce((sum, row) => sum + (row.cloud_cover ?? 0), 0) / rows.length;
  const hasDaylight = rows.some((row) => row.is_day === 1);

  if (snowfallTotal > 0) return { key: "snow", label: "Snow" };
  if (precipitationTotal >= 2 || rows.some((row) => (row.precipitation ?? 0) >= 1)) {
    return { key: "rain", label: "Rain" };
  }
  if (precipitationTotal >= 0.1 || rows.some((row) => (row.precipitation ?? 0) > 0.05)) {
    return { key: "drizzle", label: "Light precipitation" };
  }
  if (averageCloudCover >= 70) return { key: "cloud", label: "Cloudy" };
  if (averageCloudCover >= 35) {
    return { key: "sun-cloud", label: hasDaylight ? "Partly cloudy" : "Variable cloud" };
  }
  return { key: hasDaylight ? "sun" : "cloud", label: hasDaylight ? "Sunny" : "Clear" };
}

function WeatherIcon({ iconKey, className }: { iconKey: WeatherIconKey; className?: string }) {
  switch (iconKey) {
    case "sun":
      return <Sun className={className} strokeWidth={1.75} />;
    case "sun-cloud":
      return <CloudSun className={className} strokeWidth={1.75} />;
    case "cloud":
      return <Cloud className={className} strokeWidth={1.75} />;
    case "drizzle":
      return <CloudDrizzle className={className} strokeWidth={1.75} />;
    case "rain":
      return <CloudRain className={className} strokeWidth={1.75} />;
    case "snow":
      return <CloudSnow className={className} strokeWidth={1.75} />;
    default:
      return <Cloud className={className} strokeWidth={1.75} />;
  }
}

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

function SettingsPanel({
  settings,
  onSettingsChange,
}: {
  settings: typeof DEFAULT_SETTINGS;
  onSettingsChange: React.Dispatch<React.SetStateAction<typeof DEFAULT_SETTINGS>>;
}) {
  function updateSetting(key: string, value: string) {
    onSettingsChange({ ...settings, [key]: Number(value) });
  }

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
    ["briefingMinute", "Briefing minute"],
  ];

  return (
    <details className="rounded-3xl border bg-card shadow-sm">
      <summary className="cursor-pointer list-none px-6 py-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-semibold tracking-tight">Ride windows and preferences</div>
            <div className="mt-1 text-sm text-muted-foreground">
              Fine-tune commute windows and daily briefing time.
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            Weekday {settings.weekdayMorningStart}:00–{settings.weekdayMorningEnd}:00 /{" "}
            {settings.weekdayEveningStart}:00–{settings.weekdayEveningEnd}:00
          </div>
        </div>
      </summary>
      <div className="px-6 pb-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          {fields.map(([key, label]) => (
            <div key={key} className="space-y-2">
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                type="number"
                min={0}
                max={23}
                step={1}
                value={(settings as any)[key]}
                onChange={(event) => updateSetting(key, event.target.value)}
                className="rounded-2xl"
              />
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

function DayCard({ day }: { day: any }) {
  return (
    <details className="rounded-3xl border bg-card shadow-sm">
      <summary className="cursor-pointer list-none px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="rounded-2xl border bg-muted/30 p-3">
              <WeatherIcon iconKey={day.iconKey} className="h-9 w-9 text-foreground" />
            </div>
            <div>
              <div className="text-2xl font-semibold tracking-tight">{day.label}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {day.iconLabel} · {day.summary}
              </div>
              <div className="mt-3 text-sm text-muted-foreground">Tap to expand ride details</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <div className="flex items-center gap-3 rounded-2xl border px-4 py-3">
              <WeatherIcon iconKey={day.iconKey} className="h-10 w-10 text-foreground" />
              <div className="text-5xl font-semibold leading-none">{day.overallGrade}</div>
            </div>
            {day.snowLikely && <Badge variant="destructive">Snow fail</Badge>}
          </div>
        </div>
      </summary>

      <div className="space-y-5 px-6 pb-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border p-4">
            <div className="text-sm font-medium text-foreground">Daily precipitation</div>
            <div className="mt-2 text-base font-semibold">{day.dailyPrecip.toFixed(1)} mm</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {day.snowLikely ? "Snow signal present" : "No snow signal"}
            </div>
          </div>
          <div className="rounded-2xl border p-4">
            <div className="text-sm font-medium text-foreground">Temperature range</div>
            <div className="mt-2 text-base font-semibold">
              {day.tempMin.toFixed(0)}° to {day.tempMax.toFixed(0)}°C
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              Baseline {day.baselineTemp.toFixed(1)}°C
            </div>
          </div>
          <div className="rounded-2xl border p-4">
            <div className="text-sm font-medium text-foreground">Wind alerts</div>
            <div className="mt-2 text-base font-semibold">
              {day.windWarning ? "Wind warning active" : "No wind warning"}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {day.windWarning ? "All ride grades downgraded one letter" : "No alert penalty"}
            </div>
          </div>
          <div className="rounded-2xl border p-4">
            <div className="text-sm font-medium text-foreground">Ice / salt risk</div>
            <div className="mt-2 text-base font-semibold">
              {day.surfaceHazardRisk.likely ? "Likely" : "Unlikely"}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {day.surfaceHazardRisk.likely ? `${day.surfaceHazardRisk.confidence} confidence` : "No fail trigger"}
            </div>
          </div>
        </div>

        {day.surfaceHazardRisk.likely && (
          <Alert className="rounded-2xl">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Fail due to likely ice or road salt</AlertTitle>
            <AlertDescription>
              {day.surfaceHazardRisk.reasons.join("; ")}. This is a conservative forecast-based proxy
              for hazardous road-surface conditions, not a live municipal operations feed.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 xl:grid-cols-3">
          {day.windows.map((window: any) => (
            <div key={window.key} className="rounded-2xl border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{window.label}</div>
                  <div className="text-sm text-muted-foreground">{window.timeText}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{window.iconLabel}</div>
                </div>
                <div className="flex items-center gap-3 rounded-2xl border px-3 py-2">
                  <WeatherIcon iconKey={window.iconKey} className="h-8 w-8 text-foreground" />
                  <div className="text-3xl font-semibold leading-none">{window.grade}</div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border bg-muted/30 p-3">
                  <div className="text-sm text-muted-foreground">Precipitation</div>
                  <div className="mt-1 font-medium">{window.precipGrade}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{window.precipSummary}</div>
                </div>
                <div className="rounded-2xl border bg-muted/30 p-3">
                  <div className="text-sm text-muted-foreground">Temperature</div>
                  <div className="mt-1 font-medium">{window.tempGrade}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{window.tempSummary}</div>
                </div>
              </div>

              {window.penalties.length > 0 && (
                <div className="mt-3 text-sm text-muted-foreground">
                  Penalties: {window.penalties.join(", ")}
                </div>
              )}
            </div>
          ))}
        </div>

        {day.alertTitles.length > 0 && (
          <div className="text-sm text-muted-foreground">Alerts considered: {day.alertTitles.join(", ")}</div>
        )}
      </div>
    </details>
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

  async function geocode(search: string) {
    const raw = search.trim();
    if (!raw) throw new Error("Enter a city name.");

    const normalized = raw.replace(/\s+/g, " ");
    const parts = normalized.split(",").map((part) => part.trim()).filter(Boolean);
    const provinceCode = parts[1] ? parts[1].toUpperCase() : "";
    const expandedProvince = CANADIAN_PROVINCE_MAP[provinceCode] || parts[1] || "";

    const candidateQueries = [
      normalized,
      `${normalized}, Canada`,
      expandedProvince && parts[0] ? `${parts[0]}, ${expandedProvince}, Canada` : null,
      parts[0] ? `${parts[0]}, Canada` : null,
    ].filter((value, index, array) => Boolean(value) && array.indexOf(value) === index) as string[];

    for (const candidate of candidateQueries) {
      const url =
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(candidate)}` +
        `&count=10&language=en&format=json`;

      const res = await fetch(url);
      if (!res.ok) continue;

      const data = await res.json();
      const matches = (data.results || []).filter((result: any) => {
        if (!result.country_code) return true;
        return result.country_code === "CA" || candidate === normalized;
      });

      const match = matches[0];
      if (match) {
        return {
          name: [match.name, match.admin1, match.country_code].filter(Boolean).join(", "),
          latitude: match.latitude,
          longitude: match.longitude,
          timezone:
            match.timezone ||
            Intl.DateTimeFormat().resolvedOptions().timeZone ||
            DEFAULT_LOCATION.timezone,
        };
      }
    }

    throw new Error("No matching Canadian city found.");
  }

  async function fetchForecast(targetLocation: typeof DEFAULT_LOCATION) {
    const params = new URLSearchParams({
      latitude: String(targetLocation.latitude),
      longitude: String(targetLocation.longitude),
      timezone: targetLocation.timezone,
      forecast_days: String(FORECAST_DAYS),
      models: "gem_global",
      hourly: [
        "temperature_2m",
        "precipitation",
        "snowfall",
        "cloud_cover",
        "relative_humidity_2m",
        "is_day",
      ].join(","),
      daily: [
        "temperature_2m_min",
        "temperature_2m_max",
        "precipitation_sum",
        "snowfall_sum",
        "sunrise",
        "sunset",
      ].join(","),
    });

    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`);
    if (!res.ok) throw new Error("Forecast request failed.");
    return await res.json();
  }

  async function fetchAlerts(targetLocation: typeof DEFAULT_LOCATION) {
    const bbox = [
      targetLocation.longitude - WIND_ALERT_BBOX_PAD,
      targetLocation.latitude - WIND_ALERT_BBOX_PAD,
      targetLocation.longitude + WIND_ALERT_BBOX_PAD,
      targetLocation.latitude + WIND_ALERT_BBOX_PAD,
    ].join(",");

    try {
      const url = `https://api.weather.gc.ca/collections/weather-alerts/items?lang=en&f=json&limit=50&bbox=${bbox}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.features ?? []).map(summarizeAlertFeature);
    } catch {
      return [];
    }
  }

  async function refresh(nextLocation = location) {
    setLoading(true);
    setError("");
    try {
      const [forecastData, alertData] = await Promise.all([
        fetchForecast(nextLocation),
        fetchAlerts(nextLocation),
      ]);
      setForecast(forecastData);
      setAlerts(alertData);
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

  async function handleSearch(event: any) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const nextLocation = await geocode(locationQuery);
      setLocation(nextLocation);
      setSettings((current) => ({ ...current, savedLocation: nextLocation }));
      const [forecastData, alertData] = await Promise.all([
        fetchForecast(nextLocation),
        fetchAlerts(nextLocation),
      ]);
      setForecast(forecastData);
      setAlerts(alertData);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Location update failed. Try a Canadian city like Toronto, Vancouver, or Halifax."
      );
    } finally {
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
          timezone:
            Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_LOCATION.timezone,
        };
        setLocation(nextLocation);
        setSettings((current) => ({ ...current, savedLocation: nextLocation }));
        setLocationQuery("Current location");
        await refresh(nextLocation);
      },
      () => setError("Could not access your location."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const gradedDays = useMemo(() => {
    if (!forecast?.hourly?.time?.length || !forecast?.daily?.time?.length) return [];

    const hourlyRows = buildHourlyRows(forecast);
    const dailyRows = buildDailyRows(forecast);
    const byDate = groupByDate(hourlyRows);
    const windAlerts = alerts.filter(isWindWarning);
    const windWarning = windAlerts.length > 0;

    return dailyRows.map((dailyRow: any) => {
      const dayRows = byDate.get(dailyRow.dateStr) ?? [];
      const overnightRows = getOvernightRows(byDate, dailyRow.dateStr);
      const morningHazardRows = dayRows.filter((row: any) => row.hour <= 9);
      const surfaceHazardRisk = inferSurfaceHazardRisk(overnightRows, morningHazardRows);
      const dayIcon = getWeatherIcon(dayRows);
      const snowLikely = dailyRow.snowfallSum > 0 || dayRows.some((row: any) => row.snowfall > 0);
      const baselineTemp = (dailyRow.temperatureMin + dailyRow.temperatureMax) / 2;
      const dayPrecipPerHour = dayRows.length
        ? dailyRow.precipitationSum / dayRows.length
        : dailyRow.precipitationSum;

      const windows = getRideWindows(dailyRow.dateStr, settings).map((window) => {
        const rows = getWindowRows(dayRows, window.startHour, window.endHour);
        const windowIcon = getWeatherIcon(rows.length ? rows : dayRows);
        const avgTemp = rows.length
          ? rows.reduce((sum: number, row: any) => sum + row.temperature_2m, 0) / rows.length
          : baselineTemp;
        const totalPrecip = rows.reduce((sum: number, row: any) => sum + row.precipitation, 0);
        const precipPerHour = rows.length ? totalPrecip / rows.length : dayPrecipPerHour;
        const windowHasSnow = snowLikely || rows.some((row: any) => row.snowfall > 0);

        const basePrecipGrade = precipitationGrade(dailyRow.precipitationSum, windowHasSnow);
        const adjustedPrecipGrade = adjustPrecipitationGrade(
          basePrecipGrade,
          dayPrecipPerHour,
          precipPerHour,
          windowHasSnow
        );

        const baseTempGrade = temperatureGrade(baselineTemp);
        const adjustedTempGrade = adjustTemperatureGrade(baseTempGrade, baselineTemp, avgTemp);
        const baseWindowGrade = averageGrades([adjustedPrecipGrade, adjustedTempGrade]);

        const darkness = rows.some((row: any) => row.is_day !== 1);
        const penalized = applyPenalties(baseWindowGrade, {
          windWarning,
          darkness,
          surfaceHazardLikely: surfaceHazardRisk.likely,
        });

        return {
          key: window.key,
          label: window.label,
          grade: windowHasSnow ? "F" : penalized.grade,
          iconKey: windowIcon.key,
          iconLabel: windowIcon.label,
          precipGrade: adjustedPrecipGrade,
          tempGrade: adjustedTempGrade,
          avgTemp,
          totalPrecip,
          penalties: windowHasSnow ? [...penalized.penalties, "snow"] : penalized.penalties,
          timeText: `${formatTime(window.startHour, forecast.timezone)}–${formatTime(window.endHour, forecast.timezone)}`,
          precipSummary: `${totalPrecip.toFixed(1)} mm in window`,
          tempSummary: `${avgTemp.toFixed(1)}°C average`,
        };
      });

      let overallGrade = averageGrades(windows.map((window: any) => window.grade));
      if (snowLikely || surfaceHazardRisk.likely) overallGrade = "F";

      return {
        label: formatDisplayDate(dailyRow.dateStr, forecast.timezone),
        summary: summarizeDay(overallGrade),
        overallGrade,
        iconKey: dayIcon.key,
        iconLabel: dayIcon.label,
        windows,
        snowLikely,
        surfaceHazardRisk,
        tempMin: dailyRow.temperatureMin,
        tempMax: dailyRow.temperatureMax,
        baselineTemp,
        dailyPrecip: dailyRow.precipitationSum,
        windWarning,
        alertTitles: windAlerts.map((alert: any) => alert.title),
      };
    });
  }, [forecast, alerts, settings]);

  const today = gradedDays[0] ?? null;

  return (
    <div className="min-h-screen bg-background px-4 py-6 md:px-8 md:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <Card className="rounded-3xl border shadow-sm">
            <CardHeader className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4" />
                {location.name}
              </div>
              <div>
                <CardTitle className="text-4xl tracking-tight">Ride Day Grader</CardTitle>
                <CardDescription className="mt-2 max-w-2xl text-base leading-relaxed">
                  A motorcycle-specific forecast app that grades your ride day using precipitation,
                  temperature, daylight, wind alerts, and conservative ice / road-salt risk.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleSearch} className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <Input
                  value={locationQuery}
                  onChange={(event) => setLocationQuery(event.target.value)}
                  placeholder="Search Canadian city"
                  className="h-11 rounded-2xl"
                />
                <Button type="submit" className="h-11 rounded-2xl" disabled={loading}>
                  {loading ? "Loading..." : "Update"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-2xl"
                  onClick={handleUseMyLocation}
                >
                  <LocateFixed className="mr-2 h-4 w-4" />
                  Use my location
                </Button>
              </form>

              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</span>
                <span>•</span>
                <span>{location.timezone}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto rounded-2xl"
                  onClick={() => refresh()}
                  disabled={loading}
                >
                  <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
              </div>

              {error && (
                <Alert className="rounded-2xl">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Unable to load forecast</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-3xl border shadow-sm">
            <CardHeader>
              <CardTitle className="text-2xl">Today at a glance</CardTitle>
              <CardDescription>
                {today ? "Your nearest-term ride decision" : "Loading ride outlook"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {today ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-4">
                      <div className="rounded-2xl border bg-muted/30 p-3">
                        <WeatherIcon iconKey={today.iconKey} className="h-9 w-9 text-foreground" />
                      </div>
                      <div>
                        <div className="text-sm text-muted-foreground">{today.label}</div>
                        <div className="text-sm text-muted-foreground">{today.iconLabel}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 rounded-2xl border px-4 py-3">
                      <WeatherIcon iconKey={today.iconKey} className="h-10 w-10 text-foreground" />
                      <div className="text-5xl font-semibold leading-none">{today.overallGrade}</div>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">{today.summary}</div>

                  {today.surfaceHazardRisk?.likely && (
                    <Alert className="rounded-2xl">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Fail trigger: likely ice or road salt</AlertTitle>
                      <AlertDescription>
                        {today.surfaceHazardRisk.reasons.join("; ")}
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="grid gap-3">
                    {today.windows.map((window: any) => (
                      <div
                        key={window.key}
                        className="flex items-center justify-between rounded-2xl border p-3"
                      >
                        <div>
                          <div className="font-medium">{window.label}</div>
                          <div className="text-sm text-muted-foreground">{window.timeText}</div>
                          <div className="text-sm text-muted-foreground">{window.iconLabel}</div>
                        </div>
                        <div className="flex items-center gap-3 rounded-2xl border px-3 py-2">
                          <WeatherIcon iconKey={window.iconKey} className="h-7 w-7 text-foreground" />
                          <div className="text-3xl font-semibold leading-none">{window.grade}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Loading...</div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6">
          {gradedDays.map((day: any) => (
            <DayCard key={day.label} day={day} />
          ))}
        </div>

        <details className="rounded-3xl border bg-card shadow-sm">
          <summary className="cursor-pointer list-none px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold tracking-tight">Scoring model</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Expand to review the grading and fail-trigger rules.
                </div>
              </div>
            </div>
          </summary>
          <div className="px-6 pb-6">
            <div className="grid gap-4 text-sm text-muted-foreground md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border p-4">
                <div className="font-medium text-foreground">Precipitation</div>
                <div className="mt-2">
                  Snow = F. No rain = A. Very light rain = B. Moderate rain = C. Heavy rain = D.
                  Commute or ride-window intensity can shift by half a grade.
                </div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="font-medium text-foreground">Temperature</div>
                <div className="mt-2">
                  20–30°C = A. Above 30°C = B. 10–19°C = B. 5–9°C = C. Below 5°C = D.
                  Ride-window temperature can shift by half a grade.
                </div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="font-medium text-foreground">Penalties</div>
                <div className="mt-2">
                  Wind warnings downgrade all ride grades one full letter. Darkness during a ride
                  window downgrades that window one full letter.
                </div>
              </div>
              <div className="rounded-2xl border p-4">
                <div className="font-medium text-foreground">Road surface fail</div>
                <div className="mt-2">
                  A conservative fail trigger based on near-freezing or freezing conditions plus
                  precipitation, humidity, snow, or freeze-thaw timing that may indicate ice or
                  road salt risk.
                </div>
              </div>
            </div>
          </div>
        </details>

        <SettingsPanel settings={settings} onSettingsChange={setSettings} />
      </div>
    </div>
  );
}

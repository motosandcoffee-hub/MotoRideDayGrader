import type { DayResult, Grade, PrecipitationGradeRange, RideSettings, ScoringModel, TemperatureGradeRange } from "@/lib/types";
import { DEFAULT_SCORING_MODEL } from "@/lib/weather";

const GRADE_STEPS: Grade[] = ["F", "D", "D+", "C-", "C", "C+", "B-", "B", "B+", "A-", "A", "A+"];
const GRADE_INDEX = Object.fromEntries(GRADE_STEPS.map((grade, index) => [grade, index])) as Record<Grade, number>;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function shiftGrade(grade: Grade, halfSteps: number): Grade {
  const current = GRADE_INDEX[grade] ?? 0;
  const next = clamp(current + halfSteps, 0, GRADE_STEPS.length - 1);
  return GRADE_STEPS[next];
}

function averageGrades(grades: Grade[]): Grade {
  const valid = grades.filter((g) => g in GRADE_INDEX);
  if (!valid.length) return "F";
  const avg = valid.reduce((sum, grade) => sum + GRADE_INDEX[grade], 0) / valid.length;
  return GRADE_STEPS[Math.round(avg)];
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

function formatDisplayDate(dateStr: string, timezone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(`${dateStr}T12:00:00`));
}

function formatTime(hour: number) {
  return new Intl.DateTimeFormat("en-CA", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(new Date(`2026-01-01T${String(hour).padStart(2, "0")}:00:00`));
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
      { key: "late-day", label: "Late day", startHour: settings.weekendLateStart, endHour: settings.weekendLateEnd }
    ];
  }

  return [
    { key: "am", label: "AM commute", startHour: settings.weekdayMorningStart, endHour: settings.weekdayMorningEnd },
    { key: "pm", label: "PM commute", startHour: settings.weekdayEveningStart, endHour: settings.weekdayEveningEnd }
  ];
}

function getScoringModel(settings: RideSettings): ScoringModel {
  return settings.scoringModel ?? DEFAULT_SCORING_MODEL;
}

function getPrecipitationRanges(model: ScoringModel): PrecipitationGradeRange[] {
  return model.precipitation?.length ? model.precipitation : DEFAULT_SCORING_MODEL.precipitation;
}

function getTemperatureRanges(model: ScoringModel): TemperatureGradeRange[] {
  return model.temperature?.length ? model.temperature : DEFAULT_SCORING_MODEL.temperature;
}

function precipitationBand(mm: number, model: ScoringModel) {
  const ranges = getPrecipitationRanges(model);
  const index = ranges.findIndex((range) => mm <= range.maxMm);
  return index >= 0 ? index : ranges.length - 1;
}

function precipitationGrade(mm: number, hasSnow: boolean, model: ScoringModel): Grade {
  if (hasSnow) return "F";
  const ranges = getPrecipitationRanges(model);
  return ranges[precipitationBand(mm, model)]?.grade ?? "D";
}

function temperatureBand(tempC: number, model: ScoringModel) {
  const ranges = getTemperatureRanges(model);
  const index = ranges.findIndex((range) => tempC >= range.minC && tempC <= range.maxC);
  if (index >= 0) return index;
  if (tempC < ranges[0].minC) return 0;
  return ranges.length - 1;
}

function temperatureGrade(tempC: number, model: ScoringModel): Grade {
  const ranges = getTemperatureRanges(model);
  return ranges[temperatureBand(tempC, model)]?.grade ?? "D";
}

function temperatureFailLikely(temps: number[], model: ScoringModel) {
  return temps.some((temp) => temperatureGrade(temp, model) === "F");
}

function adjustPrecipitationGrade(dayGrade: Grade, dayMmPerHour: number, windowMmPerHour: number, hasSnow: boolean, model: ScoringModel): Grade {
  if (hasSnow) return "F";
  const baseBand = precipitationBand(dayMmPerHour, model);
  const windowBand = precipitationBand(windowMmPerHour, model);
  if (windowBand < baseBand) return shiftGrade(dayGrade, 1);
  if (windowBand > baseBand) return shiftGrade(dayGrade, -1);
  return dayGrade;
}

function adjustTemperatureGrade(dayGrade: Grade, baselineTemp: number, windowTemp: number, model: ScoringModel): Grade {
  const baseBand = temperatureBand(baselineTemp, model);
  const windowBand = temperatureBand(windowTemp, model);
  if (windowBand > baseBand) return shiftGrade(dayGrade, 1);
  if (windowBand < baseBand) return shiftGrade(dayGrade, -1);
  return dayGrade;
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
  return [...previousDay.filter((row) => row.hour >= 21), ...currentDay.filter((row) => row.hour <= 7)];
}

function inferSurfaceHazardRisk(overnightRows: any[], morningRows: any[] = []) {
  if (!overnightRows.length && !morningRows.length) {
    return {
      likely: false,
      confidence: "low",
      reasons: ["insufficient overnight forecast detail"],
      iceLikely: false,
      saltLikely: false
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
      saltLikely ? "road salt likely" : null
    ].filter(Boolean)
  };
}

function summarizeAlertFeature(feature: any) {
  const properties = feature.properties ?? {};
  return {
    title: properties.event || properties.title || "Weather alert",
    description: properties.description || properties.headline || properties.instruction || "",
    severity: properties.severity || "unknown"
  };
}

function isWindWarning(alert: any) {
  const haystack = `${alert.title} ${alert.description}`.toLowerCase();
  return haystack.includes("wind warning") || haystack.includes("high wind") || haystack.includes("damaging wind");
}

function applyPenalties(baseGrade: Grade, { windWarning, darkness, surfaceHazardLikely }: { windWarning: boolean; darkness: boolean; surfaceHazardLikely: boolean; }) {
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

function summarizeDay(overallGrade: Grade) {
  if (["A+", "A", "A-"].includes(overallGrade)) return "Excellent riding conditions";
  if (["B+", "B", "B-"].includes(overallGrade)) return "Good riding conditions with minor compromises";
  if (["C+", "C", "C-"].includes(overallGrade)) return "Rideable, but notably compromised";
  if (["D+", "D"].includes(overallGrade)) return "Poor riding day";
  return "Avoid riding";
}

export function gradeTone(grade: Grade) {
  if (["A+", "A", "A-"].includes(grade)) return "good";
  if (["B+", "B", "B-"].includes(grade)) return "secondary";
  if (["C+", "C", "C-", "D+", "D"].includes(grade)) return "outline";
  return "bad";
}

export function buildDayResults(forecast: any, rawAlerts: any[], settings: RideSettings): DayResult[] {
  const scoringModel = getScoringModel(settings);
  const hourlyRows = forecast.hourly.time.map((time: string, index: number) => ({
    time,
    dateKey: getLocalDateKey(time, forecast.timezone),
    hour: getLocalHour(time, forecast.timezone),
    temperature_2m: forecast.hourly.temperature_2m?.[index] ?? 0,
    precipitation: forecast.hourly.precipitation?.[index] ?? 0,
    snowfall: forecast.hourly.snowfall?.[index] ?? 0,
    relative_humidity_2m: forecast.hourly.relative_humidity_2m?.[index] ?? 0,
    is_day: forecast.hourly.is_day?.[index] ?? 1
  }));

  const dailyRows = forecast.daily.time.map((dateStr: string, index: number) => ({
    dateStr,
    temperatureMin: forecast.daily.temperature_2m_min?.[index] ?? 0,
    temperatureMax: forecast.daily.temperature_2m_max?.[index] ?? 0,
    precipitationSum: forecast.daily.precipitation_sum?.[index] ?? 0,
    snowfallSum: forecast.daily.snowfall_sum?.[index] ?? 0
  }));

  const byDate = groupByDate(hourlyRows);
  const alerts = rawAlerts.map(summarizeAlertFeature);
  const windAlerts = alerts.filter(isWindWarning);
  const windWarning = windAlerts.length > 0;

  return dailyRows.map((dailyRow) => {
    const dayRows = byDate.get(dailyRow.dateStr) ?? [];
    const overnightRows = getOvernightRows(byDate, dailyRow.dateStr);
    const morningHazardRows = dayRows.filter((row: any) => row.hour <= 9);
    const surfaceHazardRisk = inferSurfaceHazardRisk(overnightRows, morningHazardRows);
    const snowLikely = dailyRow.snowfallSum > 0 || dayRows.some((row: any) => row.snowfall > 0);
    const heatFailLikely = temperatureFailLikely(
      [dailyRow.temperatureMin, dailyRow.temperatureMax, ...dayRows.map((row: any) => row.temperature_2m)],
      scoringModel
    );
    const baselineTemp = (dailyRow.temperatureMin + dailyRow.temperatureMax) / 2;
    const dayPrecipPerHour = dayRows.length ? dailyRow.precipitationSum / dayRows.length : dailyRow.precipitationSum;

    const windows = getRideWindows(dailyRow.dateStr, settings).map((window) => {
      const rows = dayRows.filter((row: any) => row.hour >= window.startHour && row.hour <= window.endHour);
      const avgTemp = rows.length ? rows.reduce((sum: number, row: any) => sum + row.temperature_2m, 0) / rows.length : baselineTemp;
      const totalPrecip = rows.reduce((sum: number, row: any) => sum + row.precipitation, 0);
      const precipPerHour = rows.length ? totalPrecip / rows.length : dayPrecipPerHour;
      const windowHasSnow = snowLikely || rows.some((row: any) => row.snowfall > 0);
      const windowHeatFail = temperatureFailLikely([avgTemp, ...rows.map((row: any) => row.temperature_2m)], scoringModel);

      const adjustedPrecipGrade = adjustPrecipitationGrade(
        precipitationGrade(dailyRow.precipitationSum, windowHasSnow, scoringModel),
        dayPrecipPerHour,
        precipPerHour,
        windowHasSnow,
        scoringModel
      );
      const adjustedTempGrade = adjustTemperatureGrade(temperatureGrade(baselineTemp, scoringModel), baselineTemp, avgTemp, scoringModel);
      const baseWindowGrade = averageGrades([adjustedPrecipGrade, adjustedTempGrade]);
      const darkness = rows.some((row: any) => row.is_day !== 1);
      const penalized = applyPenalties(baseWindowGrade, { windWarning, darkness, surfaceHazardLikely: surfaceHazardRisk.likely });

      return {
        key: window.key,
        label: window.label,
        grade: windowHasSnow || windowHeatFail ? "F" : penalized.grade,
        precipGrade: adjustedPrecipGrade,
        tempGrade: adjustedTempGrade,
        avgTemp,
        totalPrecip,
        penalties: [
          ...penalized.penalties,
          ...(windowHasSnow ? ["snow"] : []),
          ...(windowHeatFail ? ["heat"] : [])
        ],
        timeText: `${formatTime(window.startHour)}–${formatTime(window.endHour)}`,
        precipSummary: `${totalPrecip.toFixed(1)} mm in window`,
        tempSummary: `${avgTemp.toFixed(1)}°C average`
      };
    });

    let overallGrade = averageGrades(windows.map((window) => window.grade));
    if (snowLikely || surfaceHazardRisk.likely || heatFailLikely) overallGrade = "F";

    return {
      label: formatDisplayDate(dailyRow.dateStr, forecast.timezone),
      summary: summarizeDay(overallGrade),
      overallGrade,
      windows,
      snowLikely,
      surfaceHazardRisk,
      tempMin: dailyRow.temperatureMin,
      tempMax: dailyRow.temperatureMax,
      baselineTemp,
      dailyPrecip: dailyRow.precipitationSum,
      windWarning,
      alertTitles: windAlerts.map((alert) => alert.title)
    };
  });
}

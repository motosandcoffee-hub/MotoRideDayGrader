"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { buildDayResults, gradeTone } from "@/lib/scoring";
import { DEFAULT_LOCATION, DEFAULT_SETTINGS, geocodeLocation } from "@/lib/weather";

const STORAGE_KEY = "ride-day-grader-settings-v1";

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

function TodayCard({ today }: { today: any | null }) {
  return (
    <div className="card">
      <div className="card-inner">
        <h2 style={{ fontSize: 28 }}>Today at a glance</h2>
        <p className="muted spacer-8">{today ? "Your nearest-term ride decision" : "Loading ride outlook"}</p>

        {today ? (
          <div className="spacer-16">
            <div className="row space-between wrap">
              <div>
                <div className="muted">{today.label}</div>
                <div className="big-grade">{today.overallGrade}</div>
              </div>
              <GradeBadge grade={today.overallGrade} label={today.summary} />
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
                    </div>
                    <GradeBadge grade={window.grade} />
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
    <div className="card">
      <div className="card-inner">
        <div className="row space-between wrap">
          <div>
            <h2 style={{ fontSize: 28 }}>{day.label}</h2>
            <p className="muted spacer-4">{day.summary}</p>
          </div>
          <div className="row wrap">
            <GradeBadge grade={day.overallGrade} label={`Overall ${day.overallGrade}`} />
            {day.snowLikely && <span className="badge bad">Snow fail</span>}
          </div>
        </div>

        <div className="window-grid spacer-20">
          {day.windows.map((window: any) => (
            <div className="window-card" key={window.key}>
              <div className="row space-between wrap">
                <div>
                  <div style={{ fontWeight: 700 }}>{window.label}</div>
                  <div className="muted spacer-4">{window.timeText}</div>
                </div>
                <GradeBadge grade={window.grade} />
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

        <hr className="separator spacer-20" />

        <div className="small-grid spacer-20">
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

        {day.alertTitles.length > 0 && (
          <div className="muted spacer-16">Alerts considered: {day.alertTitles.join(", ")}</div>
        )}
      </div>
    </div>
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

function ScoringModelPanel() {
  return (
    <DetailsCard
      title="Scoring model"
      subtitle="Expand to review the grading and fail-trigger rules."
    >
      <div className="small-grid">
        <div className="metric-card">
          <div className="title">Precipitation</div>
          <div className="note">Snow = F. No rain = A. Very light rain = B. Moderate rain = C. Heavy rain = D. Ride-window rain can shift by half a grade.</div>
        </div>
        <div className="metric-card">
          <div className="title">Temperature</div>
          <div className="note">20–30°C = A. Above 30°C = B. 10–19°C = B. 5–9°C = C. Below 5°C = D. Ride-window temperature can shift by half a grade.</div>
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
  );
}

export default function Page() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [locationQuery, setLocationQuery] = useState(DEFAULT_LOCATION.name);
  const [location, setLocation] = useState(DEFAULT_LOCATION);
  const [forecast, setForecast] = useState<any>(null);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function loadForecast(nextLocation = location) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        name: nextLocation.name,
        latitude: String(nextLocation.latitude),
        longitude: String(nextLocation.longitude),
        timezone: nextLocation.timezone
      });
      const res = await fetch(`/api/ride-forecast?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load forecast.");
      setForecast(data.forecast);
      setAlerts(data.alerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load ride forecast.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const stored = readStoredSettings();
    setSettings(stored);
    const savedLocation = stored.savedLocation || DEFAULT_LOCATION;
    setLocation(savedLocation);
    setLocationQuery(savedLocation.name);
    loadForecast(savedLocation);
  }, []);

  useEffect(() => {
    persistSettings(settings);
  }, [settings]);

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const nextLocation = await geocodeLocation(locationQuery);
      setLocation(nextLocation);
      setSettings((current) => ({ ...current, savedLocation: nextLocation }));
      const params = new URLSearchParams({
        name: nextLocation.name,
        latitude: String(nextLocation.latitude),
        longitude: String(nextLocation.longitude),
        timezone: nextLocation.timezone
      });
      const res = await fetch(`/api/ride-forecast?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load forecast.");
      setForecast(data.forecast);
      setAlerts(data.alerts);
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
        await loadForecast(nextLocation);
      },
      () => setError("Could not access your location."),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  const gradedDays = useMemo(() => {
    if (!forecast?.hourly?.time?.length || !forecast?.daily?.time?.length) return [];
    return buildDayResults(forecast, alerts, settings);
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
                  A motorcycle-specific forecast app that grades your ride day using precipitation, temperature, daylight, wind alerts, and conservative ice / road-salt risk.
                </p>
              </div>

              <form className="form-grid spacer-20" onSubmit={handleSearch}>
                <input
                  value={locationQuery}
                  onChange={(event) => setLocationQuery(event.target.value)}
                  placeholder="Search location"
                />
                <button type="submit" disabled={loading}>{loading ? "Loading..." : "Update"}</button>
                <button type="button" className="secondary" onClick={handleUseMyLocation}>Use my location</button>
              </form>

              <div className="row wrap spacer-16">
                <span className="muted">{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</span>
                <span className="muted">•</span>
                <span className="muted">{location.timezone}</span>
                <button style={{ marginLeft: "auto" }} type="button" className="secondary" onClick={() => loadForecast()} disabled={loading}>Refresh</button>
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
          {gradedDays.map((day: any) => <DayCard key={day.label} day={day} />)}
          <ScoringModelPanel />
          <SettingsPanel settings={settings} onSettingsChange={setSettings} />
        </div>

        <footer>Current source-of-truth package with collapsed scoring model, collapsed preferences, and café-racer icon assets.</footer>
      </div>
    </main>
  );
}

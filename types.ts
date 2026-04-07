export type Grade = "F" | "D" | "D+" | "C-" | "C" | "C+" | "B-" | "B" | "B+" | "A-" | "A" | "A+";

export interface LocationInput {
  name: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export interface RideSettings {
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
}

export interface RideWindowResult {
  key: string;
  label: string;
  grade: Grade;
  precipGrade: Grade;
  tempGrade: Grade;
  avgTemp: number;
  totalPrecip: number;
  penalties: string[];
  timeText: string;
  precipSummary: string;
  tempSummary: string;
}

export interface SurfaceHazardRisk {
  likely: boolean;
  confidence: string;
  reasons: string[];
  iceLikely: boolean;
  saltLikely: boolean;
}

export interface DayResult {
  label: string;
  summary: string;
  overallGrade: Grade;
  windows: RideWindowResult[];
  snowLikely: boolean;
  surfaceHazardRisk: SurfaceHazardRisk;
  tempMin: number;
  tempMax: number;
  baselineTemp: number;
  dailyPrecip: number;
  windWarning: boolean;
  alertTitles: string[];
}

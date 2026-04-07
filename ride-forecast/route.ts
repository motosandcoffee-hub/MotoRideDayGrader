import { NextRequest, NextResponse } from "next/server";
import { fetchRideForecast } from "@/lib/weather";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const latitude = Number(searchParams.get("latitude"));
  const longitude = Number(searchParams.get("longitude"));
  const timezone = searchParams.get("timezone") || "America/Vancouver";
  const name = searchParams.get("name") || "Selected location";

  if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return NextResponse.json({ error: "Invalid coordinates." }, { status: 400 });
  }

  try {
    const data = await fetchRideForecast({ name, latitude, longitude, timezone });
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Forecast fetch failed." }, { status: 500 });
  }
}

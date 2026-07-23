import { getCitiesCoordinates } from "@/lib/geocoding";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const cities = body?.cities;

  if (!Array.isArray(cities) || cities.some((c) => typeof c !== "string")) {
    return Response.json(
      { error: "Envie { cities: string[] }." },
      { status: 400 }
    );
  }

  const uniqueCities = Array.from(
    new Set(cities.map((c: string) => c.trim()).filter(Boolean))
  );

  const results = await getCitiesCoordinates(uniqueCities);

  return Response.json({ results });
}

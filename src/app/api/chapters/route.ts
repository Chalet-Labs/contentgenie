import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { isSafeUrl, safeFetch } from "@/lib/security";
import { parseChapters } from "@/lib/chapters";

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json(
      { error: "Missing url parameter" },
      { status: 400 },
    );
  }

  const safe = await isSafeUrl(url);
  if (!safe) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  let body: string;
  try {
    body = await safeFetch(url);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch chapters" },
      { status: 502 },
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON response from chapters URL" },
      { status: 502 },
    );
  }

  const chapters = parseChapters(json);
  return NextResponse.json(
    { chapters },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      },
    },
  );
}

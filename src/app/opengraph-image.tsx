import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "ContentGenie — Triage the podcasts worth your time";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function renderPrimary() {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        height: "100%",
        width: "100%",
        padding: "72px 80px",
        background: "#09090b",
        color: "#fafafa",
        fontFamily: "system-ui, -apple-system, sans-serif",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background:
            "radial-gradient(circle at 20% 10%, rgba(59,130,246,0.20), transparent 45%), radial-gradient(circle at 90% 90%, rgba(59,130,246,0.12), transparent 50%)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 16, zIndex: 1 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 14,
            background: "#fafafa",
            color: "#09090b",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 32,
            fontWeight: 800,
          }}
        >
          C
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.5 }}>
          ContentGenie
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", zIndex: 1 }}>
        <div
          style={{
            fontSize: 78,
            fontWeight: 700,
            lineHeight: 1.04,
            letterSpacing: -2.5,
            display: "flex",
          }}
        >
          Triage the podcasts worth your time.
        </div>
        <div
          style={{
            fontSize: 78,
            fontWeight: 700,
            lineHeight: 1.04,
            letterSpacing: -2.5,
            color: "#a1a1aa",
            display: "flex",
          }}
        >
          Skip the rest.
        </div>
        <div
          style={{
            fontSize: 26,
            color: "#a1a1aa",
            marginTop: 24,
            maxWidth: 980,
            lineHeight: 1.4,
            display: "flex",
          }}
        >
          AI-generated Worth-It scores, distilled takeaways, and a library that remembers.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          fontSize: 18,
          color: "#a1a1aa",
          zIndex: 1,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 999,
            background: "#22c55e",
            boxShadow: "0 0 0 4px rgba(34,197,94,0.2)",
          }}
        />
        <span style={{ letterSpacing: 3, textTransform: "uppercase" }}>
          Now in public beta · Free · 50% off forever
        </span>
      </div>
    </div>
  );
}

function renderFallback() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        width: "100%",
        background: "#09090b",
        color: "#fafafa",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: 64,
        fontWeight: 700,
        letterSpacing: -1,
      }}
    >
      ContentGenie
    </div>
  );
}

export default function Image() {
  try {
    return new ImageResponse(renderPrimary(), { ...size });
  } catch (err) {
    console.error("[opengraph-image] primary render failed, serving fallback", { err });
    return new ImageResponse(renderFallback(), { ...size });
  }
}

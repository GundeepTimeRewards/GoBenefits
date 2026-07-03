// Dev-only data-source indicator. Renders a tiny, unobtrusive corner badge showing
// whether the app is reading mock / hybrid-live / hybrid-fallback data. Never renders in
// production builds, and stays hidden in plain mock mode (the default) unless
// VITE_SHOW_DATA_SOURCE_BADGE=true is set. Non-interactive; pointer-events off.
import { dataSourceBadgeState, DATA_SOURCE_MODE, getDataSourceDiagnostics } from "@/lib/api/dataSource";

function readEnv(key: string): string | undefined {
  return (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.[key];
}

const COLORS: Record<string, string> = {
  mock: "#6b7280", // gray
  "hybrid-live": "#16a34a", // green
  "hybrid-fallback": "#d97706", // amber
};

export function DataSourceIndicator() {
  const isDev = Boolean((import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV);
  const forced = readEnv("VITE_SHOW_DATA_SOURCE_BADGE") === "true";
  // Hidden in production; hidden in default mock mode unless explicitly forced.
  if (!isDev && !forced) return null;
  if (DATA_SOURCE_MODE === "mock" && !forced) return null;

  const state = dataSourceBadgeState();
  const diag = getDataSourceDiagnostics();
  const title = `data-source: ${state}\nmode=${diag.mode} endpoint=${diag.endpointConfigured} liveApi=${diag.liveApiEnabled} devSub=${diag.devAuthSubConfigured}`;

  return (
    <div
      title={title}
      style={{
        position: "fixed",
        bottom: 8,
        right: 8,
        zIndex: 9999,
        pointerEvents: "none",
        fontSize: 11,
        fontFamily: "ui-monospace, monospace",
        padding: "2px 8px",
        borderRadius: 6,
        color: "#fff",
        background: COLORS[state] ?? "#6b7280",
        opacity: 0.85,
      }}
    >
      {state}
    </div>
  );
}

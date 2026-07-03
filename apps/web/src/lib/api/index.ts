export { queryClient } from "./queryClient";
export * from "./employerHooks";
export * from "./censusHooks";
export * from "./planYearHooks";
export * from "./benefitHooks";
export * from "./enrollmentHooks";
export * from "./operationsHooks";
export * from "./complianceHooks";
export * from "./documentHooks";

// --- C2 GraphQL groundwork (mock mode is DEFAULT; not yet wired to any screen) ---
// The client + operations exist so the C2 seam swap is "point the queryFn at the
// operation" later. Nothing here runs unless isLiveApiEnabled() and hooks opt in.
export * from "./config";
export * from "./client";
export * from "./operations";
export * from "./dataSource";

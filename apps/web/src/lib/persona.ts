// Centralized role/persona VOCABULARY + WORKFLOW navigation (frontend mock UI
// only; does not change backend permissions or routing). Sidebars are
// workflow-based and short — secondary functions live in page-level tabs (hub
// pages), not as top-level items. Every screen stays routable regardless.
import type { ComponentType } from "react";
import {
  LayoutDashboard, Building2, CalendarRange, Users, ShieldCheck, FolderOpen,
  CalendarClock, BarChart3, Sparkles, Wallet, FileUp, FileCheck2,
  FileBarChart, Plug, Settings, ListChecks, Briefcase, Network, ClipboardCheck,
  ClipboardList, Database,
} from "lucide-react";
import type { Role } from "@/lib/role-context";

type Icon = ComponentType<{ className?: string }>;
export type NavItemDef = { to: string; label: string; icon: Icon; employerScoped?: boolean; activeOn?: string[] };
export type ItemKey =
  | "dashboard" | "tasks" | "agencies" | "agencyProfile" | "brokers" | "bookOfBusiness" | "employers" | "renewals" | "users" | "migration"
  | "employerSetup" | "planYears" | "planYearSetup" | "census" | "plansRates" | "documents"
  | "enrollmentEvents" | "enrollmentProgress" | "electionsReview" | "waiverReview" | "lifeEvents"
  | "deductions" | "payrollData" | "carrierExports" | "acaCobra"
  | "eligibility" | "payrollDeductions"
  | "reports" | "integrations" | "settings";

const E = "/employers/$employerId";

// Master item catalog. Some keys are legacy screens kept ROUTABLE (not in any
// sidebar) — they're reached from hub tabs / checklist links.
export const NAV_ITEMS: Record<ItemKey, NavItemDef> = {
  dashboard: { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  tasks: { to: `${E}/tasks`, label: "Tasks / Needs Attention", icon: ClipboardList, employerScoped: true },
  agencies: { to: "/agencies", label: "Agencies", icon: Network },
  agencyProfile: { to: "/agency", label: "Agency Profile", icon: Network },
  brokers: { to: "/agency/brokers", label: "Brokers / Producers", icon: Users },
  bookOfBusiness: { to: "/book-of-business", label: "Book of Business", icon: Briefcase },
  employers: { to: "/employers", label: "Employers", icon: Building2 },
  renewals: { to: "/renewals", label: "Renewals", icon: CalendarClock },
  users: { to: "/users", label: "Users", icon: Users },
  migration: { to: "/migration", label: "Migration", icon: Database },

  employerSetup: { to: `${E}/setup`, label: "Employer Profile", icon: Building2, employerScoped: true },
  planYears: { to: `${E}/plan-years`, label: "Plan Years", icon: CalendarRange, employerScoped: true },
  planYearSetup: { to: `${E}/plan-years/$planYearId/setup`, label: "Plan Year Setup", icon: ListChecks, employerScoped: true },
  census: { to: `${E}/census`, label: "Employee Census", icon: Users, employerScoped: true, activeOn: [`${E}/census`, `${E}/employees`] },
  plansRates: { to: `${E}/benefit-plans`, label: "Plans & Rates", icon: ShieldCheck, employerScoped: true },
  documents: { to: `${E}/documents`, label: "Documents & Forms", icon: FolderOpen, employerScoped: true },

  enrollmentEvents: { to: `${E}/enrollment-events`, label: "Enrollment Center", icon: CalendarClock, employerScoped: true },
  enrollmentProgress: { to: `${E}/enrollment-progress`, label: "Enrollment Progress", icon: BarChart3, employerScoped: true },
  electionsReview: { to: `${E}/elections-review`, label: "Elections Review", icon: ClipboardCheck, employerScoped: true },
  waiverReview: { to: `${E}/waiver-review`, label: "Waiver Review", icon: ClipboardCheck, employerScoped: true },
  lifeEvents: { to: `${E}/life-events`, label: "Life Events", icon: Sparkles, employerScoped: true },

  deductions: { to: `${E}/deductions`, label: "Deductions", icon: Wallet, employerScoped: true },
  payrollData: { to: `${E}/payroll-data`, label: "Payroll Data", icon: Database, employerScoped: true },
  carrierExports: { to: `${E}/carrier-exports`, label: "Carrier Files", icon: FileUp, employerScoped: true },
  acaCobra: { to: `${E}/compliance`, label: "Compliance", icon: FileCheck2, employerScoped: true },

  // legacy (routable, not in sidebar)
  eligibility: { to: `${E}/eligibility-contributions`, label: "Eligibility & Contributions", icon: ShieldCheck, employerScoped: true },
  payrollDeductions: { to: `${E}/payroll-deductions`, label: "Payroll Deductions", icon: Wallet, employerScoped: true },
  // NOTE: ACA/ALE and COBRA are TABS inside the single "Compliance" workspace, not
  // separate sidebar items. Their routes remain for direct URL only (see router).

  reports: { to: "/reports", label: "Reports", icon: FileBarChart },
  integrations: { to: "/integrations", label: "Integrations", icon: Plug },
  settings: { to: "/settings", label: "Settings", icon: Settings },
};

// A persona item is a key, or a {key,label} to override the display label.
export type PersonaItem = ItemKey | { key: ItemKey; label: string };
export type PersonaGroup = { label: string; items: PersonaItem[] };
export type BookVocab = { title: string; subtitle: string; worklistTitle: string; needsAttentionTitle: string };
export type PersonaNav = {
  dashboardTitle: string;
  dashboardSubtitle: string;
  employerSelector: boolean;
  groups: PersonaGroup[];
  book: BookVocab;
};

export function itemKey(i: PersonaItem): ItemKey { return typeof i === "string" ? i : i.key; }
export function itemLabel(i: PersonaItem): string { return typeof i === "string" ? NAV_ITEMS[i].label : i.label; }

const brokerBook: BookVocab = {
  title: "Book of Business",
  subtitle: "Your assigned employers — worklist across all clients",
  worklistTitle: "Client Worklist",
  needsAttentionTitle: "Needs Attention Across Clients",
};

type AdminRole = Exclude<Role, "employee">;

export const personaNav: Record<AdminRole, PersonaNav> = {
  platform_admin: {
    dashboardTitle: "Platform Dashboard",
    dashboardSubtitle: "Overview across agencies, employers, and system activity",
    employerSelector: true,
    groups: [
      { label: "Workspace", items: [{ key: "dashboard", label: "Platform Dashboard" }] },
      { label: "Management", items: ["agencies", "employers", "users"] },
      { label: "Operations", items: ["integrations", "migration"] },
      { label: "Reports & Admin", items: ["reports", "settings"] },
    ],
    book: { ...brokerBook, subtitle: "All employers across agencies" },
  },
  agency_admin: {
    dashboardTitle: "Agency Dashboard",
    dashboardSubtitle: "Overview across your brokers and employers",
    employerSelector: true,
    groups: [
      { label: "Workspace", items: [{ key: "dashboard", label: "Agency Dashboard" }, "bookOfBusiness"] },
      { label: "Agency", items: ["agencyProfile", "brokers"] },
      { label: "Employers", items: [{ key: "employers", label: "Employer Directory" }, "renewals", "planYearSetup", "enrollmentProgress"] },
      // Payroll is EMPLOYER-level only — agencies/brokers do not manage payroll.
      { label: "Operations", items: ["carrierExports"] },
      { label: "Reports", items: ["reports", "integrations"] },
    ],
    book: brokerBook,
  },
  broker: {
    dashboardTitle: "Broker Dashboard",
    dashboardSubtitle: "Your assigned employers and what needs attention",
    employerSelector: true,
    groups: [
      { label: "Workspace", items: ["dashboard", "bookOfBusiness"] },
      { label: "Employers", items: [{ key: "employers", label: "Employer Directory" }, "renewals", "planYearSetup", "enrollmentProgress"] },
      // Payroll is EMPLOYER-level only — agencies/brokers do not manage payroll.
      { label: "Operations", items: ["carrierExports"] },
      { label: "Reports", items: ["reports"] },
    ],
    book: brokerBook,
  },
  employer_admin: {
    dashboardTitle: "Company Dashboard",
    dashboardSubtitle: "Manage your company's benefits setup, enrollment, and compliance",
    employerSelector: false,
    groups: [
      { label: "Workspace", items: ["dashboard", "tasks"] },
      { label: "People", items: ["census"] },
      // Plan Years is the overview; "Continue Setup" drills into a specific year.
      { label: "Benefits", items: ["planYears", "plansRates", "documents"] },
      { label: "Enrollment", items: ["enrollmentEvents", "electionsReview", "lifeEvents"] },
      { label: "Operations", items: ["payrollData", "deductions", "carrierExports"] },
      { label: "Compliance", items: ["acaCobra"] },
      { label: "Reports", items: ["reports"] },
    ],
    book: {
      title: "Benefits Dashboard",
      subtitle: "Your company benefits workspace",
      worklistTitle: "Benefits Worklist",
      needsAttentionTitle: "Needs Attention",
    },
  },
};

export function getPersonaNav(role: Role): PersonaNav {
  return personaNav[(role as AdminRole)] ?? personaNav.employer_admin;
}

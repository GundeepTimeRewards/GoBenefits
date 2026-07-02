import type { ReactNode } from "react";
import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { EmployeeShell } from "@/components/EmployeeShell";
import type { RouteGuardMeta } from "@/lib/app-config";
import { DEFAULT_EMPLOYER_ID } from "@/lib/mock/db";

import { DashboardPage } from "@/pages/DashboardPage";
import { EmployerSetupPage } from "@/pages/EmployerSetupPage";
import { CensusPage } from "@/pages/CensusPage";
import { EmployeeDetailPage } from "@/pages/EmployeeDetailPage";
import { PlanYearSetupPage } from "@/pages/PlanYearSetupPage";
import { PayrollDeductionsPage, CarrierExportsPage } from "@/pages/ListScreens";
import { LifeEventsPage } from "@/pages/LifeEventsPage";
import { DocumentsPage } from "@/pages/DocumentsPage";
import { PlanYearsPage } from "@/pages/PlanYearsPage";
import { EligibilityPage } from "@/pages/EligibilityPage";
import { EnrollmentEventsPage, EnrollmentProgressPage } from "@/pages/EnrollmentPages";
import { CompliancePage, CobraPage } from "@/pages/CompliancePages";
import { ReportsPage, IntegrationsPage, SettingsPage } from "@/pages/MiscPages";
import { AgenciesPage, AgencyOverviewPage, BrokersPage, BookOfBusinessPage, EmployersListPage, EmployerOverviewPage } from "@/pages/AgencyScreens";
import { ElectionsReviewPage, WaiverReviewPage } from "@/pages/ReviewScreens";
import { CompliancePage as ComplianceWorkspacePage } from "@/pages/CompliancePage";
import { DeductionsPage } from "@/pages/DeductionsPage";
import { PayrollDataPage } from "@/pages/PayrollDataPage";
import { PlansRatesPage, PlanDetailPage } from "@/pages/PlansRatesPage";
import { TasksPage, RenewalsPage, UsersPage, MigrationPage } from "@/pages/AdminExtraPages";
import { MyBenefitsPage, MyElectionsPage, MyDependentsPage, MyDocumentsPage, MyLifeEventsPage, ConfirmationPage, HelpPage } from "@/pages/employee/EmployeeSelfPages";
import { EnrollPage } from "@/pages/employee/EnrollPage";
import { ReportLifeEventPage } from "@/pages/employee/ReportLifeEventPage";

// Auth-guard metadata placeholders (NOT enforced in FE; backend is source of truth).
declare module "@tanstack/react-router" {
  interface StaticDataRouteOption extends RouteGuardMeta {}
}

const rootRoute = createRootRoute(); // renders <Outlet/>

// Layout routes: admin (HR/broker/agency/platform) vs employee self-service.
const adminLayout = createRoute({ getParentRoute: () => rootRoute, id: "admin", component: AppShell });
const employeeLayout = createRoute({ getParentRoute: () => rootRoute, path: "/employee", component: EmployeeShell, staticData: { scopeType: "employee" } });

// Generic over the literal path so the router keeps typed paths for <Link>.
const a = <P extends string>(path: P, component: () => ReactNode, guard: RouteGuardMeta = {}) =>
  createRoute({ getParentRoute: () => adminLayout, path, component, staticData: guard });
const em = <P extends string>(path: P, component: () => ReactNode) =>
  createRoute({ getParentRoute: () => employeeLayout, path, component, staticData: { scopeType: "employee" } });

const EMP = { scopeType: "employer" } as const;

const routeTree = rootRoute.addChildren([
  adminLayout.addChildren([
    createRoute({ getParentRoute: () => adminLayout, path: "/", beforeLoad: () => { throw redirect({ to: "/dashboard" }); } }),
    // Forgiving redirects: bare/short or legacy Plans & Rates URLs → the employer-scoped page.
    createRoute({ getParentRoute: () => adminLayout, path: "/benefit-plans", beforeLoad: () => { throw redirect({ to: "/employers/$employerId/benefit-plans", params: { employerId: DEFAULT_EMPLOYER_ID } }); } }),
    createRoute({ getParentRoute: () => adminLayout, path: "/plans-rates", beforeLoad: () => { throw redirect({ to: "/employers/$employerId/benefit-plans", params: { employerId: DEFAULT_EMPLOYER_ID } }); } }),
    a("/dashboard", DashboardPage, { scopeType: "employer", requiredPermission: "employer.read" }),

    // Agency / broker
    a("/agencies", AgenciesPage, { scopeType: "platform", requiredPermission: "agency.read" }),
    a("/agencies/$agencyId", AgencyOverviewPage, { scopeType: "agency", requiredPermission: "agency.read" }),
    a("/agency", AgencyOverviewPage, { scopeType: "agency", requiredPermission: "agency.read" }),
    a("/agency/brokers", BrokersPage, { scopeType: "agency", requiredPermission: "broker.read" }),
    a("/agencies/$agencyId/brokers", AgencyOverviewPage, { scopeType: "agency", requiredPermission: "broker.read" }),
    a("/agencies/$agencyId/employers", EmployersListPage, { scopeType: "agency", requiredPermission: "employer.read" }),
    a("/book-of-business", BookOfBusinessPage, { scopeType: "broker", requiredPermission: "employer.read" }),
    a("/employers", EmployersListPage, { scopeType: "broker", requiredPermission: "employer.read" }),
    a("/renewals", RenewalsPage, { scopeType: "broker", requiredPermission: "employer.read" }),
    a("/users", UsersPage, { scopeType: "platform", requiredPermission: "settings.read" }),
    a("/migration", MigrationPage, { scopeType: "platform", requiredPermission: "migration.manage" }),

    // Employer-scoped
    a("/employers/$employerId", EmployerOverviewPage, { ...EMP, requiredPermission: "employer.read" }),
    a("/employers/$employerId/setup", EmployerSetupPage, { ...EMP, requiredPermission: "employer.read" }),
    a("/employers/$employerId/locations", EmployerSetupPage, { ...EMP, requiredPermission: "employer.read" }),
    a("/employers/$employerId/contacts", EmployerSetupPage, { ...EMP, requiredPermission: "employer_contact.read" }),
    a("/employers/$employerId/payroll-tax", EmployerSetupPage, { ...EMP, requiredPermission: "employer.read" }),
    a("/employers/$employerId/aca-cobra", EmployerSetupPage, { ...EMP, requiredPermission: "aca.read" }),
    a("/employers/$employerId/plan-years", PlanYearsPage, { ...EMP, requiredPermission: "plan_year.read" }),
    a("/employers/$employerId/plan-years/$planYearId/setup", PlanYearSetupPage, { ...EMP, requiredPermission: "plan_year.read" }),
    a("/employers/$employerId/tasks", TasksPage, { ...EMP, requiredPermission: "employer.read" }),
    a("/employers/$employerId/census", CensusPage, { ...EMP, requiredPermission: "employee.read" }),
    a("/employers/$employerId/employees/$employeeId", EmployeeDetailPage, { ...EMP, requiredPermission: "employee.read" }),
    // Plans & Rates is the single canonical benefit-plan setup surface. Route stays
    // /benefit-plans for now (checklist + docs link here); label/title = "Plans & Rates".
    a("/employers/$employerId/benefit-plans", PlansRatesPage, { ...EMP, requiredPermission: "benefit_plan.read" }),
    a("/employers/$employerId/benefit-plans/$planId", PlanDetailPage, { ...EMP, requiredPermission: "benefit_plan.read" }),
    // Deductions (recurring per-pay-period workflow) and Payroll Data (setup/compliance)
    // are separate Operations items. Legacy /payroll maps to Payroll Data only.
    a("/employers/$employerId/deductions", DeductionsPage, { ...EMP, requiredPermission: "payroll.read" }),
    a("/employers/$employerId/payroll-data", PayrollDataPage, { ...EMP, requiredPermission: "payroll.read" }),
    a("/employers/$employerId/payroll", PayrollDataPage, { ...EMP, requiredPermission: "payroll.read" }),
    a("/employers/$employerId/compliance", ComplianceWorkspacePage, { ...EMP, requiredPermission: "aca.read" }),
    a("/employers/$employerId/eligibility-contributions", EligibilityPage, { ...EMP, requiredPermission: "contribution.read" }),
    a("/employers/$employerId/documents", DocumentsPage, { ...EMP, requiredPermission: "documents.read" }),
    a("/employers/$employerId/enrollment-events", EnrollmentEventsPage, { ...EMP, requiredPermission: "enrollment.read" }),
    a("/employers/$employerId/enrollment-progress", EnrollmentProgressPage, { ...EMP, requiredPermission: "enrollment.read" }),
    a("/employers/$employerId/elections-review", ElectionsReviewPage, { ...EMP, requiredPermission: "election.read" }),
    a("/employers/$employerId/waiver-review", WaiverReviewPage, { ...EMP, requiredPermission: "election.read" }),
    a("/employers/$employerId/life-events", LifeEventsPage, { ...EMP, requiredPermission: "life_event.read" }),
    a("/employers/$employerId/payroll-deductions", PayrollDeductionsPage, { ...EMP, requiredPermission: "payroll.read" }),
    a("/employers/$employerId/carrier-exports", CarrierExportsPage, { ...EMP, requiredPermission: "carrier_export.read" }),
    a("/employers/$employerId/aca-ale", CompliancePage, { ...EMP, requiredPermission: "aca.read" }),
    a("/employers/$employerId/cobra", CobraPage, { ...EMP, requiredPermission: "cobra.read" }),

    // Platform
    a("/reports", ReportsPage, { scopeType: "platform", requiredPermission: "reports.read" }),
    a("/integrations", IntegrationsPage, { scopeType: "platform" }),
    a("/settings", SettingsPage, { scopeType: "platform", requiredPermission: "settings.read" }),
  ]),

  employeeLayout.addChildren([
    em("/", MyBenefitsPage),
    em("benefits", MyBenefitsPage),
    em("enroll", EnrollPage),
    em("enroll/confirm", ConfirmationPage),
    em("elections", MyElectionsPage),
    em("dependents", MyDependentsPage),
    em("life-events", MyLifeEventsPage),
    em("life-events/report", ReportLifeEventPage),
    em("documents", MyDocumentsPage),
    em("help", HelpPage),
  ]),
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

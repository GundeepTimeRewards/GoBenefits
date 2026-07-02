import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { router } from "@/router";
import { queryClient } from "@/lib/api";
import { RoleProvider } from "@/lib/role-context";
import { EmployerProvider } from "@/lib/employer-context";
import { PlanYearProvider } from "@/lib/plan-year-context";
import "@/styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RoleProvider>
        <EmployerProvider>
          <PlanYearProvider>
            <RouterProvider router={router} />
          </PlanYearProvider>
        </EmployerProvider>
      </RoleProvider>
    </QueryClientProvider>
  </StrictMode>,
);

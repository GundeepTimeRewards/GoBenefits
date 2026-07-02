import { QueryClient } from "@tanstack/react-query";

// One QueryClient for the app. Mock data never changes, so we disable retries /
// refetch-on-focus and keep results fresh forever. When AppSync lands, only the
// queryFns (in the hook modules) change — screens and query keys stay the same.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      gcTime: Infinity,
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

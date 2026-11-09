import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './api';

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Don't retry client errors (4xx); one retry for network or server errors.
        retry: (count, error) => count < 1 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  });
}

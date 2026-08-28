'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchMe } from '@/lib/auth';

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => fetchMe(),
    staleTime: 5 * 60_000,
  });
}

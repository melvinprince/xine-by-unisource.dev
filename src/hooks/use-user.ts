import useSWR from 'swr';
import type { User } from '@/lib/types';

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useUser() {
  const { data, error, isLoading, mutate } = useSWR<User>('/api/auth/me', fetcher, {
    shouldRetryOnError: false,
  });

  return {
    user: data && !('error' in data) ? data : null,
    loading: isLoading,
    error: error || (data && 'error' in data ? data.error : null),
    mutate,
  };
}

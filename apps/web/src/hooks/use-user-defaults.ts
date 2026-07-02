import { api } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';

/**
 * The current user's «Значения по умолчанию» (GET /user-settings) with the
 * reference NAMES resolved server-side. A new document pre-fills from these
 * (moysklad applies the user defaults to EVERY new document, not just one
 * form). Shared so every doc /new page applies them the same way.
 */
export interface UserDefaultRef {
  id: string;
  name: string;
}
export interface UserDefaults {
  defaultCompany: UserDefaultRef | null;
  defaultStore: UserDefaultRef | null;
  defaultProject: UserDefaultRef | null;
  defaultCustomer: UserDefaultRef | null;
  defaultSupplier: UserDefaultRef | null;
}

export function useUserDefaults() {
  return useQuery<UserDefaults>({
    queryKey: ['user-settings'],
    queryFn: () => api.get<UserDefaults>('/user-settings'),
  });
}

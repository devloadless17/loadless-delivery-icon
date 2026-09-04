'use client';

import { useCallback, useMemo, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * List filters and page number, kept in the URL instead of in useState.
 *
 * Every list screen used to hold this in component state alone, so refreshing a
 * filtered page 3 dropped you back to page 1 with the filters cleared and no
 * indication anything had been lost — and a filtered view could not be
 * bookmarked or sent to anyone. Both matter on screens an operator lives in.
 *
 * Two rules are baked in rather than left to each caller:
 *
 *   - A value equal to its default is REMOVED from the query string, so the
 *     common case stays a clean `/admin/orders` rather than a wall of
 *     `?status=ALL&vendorId=ALL&…`.
 *   - Changing any filter RESETS the page. Staying on page 7 while the filter
 *     narrows to three results is the classic way a list lies to you: an empty
 *     screen that looks like "no matches" when the matches are on page 1.
 *
 * `router.replace`, not `push`: a debounced search box would otherwise stack a
 * history entry per keystroke and turn the back button into a typing replay.
 */
export function useUrlState<T extends Record<string, string>>(
  defaults: T,
): [T, (patch: Partial<T>) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  // Callers pass an object literal, so its identity changes every render. The
  // KEYS and default values are what matter and those are static.
  const defaultsRef = useRef(defaults);

  const state = useMemo(() => {
    const out = { ...defaultsRef.current };
    for (const key of Object.keys(defaultsRef.current) as Array<keyof T & string>) {
      const value = params.get(key);
      if (value !== null) out[key] = value as T[keyof T & string];
    }
    return out;
  }, [params]);

  const setState = useCallback(
    (patch: Partial<T>) => {
      const next = new URLSearchParams(params.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined) continue;
        if (value === defaultsRef.current[key] || value === '') next.delete(key);
        else next.set(key, value);
      }
      // Any change that is not itself a page change starts again at page one.
      if (!('page' in patch) && 'page' in defaultsRef.current) next.delete('page');
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return [state, setState];
}

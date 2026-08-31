import { Briefcase, Home, MapPin } from 'lucide-react';
import type { AddressLabel } from '@loadless/shared';

/** One definition of how an address label looks, shared by every surface. */
export const LABEL_ICON = { HOME: Home, WORK: Briefcase, OTHER: MapPin } as const;
export const LABEL_TEXT: Record<AddressLabel, string> = {
  HOME: 'Home',
  WORK: 'Work',
  OTHER: 'Other',
};

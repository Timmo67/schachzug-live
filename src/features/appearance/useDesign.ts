import { useAuth } from '../auth/AuthProvider';
import { effectiveDesign } from './designs';

/** Board and piece design of the signed-in user (defaults when signed out or without Plus). */
export function useDesign() {
  const { profile, entitlement } = useAuth();
  return effectiveDesign(profile?.board_theme, profile?.piece_set, !!entitlement && entitlement.plan !== 'free');
}

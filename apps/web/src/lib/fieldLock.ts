import type { FieldLock } from "@aeon/types";

// Whether a given field is currently shown as locked to the CURRENT viewer — a field
// locked by the viewer's own other tab/session (same userId) never greys out for them,
// only a genuinely different collaborator's lock does.
export function lockStatus(
  fieldLocks: Record<string, FieldLock>,
  fieldKey: string,
  currentUserId: string | undefined
): { lockedByOther: false } | { lockedByOther: true; lockedByName: string } {
  const lock = fieldLocks[fieldKey];
  if (!lock || lock.userId === currentUserId) return { lockedByOther: false };
  return { lockedByOther: true, lockedByName: lock.userName };
}

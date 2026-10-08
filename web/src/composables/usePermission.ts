import { computed } from 'vue'
import { SUPER_ADMIN_ROLE_ID, userCan } from '@/lib/permissions'
import { useProfile } from './queries/useProfile'

/**
 * Permission checks for templates (`v-if="can('campaigns:manage')"`).
 * While the profile is loading everything is denied, so gated UI never flashes in then out.
 */
export function usePermission() {
  const { data: profile } = useProfile()

  const isSuperAdmin = computed(() => profile.value?.user_role?.id === SUPER_ADMIN_ROLE_ID)

  /** True if the user has ANY of the given permissions (`campaigns:*` matches a whole group). */
  const can = (...wanted: string[]) => userCan(profile.value, ...wanted)

  /** Per-list permission from the user's list role. Global list permissions cover every list. */
  function canList(listId: number, perm: 'list:get' | 'list:manage'): boolean {
    if (can('lists:get_all', 'lists:manage_all')) return true
    const lists = profile.value?.list_role?.lists ?? []
    return lists.some((l) => l.id === listId && l.permissions?.includes(perm))
  }

  return { can, canList, isSuperAdmin }
}

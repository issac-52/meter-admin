import { createClient as createServerClient } from '@/shared/lib/supabase/server';
import { createAdminClient } from '@/shared/lib/supabase/admin';

export type UserRole = 'admin' | 'viewer';

// 세션 없음 또는 profiles row 없음 → 'viewer'로 fail-closed
export async function getUserRole(): Promise<UserRole> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 'viewer';

  const admin = createAdminClient();
  const { data } = await admin.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return data?.role === 'admin' ? 'admin' : 'viewer';
}

// 스레드 전용 프로필 — 메인 닉네임과 분리된 /threads 페이지용 핸들·bio·아바타·테마색.
// 없으면 null. 호출 측에서 profiles 의 display_name·avatar_url 로 fallback.

// Supabase 의 PostgrestFilterBuilder 는 thenable. 강한 타이핑은 deep instantiation 유발.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseLike = any;

export type ThreadProfile = {
  user_id: string;
  handle: string | null;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  theme_color: string | null;
};

export async function fetchThreadProfile(
  supabase: SupabaseLike,
  userId: string,
): Promise<ThreadProfile | null> {
  if (!userId) return null;
  const { data, error } = await supabase
    .from('thread_profiles')
    .select('user_id, handle, display_name, bio, avatar_url, theme_color')
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) return null;
  const d = data as Record<string, unknown>;
  return {
    user_id: String(d.user_id ?? userId),
    handle: (d.handle as string | null) ?? null,
    display_name: (d.display_name as string | null) ?? null,
    bio: (d.bio as string | null) ?? null,
    avatar_url: (d.avatar_url as string | null) ?? null,
    theme_color: (d.theme_color as string | null) ?? null,
  };
}

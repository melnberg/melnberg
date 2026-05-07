'use client';

// 스레드 전용 프로필 편집.
// handle / display_name / bio / avatar / theme_color
// post-images 버킷 재사용 (같은 webp 변환).
// theme_color: 프리셋 5색 (PPT 톤 + 차분한 보조색) + custom HEX.

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fileToWebp } from '@/lib/image-to-webp';

type Initial = {
  handle: string;
  display_name: string;
  bio: string;
  avatar_url: string | null;
  theme_color: string | null;
};

type Props = {
  userId: string;
  initial: Initial;
  fallback: { display_name: string | null; avatar_url: string | null };
};

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;
const HANDLE_RE = /^[a-z0-9_.\-]{1,30}$/i;

// 프리셋 — 차분한 일기장 톤. PPT 3색 포함.
const PRESETS: Array<{ label: string; hex: string }> = [
  { label: '네이비', hex: '#002060' },
  { label: '미드블루', hex: '#0070C0' },
  { label: '시안', hex: '#00B0F0' },
  { label: '회색', hex: '#6c757d' },
  { label: '연핑크', hex: '#fadadd' },
  { label: '연크림', hex: '#f5e9d4' },
];

export default function ThreadProfileForm({ userId, initial, fallback }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [handle, setHandle] = useState(initial.handle);
  const [displayName, setDisplayName] = useState(initial.display_name);
  const [bio, setBio] = useState(initial.bio);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial.avatar_url);
  const [themeColor, setThemeColor] = useState<string | null>(initial.theme_color);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'error' | 'info'; text: string } | null>(null);

  const previewName = displayName.trim() || fallback.display_name || '회원';
  const previewAvatar = avatarUrl || fallback.avatar_url;

  async function uploadAvatar(file: File) {
    if (uploading) return;
    if (!file.type.startsWith('image/')) {
      setMsg({ type: 'error', text: '이미지 파일만 업로드 가능합니다.' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setMsg({ type: 'error', text: '파일 크기는 2MB 이하만 가능합니다.' });
      return;
    }
    setUploading(true);
    setMsg(null);
    try {
      const converted = await fileToWebp(file, { maxWidth: 512, quality: 0.85 }).catch(() => null);
      const blob = converted?.blob ?? file;
      const isWebp = blob !== file;
      const ext = isWebp ? 'webp' : (file.name.split('.').pop()?.toLowerCase() ?? 'jpg');
      const contentType = isWebp ? 'image/webp' : file.type;
      const path = `${userId}/thread-avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('post-images').upload(path, blob, { contentType });
      if (upErr) {
        setMsg({ type: 'error', text: `업로드 실패: ${upErr.message}` });
        return;
      }
      const { data: { publicUrl } } = supabase.storage.from('post-images').getPublicUrl(path);
      setAvatarUrl(publicUrl);
      setMsg({ type: 'info', text: '✓ 미리보기 적용. 하단 저장 버튼을 눌러주세요.' });
    } finally {
      setUploading(false);
    }
  }

  function clearAvatar() {
    setAvatarUrl(null);
  }

  async function handleSave() {
    if (saving) return;
    setMsg(null);

    const handleClean = handle.trim().replace(/^@/, '');
    if (handleClean && !HANDLE_RE.test(handleClean)) {
      setMsg({ type: 'error', text: '핸들은 영문·숫자·_·.·- 만 가능 (1~30자).' });
      return;
    }
    const nameClean = displayName.trim();
    if (nameClean.length > 30) {
      setMsg({ type: 'error', text: '닉네임은 30자 이내.' });
      return;
    }
    const bioClean = bio.trim();
    if (bioClean.length > 300) {
      setMsg({ type: 'error', text: '소개는 300자 이내.' });
      return;
    }
    const colorClean = themeColor && HEX_RE.test(themeColor) ? themeColor : null;

    setSaving(true);
    const payload = {
      user_id: userId,
      handle: handleClean || null,
      display_name: nameClean || null,
      bio: bioClean || null,
      avatar_url: avatarUrl,
      theme_color: colorClean,
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase
      .from('thread_profiles')
      .upsert(payload, { onConflict: 'user_id' });
    setSaving(false);
    if (error) {
      setMsg({ type: 'error', text: `저장 실패: ${error.message}` });
      return;
    }
    setMsg({ type: 'info', text: '✓ 저장됨. 잠시 후 이동…' });
    router.refresh();
    setTimeout(() => router.push('/threads'), 400);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 미리보기 카드 */}
      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <div
          className="h-[60px] w-full"
          style={{ background: themeColor && HEX_RE.test(themeColor) ? themeColor : '#f1f3f5' }}
          aria-hidden
        />
        <div className="px-4 pb-4">
          <div className="flex items-start gap-3 -mt-10">
            {previewAvatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewAvatar}
                alt=""
                className="w-20 h-20 rounded-full object-cover border-4 border-white bg-white"
              />
            ) : (
              <div className="w-20 h-20 rounded-full border-4 border-white bg-navy-soft flex items-center justify-center text-navy text-[24px] font-bold">
                {(previewName[0] ?? '?').toUpperCase()}
              </div>
            )}
          </div>
          <div className="mt-2">
            <div className="text-[16px] font-bold text-text leading-tight">{previewName}</div>
            {handle.trim() && (
              <div className="text-[12px] text-muted mt-0.5">
                @{handle.trim().replace(/^@/, '')}
              </div>
            )}
          </div>
          {bio.trim() && (
            <p className="mt-3 text-[13px] text-text whitespace-pre-wrap leading-relaxed">
              {bio.trim()}
            </p>
          )}
        </div>
      </div>

      {/* 폼 */}
      <div className="bg-white border border-border rounded-xl">
        {/* 아바타 */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] font-bold tracking-widest uppercase text-muted">아바타</span>
            <span className="text-[10px] text-muted">2MB 이하 · 비우면 기본 프로필 사진 사용</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="px-3 py-1.5 bg-white border border-border text-text text-[12px] font-bold whitespace-nowrap hover:border-navy cursor-pointer">
              {uploading ? '업로드중…' : avatarUrl ? '변경' : '업로드'}
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadAvatar(f);
                  e.target.value = '';
                }}
                className="hidden"
              />
            </label>
            {avatarUrl && (
              <button type="button" onClick={clearAvatar} className="text-[11px] text-muted hover:text-red-600">
                제거
              </button>
            )}
          </div>
        </div>

        {/* 핸들 */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] font-bold tracking-widest uppercase text-muted">핸들</span>
            <span className="text-[10px] text-muted">@아이디 · 영문·숫자만</span>
          </div>
          <div className="flex items-center gap-1 max-w-[280px] w-full justify-end">
            <span className="text-[14px] text-muted">@</span>
            <input
              type="text"
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              maxLength={30}
              placeholder="(미입력)"
              className="border border-border px-3 py-1.5 text-[14px] outline-none focus:border-navy w-full max-w-[240px] text-right"
            />
          </div>
        </div>

        {/* 닉네임 */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-border">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] font-bold tracking-widest uppercase text-muted">표시 이름</span>
            <span className="text-[10px] text-muted">비우면 메인 닉네임 사용</span>
          </div>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={30}
            placeholder={fallback.display_name ?? '(미입력)'}
            className="border border-border px-3 py-1.5 text-[14px] outline-none focus:border-navy w-full max-w-[280px] text-right"
          />
        </div>

        {/* bio */}
        <div className="flex flex-col px-5 py-4 gap-2 border-b border-border">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[12px] font-bold tracking-widest uppercase text-muted">소개</span>
            <span className="text-[10px] text-muted">{bio.length}/300</span>
          </div>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={300}
            rows={3}
            placeholder="이 일기장 공간에 대해 짧은 소개. 빈 칸이면 표시 안 됨."
            className="border border-border px-3 py-2 text-[13px] outline-none focus:border-navy w-full resize-y leading-relaxed"
          />
        </div>

        {/* 테마 색 */}
        <div className="flex flex-col px-5 py-4 gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[12px] font-bold tracking-widest uppercase text-muted">테마 색</span>
            <span className="text-[10px] text-muted">프로필 카드 상단 밴드 · 비우면 회색</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => {
              const active = themeColor === p.hex;
              return (
                <button
                  key={p.hex}
                  type="button"
                  onClick={() => setThemeColor(p.hex)}
                  className={`flex items-center gap-2 px-2.5 py-1.5 border text-[11px] ${active ? 'border-navy ring-1 ring-navy' : 'border-border hover:border-navy'}`}
                  title={p.hex}
                >
                  <span className="w-4 h-4 rounded-full inline-block" style={{ background: p.hex }} aria-hidden />
                  <span className="text-text">{p.label}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setThemeColor(null)}
              className={`px-2.5 py-1.5 border text-[11px] ${themeColor === null ? 'border-navy ring-1 ring-navy' : 'border-border hover:border-navy'}`}
            >
              없음
            </button>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-muted">직접 입력</span>
            <input
              type="text"
              value={themeColor ?? ''}
              onChange={(e) => {
                const v = e.target.value.trim();
                setThemeColor(v === '' ? null : v);
              }}
              placeholder="#RRGGBB"
              maxLength={7}
              className="border border-border px-2 py-1 text-[12px] outline-none focus:border-navy w-[110px] tabular-nums"
            />
            {themeColor && !HEX_RE.test(themeColor) && (
              <span className="text-[10px] text-red-600">HEX 형식 아님</span>
            )}
          </div>
        </div>
      </div>

      {/* 저장 */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-[12px]">
          {msg && (
            <span className={msg.type === 'error' ? 'text-red-700' : 'text-cyan font-bold'}>
              {msg.text}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="bg-navy text-white px-6 py-2.5 text-[13px] font-bold tracking-wider uppercase hover:bg-navy-dark disabled:opacity-30 border-none"
        >
          {saving ? '저장 중…' : '변경사항 저장'}
        </button>
      </div>
    </div>
  );
}

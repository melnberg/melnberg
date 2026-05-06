// +N mlbg 뱃지 — 단순 텍스트. 보상 정책은 /me/rewards 에서 확인.
type Props = {
  earned: number;
  kind?: 'apt_post' | 'apt_comment' | 'community_post' | 'hotdeal_post' | 'community_comment' | 'hotdeal_comment' | 'factory_comment' | 'emart_comment';
};

export default function RewardTooltip({ earned }: Props) {
  return (
    <span className="tabular-nums" style={{ font: 'inherit', color: 'inherit' }}>
      +{earned} mlbg
    </span>
  );
}

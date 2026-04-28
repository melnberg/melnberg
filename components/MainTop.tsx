import Link from 'next/link';

type Crumb = { href?: string; label: string; bold?: boolean };

export default function MainTop({ crumbs, meta }: { crumbs: Crumb[]; meta?: string }) {
  return (
    <div className="bg-white border-b border-border px-6 lg:px-10 py-3.5 flex items-center justify-between gap-6">
      <div className="lg:hidden w-9" />
      <div className="text-xs text-muted tracking-wide flex-1">
        {crumbs.map((c, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-2">›</span>}
            {c.href ? (
              <Link href={c.href} className="hover:text-navy no-underline transition-colors">
                {c.bold ? <strong className="text-navy font-bold hover:underline">{c.label}</strong> : c.label}
              </Link>
            ) : c.bold ? (
              <strong className="text-navy font-bold">{c.label}</strong>
            ) : (
              c.label
            )}
          </span>
        ))}
      </div>
      {meta && <div className="text-[11px] text-muted tracking-wider uppercase">{meta}</div>}
    </div>
  );
}

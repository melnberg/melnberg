'use client';

import { useState } from 'react';

export default function HyojaButton() {
  const [pressed, setPressed] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setPressed(true)}
      className="text-[12px] font-bold border border-border px-3 py-1.5 bg-white hover:border-cyan hover:text-cyan transition cursor-pointer whitespace-nowrap"
      aria-label={pressed ? '효자추 누름' : '효자추'}
    >
      {pressed ? '👍' : '효자추'}
    </button>
  );
}

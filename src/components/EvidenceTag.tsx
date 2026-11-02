import type { EvidenceClass } from '../domain/types';

const META: Record<EvidenceClass, { label: string; glyph: string; color: string; description: string }> = {
  observed: {
    label: 'Observed',
    glyph: '◉',
    color: 'var(--st-done)',
    description: 'Recorded by the bridge automation itself (e.g. Delivery log timestamps)',
  },
  reported: {
    label: 'Reported',
    glyph: '◐',
    color: 'var(--st-active)',
    description: 'Written by an agent about its own work; not independently verified',
  },
  hypothesis: {
    label: 'Hypothesis',
    glyph: '◇',
    color: 'var(--st-proposed)',
    description: 'An attributed assumption or proposal',
  },
  unknown: { label: 'Unknown', glyph: '?', color: 'var(--st-josh)', description: 'No evidence recorded' },
};

export function EvidenceTag({ value }: { value: EvidenceClass }) {
  const m = META[value];
  return (
    <span
      title={m.description}
      data-evidence={value}
      className="inline-flex items-center gap-1 rounded border px-1.5 py-px font-mono text-[11px] leading-4 whitespace-nowrap"
      style={{
        color: m.color,
        borderColor: `color-mix(in srgb, ${m.color} 45%, transparent)`,
        borderStyle: value === 'unknown' ? 'dashed' : 'solid',
      }}
    >
      <span aria-hidden="true">{m.glyph}</span>
      {m.label}
    </span>
  );
}

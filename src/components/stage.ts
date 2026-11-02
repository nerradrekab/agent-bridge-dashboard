import type { DeliveryStage } from '../domain/derive';

export const STAGE_META: Record<DeliveryStage, { label: string; glyph: string; color: string }> = {
  failed: { label: 'Failed', glyph: '✕', color: 'var(--st-failed)' },
  stalled: { label: 'Stalled', glyph: '⧗', color: 'var(--st-blocked)' },
  'no-signal': { label: 'No signal', glyph: '∅', color: 'var(--st-blocked)' },
  unknown: { label: 'Unknown', glyph: '?', color: 'var(--st-josh)' },
  'awaiting-processing': { label: 'Awaiting processing', glyph: '○', color: 'var(--st-waiting)' },
  processing: { label: 'Processing', glyph: '●', color: 'var(--st-active)' },
  processed: { label: 'Processed', glyph: '✓', color: 'var(--st-done)' },
};

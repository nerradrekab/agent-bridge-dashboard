import { mentionsJosh } from '../domain/derive';

// Known colours. Any other agent the API introduces falls back to --ag-other,
// so adding an agent needs no UI change.
const COLOR_BY_ALIAS: Array<[RegExp, string]> = [
  [/\b(chatgpt|gpt)\b/i, 'var(--ag-chatgpt)'],
  [/\binstinct\b/i, 'var(--ag-instinct)'],
];

export function agentColor(name: string): string {
  if (mentionsJosh(name)) return 'var(--ag-josh)';
  return COLOR_BY_ALIAS.find(([re]) => re.test(name))?.[1] ?? 'var(--ag-other)';
}

/**
 * Renders a free-text Owner/From/To cell verbatim. Colour is decorative; the
 * text itself always carries the meaning.
 */
export function AgentChip({ name }: { name: string | null | undefined }) {
  if (!name) return <span className="text-faint">—</span>;
  const color = agentColor(name);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 text-[13px]">
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      <span className="min-w-0 break-words">{name}</span>
    </span>
  );
}

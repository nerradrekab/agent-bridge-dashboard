import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { findReferences } from '../domain/derive';

export interface KnownIds {
  tasks: Iterable<string>;
  messages: Iterable<string>;
}

export function taskHref(id: string) {
  return `/tasks?task=${encodeURIComponent(id)}`;
}
export function messageHref(id: string) {
  return `/messages?msg=${encodeURIComponent(id)}`;
}

/**
 * Renders free text verbatim (line breaks preserved), turning mentions of
 * records that actually exist into links. Unknown IDs stay plain text.
 */
export function LinkedText({ text, known }: { text: string | null | undefined; known: KnownIds }) {
  if (!text) return null;
  const taskIds = new Set(findReferences(text, known.tasks));
  const msgIds = new Set(findReferences(text, known.messages));
  const ids = [...taskIds, ...msgIds].sort((a, b) => b.length - a.length);
  if (ids.length === 0) return <span className="whitespace-pre-wrap">{text}</span>;

  const escaped = ids.map((id) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(?<![A-Za-z0-9-])(${escaped.join('|')})(?![A-Za-z0-9])`, 'g');
  const parts = text.split(re);
  return (
    <span className="whitespace-pre-wrap">
      {parts.map((p, i) =>
        i % 2 === 1 ? (
          <Link key={i} to={taskIds.has(p) ? taskHref(p) : messageHref(p)} className="font-mono text-[12px] text-accent hover:underline">
            {p}
          </Link>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </span>
  );
}

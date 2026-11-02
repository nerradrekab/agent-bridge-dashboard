import * as Dialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}

/** Right-side detail panel. Radix handles focus trap, Esc and scroll lock. */
export function Drawer({ open, onOpenChange, title, subtitle, children }: Props) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
        <Dialog.Content
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[640px] flex-col border-l border-line bg-surface shadow-2xl focus:outline-none"
          aria-describedby={undefined}
        >
          <header className="flex items-start gap-3 border-b border-line px-5 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[15px] font-semibold leading-snug break-words">{title}</Dialog.Title>
              {subtitle && <div className="mt-1 text-[12px] text-muted">{subtitle}</div>}
            </div>
            <Dialog.Close
              className="rounded px-2 py-1 text-muted hover:bg-surface-2 hover:text-fg"
              aria-label="Close details"
            >
              ✕
            </Dialog.Close>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Label/value rows for drawer bodies. */
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line py-2.5 sm:grid-cols-[170px_1fr] sm:gap-4">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="min-w-0 text-[13px] break-words whitespace-pre-wrap">{children}</dd>
    </div>
  );
}

export function Empty({ children = 'Not recorded' }: { children?: ReactNode }) {
  return <span className="text-faint italic">{children}</span>;
}

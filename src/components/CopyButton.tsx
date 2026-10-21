import { useState } from 'react';
import { Icon } from './Icon';

/** Copies `text`, then says so for two seconds. */
export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      setTimeout(() => setDone(false), 2000);
    } catch {
      // clipboard blocked: the text is selectable on screen
    }
  };
  return (
    <button type="button" className="btn btn-small" onClick={copy} aria-live="polite">
      <Icon name={done ? 'check' : 'copy'} size={16} />
      {done ? 'Copied' : label}
    </button>
  );
}

/** A value to paste somewhere, shown in full with a copy button. */
export function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="copy-field">
      <span className="field-label">{label}</span>
      <div className="copy-row">
        <code>{value}</code>
        <CopyButton text={value} />
      </div>
    </div>
  );
}

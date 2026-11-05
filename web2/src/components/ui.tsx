import katex from 'katex';
import { useMemo, useState, type ReactNode } from 'react';

export type Grade = 'sim' | 'lit' | 'model' | 'prop' | 'cont' | 'neg' | 'ok';
const GRADE_LABEL: Record<Grade, string> = {
  sim: 'Simulated (this work)', lit: 'Reported in literature', model: 'Analytical model', prop: 'Engineering proposal',
  cont: 'Contested / unverified', neg: 'Negative result', ok: 'Supported',
};

export function Badge({ g, children }: { g: Grade; children?: ReactNode }) {
  return <span className={`badge ${g}`} title={GRADE_LABEL[g]}>{children ?? GRADE_LABEL[g]}</span>;
}

export function Stat({ v, k, sub }: { v: ReactNode; k: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stat">
      <span className="v">{v}</span>
      <span className="k">{k}</span>
      {sub && <span className="small muted">{sub}</span>}
    </div>
  );
}

export function TeX({ children, block = false }: { children: string; block?: boolean }) {
  const html = useMemo(() => katex.renderToString(children, { displayMode: block, throwOnError: false, output: 'html' }), [children, block]);
  return block ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}

export function CopyBox({ text, label, rows = 10, id }: { text: string; label: string; rows?: number; id: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  return (
    <div className="stack" style={{ gap: '0.4rem' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="eyebrow">{label}</span>
        <button className="btn sm" type="button" onClick={() => {
          navigator.clipboard?.writeText(text).then(() => setState('ok'), () => {
            const el = document.getElementById(id) as HTMLTextAreaElement | null;
            el?.select();
            setState('fail');
          });
        }}>{state === 'ok' ? 'Copied' : state === 'fail' ? 'Selected — press Ctrl/⌘+C' : 'Copy'}</button>
      </div>
      <textarea id={id} readOnly rows={rows} value={text} onFocus={(e) => e.currentTarget.select()} />
    </div>
  );
}

export function Panel({ title, eyebrow, right, children, className = '' }: { title?: ReactNode; eyebrow?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`panel ${className}`}>
      {(title || right || eyebrow) && (
        <div className="panel-head">
          <div className="stack" style={{ gap: '0.2rem' }}>
            {eyebrow && <span className="eyebrow">{eyebrow}</span>}
            {title && <h3>{title}</h3>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function PageHead({ eyebrow, title, children }: { eyebrow: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="wrap" style={{ paddingBlock: 'clamp(2rem, 5vw, 3.2rem) 1.5rem', display: 'grid', gap: '0.9rem' }}>
      <span className="eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      {children && <div className="prose" style={{ fontSize: '1.02rem' }}>{children}</div>}
    </header>
  );
}

export function Hypothesis({ id, statement, verdict, grade }: { id: string; statement: ReactNode; verdict: ReactNode; grade: Grade }) {
  return (
    <div className="panel tight" style={{ display: 'grid', gap: '0.4rem' }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="eyebrow"><b>{id}</b> · hypothesis</span>
        <Badge g={grade} />
      </div>
      <p style={{ color: 'var(--fg)' }}>{statement}</p>
      <p className="small muted">{verdict}</p>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { renderMarkdown } from './Markdown';
import { CopyBox } from './ui';

export function DocView({ source, id }: { source: string; id: string }) {
  const { html, toc } = useMemo(() => renderMarkdown(source), [source]);
  const [raw, setRaw] = useState(false);
  return (
    <div className="wrap report" style={{ paddingBottom: '3rem' }}>
      <aside className="toc" aria-label="Contents">
        <span className="eyebrow" style={{ marginBottom: '0.4rem' }}>Contents</span>
        {toc.map((t) => (
          <a key={t.id} href={`#${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(t.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }} style={{ paddingLeft: t.level === 3 ? 12 : 0 }}>{t.text}</a>
        ))}
        <button className="btn sm" style={{ marginTop: '0.8rem', justifySelf: 'start' }} aria-pressed={raw} onClick={() => setRaw(!raw)}>{raw ? 'Show formatted' : 'Markdown source'}</button>
      </aside>
      {raw ? <CopyBox id={`${id}-md`} label="Markdown source: copy to save it" text={source} rows={40} /> : <div className="article" dangerouslySetInnerHTML={{ __html: html }} onClick={(e) => {
        const a = (e.target as HTMLElement).closest('a.cite') as HTMLAnchorElement | null;
        if (a) { e.preventDefault(); document.getElementById(`ref-${a.dataset.ref}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      }} />}
    </div>
  );
}

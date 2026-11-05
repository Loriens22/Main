import report from '../content/report.md?raw';
import { DocView } from '../components/DocView';
import { Badge, PageHead } from '../components/ui';

export default function Research() {
  return (
    <>
      <PageHead eyebrow="Technical report · v1.0 · 5 November 2026" title="Research report">
        <p>The full scientific write-up: fundamentals, the Majorana 2 and Nighthawk r2 analyses, the AURORA-Q architecture, simulation methods, results including negative ones, limitations and 61 references. Every claim is graded:</p>
        <div className="row small"><Badge g="lit" /><Badge g="sim" /><Badge g="model" /><Badge g="prop" /><Badge g="cont" /><Badge g="neg" /></div>
      </PageHead>
      <DocView source={report} id="research" />
    </>
  );
}

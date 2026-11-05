import { DocView } from '../components/DocView';
import { PageHead } from '../components/ui';
import paper from '../content/paper.md?raw';

export default function Paper() {
  return (
    <>
      <PageHead eyebrow={<><b>Research paper</b> · AURORA-Q2</>} title="Toroid and AURORA-CRYO: a qLDPC superconducting architecture with a cooling system designed around it" />
      <DocView source={paper} id="paper" />
    </>
  );
}

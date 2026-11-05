import docs from '../content/docs.md?raw';
import { DocView } from '../components/DocView';
import { PageHead } from '../components/ui';

export default function Docs() {
  return (
    <>
      <PageHead eyebrow="Documentation" title="Use, extend and reproduce AURORA-Q">
        <p>Installation, the simulator reference, the circuit schema shared by the browser and the Python API, the digital-twin model, and exact commands to regenerate every result and 3D asset.</p>
      </PageHead>
      <DocView source={docs} id="docs" />
    </>
  );
}

import { DocView } from '../components/DocView';
import { PageHead, Panel } from '../components/ui';
import methods from '../content/methods.md?raw';
import { useData } from '../lib/data';

const PROV: Record<string, string> = {
  p_reset: 'conventional: McEwen 2021 (< 5e-3); AURORA: Magnard 2018 (0.2 %)',
  n_floor: 'Wang 2019 measured bound',
  T1_dielectric: 'assumption (Bland 2025 best: 1.68 ms)',
  x_qp: 'assumption',
  T_eff_qubit: 'assumption',
  p2_control: 'assumption',
  p_sep: 'assumption',
};

export default function Methods() {
  const { data } = useData<any>('q2_cryo_models');
  const A = data?.params?.ARCH;
  const keys = A ? Object.keys(A.conventional).filter((k) => typeof A.conventional[k] === 'number') : [];
  return (
    <>
      <PageHead eyebrow={<><b>Methods</b> · reproduce every number</>} title="How the results were produced" />
      {A && (
        <div className="wrap" style={{ paddingBottom: '1.5rem' }}>
          <Panel eyebrow="Model parameters" title="Coherence-model inputs (both architectures)">
            <div className="table-wrap">
              <table>
                <thead><tr><th>Parameter</th><th className="num">Conventional</th><th className="num">AURORA-CRYO</th><th>Provenance</th></tr></thead>
                <tbody>{keys.map((k) => (
                  <tr key={k}><td className="mono">{k}</td><td className="num">{A.conventional[k].toPrecision(3)}</td><td className="num">{(A.aurora[k] ?? A.conventional[k]).toPrecision(3)}</td><td className="small muted">{PROV[k] ?? (k.startsWith('t_') ? 'design timing (assumption)' : k.endsWith('_f') ? 'design frequency' : 'assumption')}</td></tr>
                ))}</tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}
      <DocView source={methods} id="methods" />
    </>
  );
}

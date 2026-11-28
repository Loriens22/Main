import { useEffect, useState } from 'preact/hooks';
import type { Game } from '../../core/Game';
import { bus } from '../../core/events';
import { PanelFrame } from '../App';

const KV = ({ k, v, warn, good }: { k: string; v: any; warn?: boolean; good?: boolean }) =>
  <div class="kv"><span>{k}</span><b style={warn ? { color: 'var(--warn)' } : good ? { color: 'var(--good, #7fe08a)' } : {}}>{v}</b></div>;
const TABS: [string, string][] = [['halcyon', 'WSV-1 Halcyon'], ['traffic', 'Traffic · berth'], ['gangway', 'Gangway · route']];

/**
 * Meridian platform consoles: the warp ship's readiness as the yard sees it, traffic and the Ranger berth, and the
 * walking route from the berth to the ship's dorsal hatch.
 */
export function PlatformPanel({ game, close, tab: first }: { game: Game; close: () => void; tab?: string }) {
  const [tab, setTab] = useState(first ?? 'halcyon');
  const [, setN] = useState(0);
  useEffect(() => { const t = setInterval(() => setN((n) => n + 1), 500); return () => clearInterval(t); }, []);
  const o: any = game.zones.get('orbit');
  const pz: any = game.zones.get('platform');
  const ship = pz?.ship ?? o?.warpShip;
  const glow = ship?.glow?.emissiveIntensity ?? 0;
  const c = o?.ranger;
  const link = c ? o.docking.linkOf(c) : null;
  const berthed = !!link && link.port.host === o.platform;
  let body: any = null;
  if (tab === 'halcyon') {
    body = (
      <div class="grid2">
        <div>
          <h4>WSV-1 Halcyon · yard status</h4>
          <KV k="Position" v="Cradle A + B, Meridian platform" />
          <KV k="Field ring A (forward)" v={`STANDBY · coil channels ${(glow * 45).toFixed(0)} % luminance`} good />
          <KV k="Field ring B (aft)" v="STANDBY · charge holding" good />
          <KV k="Reactor" v="COLD STANDBY · start-up from the ship's bridge" />
          <KV k="Hull · cradle clamps" v="NOMINAL · A 41 MPa · B 39 MPa" good />
          <KV k="Gangway" v="PRESSURISED · sealed to the dorsal collar" good />
          <KV k="Landing pods 01–04" v="SECURED in the ventral bays" good />
          <KV k="Life support" v="ON · 101.3 kPa, 21 % O₂" good />
        </div>
        <div>
          <h4>About the drive</h4>
          <p>The Halcyon's two field rings are built to shape a warp field: space contracted ahead of the ship and expanded behind it, the ship itself at rest inside a bubble. This is <b>speculative physics</b> — an Alcubierre-style metric needs negative energy density and nobody has shown it can be built. The game treats it as a fictional engineering assumption; orbital flight around it stays real.</p>
          <p class="note">Departure, the warp flight and the pods are flown from the ship's bridge.</p>
        </div>
      </div>
    );
  } else if (tab === 'traffic') {
    body = (
      <div class="grid2">
        <div>
          <h4>Berth 1 · Ranger</h4>
          <KV k="Ranger 1" v={berthed ? 'HARD DOCK · restraints closed' : link ? 'Docked to the Endurance' : 'In free flight'} good={berthed} />
          <KV k="Landing deck" v="Clear · flood lights on" />
          <KV k="Refuelling boom" v={c ? `${(c.fuel / 1000).toFixed(2)} t aboard` : '—'} />
          <KV k="Endurance" v="1.60 km aft, same orbit · holding" />
        </div>
        <div>
          <h4>Leaving the platform</h4>
          <p>Back in Ranger 1's pilot seat, the flight computer (Y) offers the transfer to the Endurance — undocking, a short back-off and the automatic rendezvous and docking — or a manual departure. "AUTO LAND — ORBITAL PLATFORM" brings Ranger 1 back here from anywhere in Earth orbit.</p>
        </div>
      </div>
    );
  } else {
    body = (
      <div>
        <h4>From berth 1 to the Halcyon</h4>
        <ol class="steps">
          <li>Ranger 1 cabin → rear hatch → berth tunnel (weightless)</li>
          <li>Berth vestibule — windows over the landing deck</li>
          <li>Airlock 1 — the doors are interlocked; the chamber equalises toward the door you walk to</li>
          <li>Station corridor — deck plating, windows on the ship</li>
          <li>Operations — the access arm door</li>
          <li>Access arm and inspection gallery — glazed between the two field rings; pressure bulkhead half way</li>
          <li>Gangway head — the well in the floor</li>
          <li>Gangway shaft — weightless, ten metres down to the Halcyon's dorsal hatch</li>
        </ol>
        <div class="row" style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
          <button class="btn" onClick={() => { bus.emit('ui:click'); bus.emit('platform:shiphatch'); }}>Dorsal hatch status</button>
        </div>
      </div>
    );
  }
  return <PanelFrame title="Meridian platform" sub="NASA orbital platform · operations" close={close} tabs={TABS} tab={tab} setTab={setTab}>{body}</PanelFrame>;
}

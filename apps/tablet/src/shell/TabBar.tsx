import type { TabletPanel } from '@/state/store';
import { ChatIcon, DiffIcon, ShipIcon } from './icons';
import './TabBar.css';

export interface TabBarProps {
  panel: TabletPanel;
  onSelect: (panel: TabletPanel) => void;
  changeCount: number;
  disabled: boolean;
}

const TABS: { panel: TabletPanel; label: string; Icon: typeof ChatIcon }[] = [
  { panel: 'chat', label: 'Chat', Icon: ChatIcon },
  { panel: 'changes', label: 'Changes', Icon: DiffIcon },
  { panel: 'ship', label: 'Ship', Icon: ShipIcon },
];

/**
 * Bottom navigation, only ever mounted in `compact-portrait`.
 *
 * On the narrowest tablets held upright there is no room for a persistent rail
 * and a header full of chips at once, so the three destinations move down to
 * where the thumb already rests.
 */
export function TabBar({ panel, onSelect, changeCount, disabled }: TabBarProps) {
  return (
    <nav className="on-shell-tabs" aria-label="Views">
      {TABS.map(({ panel: value, label, Icon }) => (
        <button
          key={value}
          type="button"
          className="on-shell-tab"
          aria-current={panel === value}
          data-on={panel === value}
          disabled={disabled && value !== 'chat'}
          onClick={() => onSelect(value)}
        >
          <span className="on-shell-tab-icon">
            <Icon />
            {value === 'changes' && changeCount > 0 && (
              <span className="on-shell-tab-badge">{changeCount}</span>
            )}
          </span>
          {label}
        </button>
      ))}
    </nav>
  );
}

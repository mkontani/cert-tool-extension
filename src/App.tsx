import { useRef, useState, type KeyboardEvent } from 'react';
import { Shield, Key, FileSignature, Search, ShieldCheck, type LucideIcon } from 'lucide-react';
import KeyPairGenerator from './components/KeyPairGenerator';
import CSRGenerator from './components/CSRGenerator';
import PubKeyDeriver from './components/PubKeyDeriver';
import CertInspector from './components/CertInspector';
import CertLinter from './components/CertLinter';

interface Tool {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly Panel: () => React.JSX.Element;
}

const TOOLS: readonly Tool[] = [
  { id: 'keygen', label: 'Gen KeyPair', icon: Key, Panel: KeyPairGenerator },
  { id: 'csr', label: 'Gen CSR', icon: FileSignature, Panel: CSRGenerator },
  { id: 'pubkey', label: 'Derive PubKey', icon: Key, Panel: PubKeyDeriver },
  { id: 'inspector', label: 'Inspector', icon: Search, Panel: CertInspector },
  { id: 'lint', label: 'Lint', icon: ShieldCheck, Panel: CertLinter },
];

const INITIAL_TOOL = TOOLS.findIndex(tool => tool.id === 'inspector');

/** The tab the arrow keys, Home and End move to (WAI-ARIA tabs pattern), wrapping around at either end. */
function tabAfterKey(key: string, current: number): number | undefined {
  switch (key) {
    case 'ArrowRight': return (current + 1) % TOOLS.length;
    case 'ArrowLeft': return (current - 1 + TOOLS.length) % TOOLS.length;
    case 'Home': return 0;
    case 'End': return TOOLS.length - 1;
    default: return undefined;
  }
}

function App() {
  const [active, setActive] = useState(INITIAL_TOOL);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // With Alt, Ctrl or Cmd the keys belong to the browser, e.g. Alt+Left for back.
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const next = tabAfterKey(event.key, active);
    if (next === undefined) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <div style={{ padding: '1.5rem' }}>
      <header style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          width: '32px', height: '32px',
          background: 'linear-gradient(135deg, #8b5cf6, #ec4899)',
          borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Shield size={20} color="white" />
        </div>
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Cert Tool</h1>
      </header>

      <div className="tabs" role="tablist" aria-label="Tools" onKeyDown={onKeyDown}>
        {TOOLS.map(({ id, label, icon: Icon }, i) => (
          <button
            key={id}
            ref={el => { tabs.current[i] = el; }}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={i === active}
            aria-controls={`panel-${id}`}
            tabIndex={i === active ? 0 : -1}
            className={`tab ${i === active ? 'active' : ''}`}
            onClick={() => setActive(i)}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <Icon size={16} aria-hidden />
              <span>{label}</span>
            </span>
          </button>
        ))}
      </div>

      {/* Every tool stays mounted, so what was typed or generated in one survives a look at another. */}
      <main>
        {TOOLS.map(({ id, Panel }, i) => (
          <div key={id} role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={i !== active}>
            <Panel />
          </div>
        ))}
      </main>
    </div>
  );
}

export default App;

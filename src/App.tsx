import { useState, type ComponentType } from 'react';
import { Shield, Key, KeyRound, FileSignature, Search, ShieldCheck } from 'lucide-react';
import KeyPairGenerator from './components/KeyPairGenerator';
import CSRGenerator from './components/CSRGenerator';
import PublicKeyTools from './components/PublicKeyTools';
import CertInspector from './components/CertInspector';
import CertLinter from './components/CertLinter';
import TabList, { type TabSpec } from './components/TabList';
import { tabPanelProps } from './components/tabIds';

interface Tool extends TabSpec {
  readonly Panel: ComponentType;
}

/**
 * The Inspector, the main tool, comes first, then the tools by how close they are to it: Lint also checks certificates,
 * and Public Key reads the keys in them. The generators come last, in the order they are used: a key pair, then a CSR.
 */
const TOOLS: readonly Tool[] = [
  { id: 'inspector', label: 'Inspector', icon: Search, Panel: CertInspector },
  { id: 'lint', label: 'Lint', icon: ShieldCheck, Panel: CertLinter },
  { id: 'pubkey', label: 'Public Key', icon: KeyRound, Panel: PublicKeyTools },
  { id: 'keygen', label: 'Gen KeyPair', icon: Key, Panel: KeyPairGenerator },
  { id: 'csr', label: 'Gen CSR', icon: FileSignature, Panel: CSRGenerator },
];

const INITIAL_TOOL = TOOLS.findIndex(tool => tool.id === 'inspector');

function App() {
  const [active, setActive] = useState(INITIAL_TOOL);

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

      <TabList label="Tools" tabs={TOOLS} active={active} onSelect={setActive} variant="tabs" />

      <main>
        {TOOLS.map(({ id, Panel }, i) => (
          <div key={id} {...tabPanelProps(id, i === active)}>
            <Panel />
          </div>
        ))}
      </main>
    </div>
  );
}

export default App;

import { useState } from 'react';
import { Shield, Key, FileSignature, Search } from 'lucide-react';
import KeyPairGenerator from './components/KeyPairGenerator';
import CSRGenerator from './components/CSRGenerator';
import PubKeyDeriver from './components/PubKeyDeriver';
import CertInspector from './components/CertInspector';

type Tab = 'keygen' | 'csr' | 'pubkey' | 'inspector';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('keygen');

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

      <nav className="tabs">
        <button
          className={`tab ${activeTab === 'keygen' ? 'active' : ''}`}
          onClick={() => setActiveTab('keygen')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Key size={16} />
            <span>Key Pair</span>
          </div>
        </button>
        <button
          className={`tab ${activeTab === 'csr' ? 'active' : ''}`}
          onClick={() => setActiveTab('csr')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <FileSignature size={16} />
            <span>CSR</span>
          </div>
        </button>
        <button
          className={`tab ${activeTab === 'pubkey' ? 'active' : ''}`}
          onClick={() => setActiveTab('pubkey')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Key size={16} /> {/* Reusing Key icon for now */}
            <span>Pub Key</span>
          </div>
        </button>
        <button
          className={`tab ${activeTab === 'inspector' ? 'active' : ''}`}
          onClick={() => setActiveTab('inspector')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Search size={16} />
            <span>Inspector</span>
          </div>
        </button>
      </nav>

      <main>
        {activeTab === 'keygen' && <KeyPairGenerator />}
        {activeTab === 'csr' && <CSRGenerator />}
        {activeTab === 'pubkey' && <PubKeyDeriver />}
        {activeTab === 'inspector' && <CertInspector />}
      </main>
    </div>
  );
}

export default App;

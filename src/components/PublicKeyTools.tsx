import { useState, type ComponentType } from 'react';
import { ArrowDownCircle, GitCompareArrows } from 'lucide-react';
import KeyMatcher from './KeyMatcher';
import PubKeyDeriver from './PubKeyDeriver';
import TabList, { type TabSpec } from './TabList';
import { tabPanelProps } from './tabIds';

const TOOLS: readonly (TabSpec & { readonly Panel: ComponentType })[] = [
    { id: 'pubkey-derive', label: 'Derive', icon: ArrowDownCircle, Panel: PubKeyDeriver },
    { id: 'pubkey-match', label: 'Match', icon: GitCompareArrows, Panel: KeyMatcher },
];

/** The Public Key tab: taking a public key out of a PEM, and checking whether two PEMs are for the same key pair. */
export default function PublicKeyTools() {
    const [active, setActive] = useState(0);
    return (
        <>
            <TabList label="Public key tools" tabs={TOOLS} active={active} onSelect={setActive} variant="subtabs" />
            {TOOLS.map(({ id, Panel }, i) => (
                <div key={id} {...tabPanelProps(id, i === active)}>
                    <Panel />
                </div>
            ))}
        </>
    );
}

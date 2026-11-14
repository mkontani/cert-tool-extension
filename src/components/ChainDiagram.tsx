import { useId } from 'react';
import { ArrowDown } from 'lucide-react';
import type { IssuerLink } from '../inspector/chain';
import { describeValidity, shortValidity, type Validity } from '../page/validity';
import type { ChainRole } from '../site/display';

/** One block of the input, as the diagram shows it. */
export interface ChainEntry {
    readonly label: string;
    /** Set for a chain Chrome verified, where the position tells the role. */
    readonly role?: ChainRole;
    /** The key algorithm, e.g. "ECDSA (P-256)". */
    readonly detail?: string;
    readonly validity?: Validity;
    readonly unreadable?: boolean;
    readonly issuer: IssuerLink;
    /** The issuer's common name, for an issuer that is not the next certificate. */
    readonly issuerName?: string;
}

interface ChainDiagramProps {
    readonly entries: readonly ChainEntry[];
    readonly selected: number;
    readonly onSelect: (index: number) => void;
    /** id of the element that shows the selected certificate. */
    readonly controls: string;
    /** Set when the entries are the chain Chrome verified for a site, which ends at a certificate Chrome trusts. */
    readonly verified?: boolean;
}

/** Where the issuer of a certificate is, when it is not the next certificate. */
function issuerNote(entries: readonly ChainEntry[], index: number, verified: boolean): string | null {
    const entry = entries[index];
    switch (entry.issuer.kind) {
        case 'elsewhere': {
            const at = entry.issuer.index;
            return `Issued by #${at + 1} ${entries[at].label}, listed out of order`;
        }
        case 'missing': {
            const issuer = entry.issuerName ?? 'a certificate';
            // Chrome ends the chain it verified at a certificate it trusts, which is not always a root.
            if (verified && index === entries.length - 1) return `Issued by ${issuer}, not in the chain: Chrome trusts ${entry.label} directly`;
            // A block that could not be read may be the issuer.
            return entries.some(other => other.unreadable)
                ? `Issued by ${issuer}, not among the certificates that could be read`
                : `Issued by ${issuer}, not in the input`;
        }
        default:
            return null;
    }
}

function describeEntry(entry: ChainEntry): string {
    if (entry.unreadable) return 'Could not be read';
    return [entry.detail, entry.issuer.kind === 'self' && 'self-issued'].filter(Boolean).join(' · ');
}

interface ItemProps {
    readonly entry: ChainEntry;
    readonly index: number;
    readonly selected: boolean;
    readonly onSelect: (index: number) => void;
    readonly controls: string;
    /** Where the issuer is, when it is not the next certificate. */
    readonly note: string | null;
}

/** One certificate's node, then the link to its issuer or a note on where the issuer is, both read as part of the node. */
function ChainItem({ entry, index, selected, onSelect, controls, note }: ItemProps) {
    const id = useId();
    const description = describeEntry(entry);
    const describedBy = [description && `${id}-detail`, entry.validity && `${id}-validity`, note && `${id}-note`]
        .filter(Boolean)
        .join(' ');
    return (
        <li className="chain-item">
            <button
                type="button"
                className="chain-node"
                data-unreadable={entry.unreadable || undefined}
                aria-pressed={selected}
                aria-controls={controls}
                aria-label={`${index + 1}: ${entry.label}${entry.role ? ` (${entry.role.toLowerCase()})` : ''}`}
                aria-describedby={describedBy || undefined}
                title={entry.label} // full text when the label is cut off with an ellipsis
                onClick={() => onSelect(index)}
            >
                <span className="chain-num" aria-hidden>{index + 1}</span>
                <span className="chain-name">
                    {entry.role && <span className="chain-role" aria-hidden>{entry.role}</span>}
                    <span className="chain-label">{entry.label}</span>
                </span>
                {entry.validity && (
                    <span className="chain-validity" data-state={entry.validity.state} title={describeValidity(entry.validity)}>
                        {shortValidity(entry.validity)}
                        <span id={`${id}-validity`} hidden>{describeValidity(entry.validity)}</span>
                    </span>
                )}
                {description && <span id={`${id}-detail`} className="chain-detail">{description}</span>}
            </button>
            {entry.issuer.kind === 'next' && (
                <div className="chain-link"><ArrowDown size={12} aria-hidden /> issued by</div>
            )}
            {note && <div id={`${id}-note`} className="chain-note">{note}</div>}
        </li>
    );
}

/**
 * The certificates of the input from top to bottom in the order given, each linked to the next one when that one issued it.
 * An issuer that is out of order or missing is named under the certificate, so a misordered or incomplete chain shows at a glance.
 */
export default function ChainDiagram({ entries, selected, onSelect, controls, verified = false }: ChainDiagramProps) {
    return (
        <div role="group" aria-label="Certificates in the input">
            <ol className="chain">
                {entries.map((entry, i) => (
                    <ChainItem key={i} entry={entry} index={i} selected={i === selected} onSelect={onSelect} controls={controls}
                        note={issuerNote(entries, i, verified)} />
                ))}
            </ol>
        </div>
    );
}

import { useRef, useState, type ChangeEvent } from 'react';
import { CircleCheck, CircleX, GitCompareArrows, Loader2 } from 'lucide-react';
import CopyButton from './CopyButton';
import ErrorBanner from './ErrorBanner';
import { describeBasis, describeMatch, describePem, matchKeys, type KeyMatch, type MatchedPem } from '../keys/keyMatch';

const PEM_STYLE = { fontFamily: 'monospace', fontSize: '0.8rem' } as const;

const PIN_NOTE = 'A public key pin (pin-sha256, RFC 7469) is the base64 SHA-256 of the public key; the Inspector shows the same pin for a certificate or CSR.';

const headline = (match: KeyMatch): string => (match.same ? 'Match' : 'No match');

interface PemSideProps {
    readonly ordinal: 'first' | 'second';
    readonly pem: MatchedPem;
}

/** What one PEM held, and the pin of its key, which can be copied to check it elsewhere. */
function PemSide({ ordinal, pem }: PemSideProps) {
    const name = ordinal === 'first' ? 'First PEM' : 'Second PEM';
    return (
        <li>
            <span>{name}: {describePem(pem)}</span>
            <div className="hash-value match-pin">
                <span className="match-pin-label">Public Key Pin:</span>
                <code>{pem.pin}</code>
                <CopyButton text={pem.pin} label={`public key pin of the ${ordinal} PEM`} />
            </div>
        </li>
    );
}

/** The verdict with what it rests on: what was compared, and each PEM's key and its pin. */
function Verdict({ match }: { readonly match: KeyMatch }) {
    const Icon = match.same ? CircleCheck : CircleX;
    return (
        <section className="match-verdict" data-same={match.same} aria-label="Match result">
            <Icon size={20} aria-hidden className="match-verdict-icon" />
            <div className="match-verdict-body">
                <strong>{headline(match)}</strong>
                <p>{describeMatch(match)}</p>
                <p className="match-basis">{describeBasis(match)}</p>
                <ul>
                    <PemSide ordinal="first" pem={match.first} />
                    <PemSide ordinal="second" pem={match.second} />
                </ul>
                <p className="match-pin-note">{PIN_NOTE}</p>
            </div>
        </section>
    );
}

interface KeyMatcherProps {
    /** Compares the two PEMs; tests hand in their own. */
    readonly compare?: (first: string, second: string) => Promise<KeyMatch>;
}

/** Checks whether two PEMs, such as a private key and a certificate, are for the same key pair. */
export default function KeyMatcher({ compare = matchKeys }: KeyMatcherProps) {
    const [first, setFirst] = useState('');
    const [second, setSecond] = useState('');
    const [match, setMatch] = useState<KeyMatch | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [checking, setChecking] = useState(false);
    /** Goes up with every check and edit, so a check whose input has changed since is dropped. */
    const attempt = useRef(0);

    const forget = () => {
        attempt.current += 1;
        setMatch(null);
        setError(null);
        setChecking(false);
    };

    const edit = (set: (value: string) => void) => (event: ChangeEvent<HTMLTextAreaElement>) => {
        set(event.target.value);
        forget();
    };

    const check = async () => {
        forget();
        if (!first.trim() && !second.trim()) return;
        const current = attempt.current;
        setChecking(true);
        try {
            const result = await compare(first, second);
            if (attempt.current === current) setMatch(result);
        } catch (e: unknown) {
            if (attempt.current === current) setError(e instanceof Error ? e.message : 'The two PEMs could not be compared.');
        } finally {
            if (attempt.current === current) setChecking(false);
        }
    };

    return (
        <div className="glass-panel">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '0.75rem', gap: '0.5rem' }}>
                <GitCompareArrows size={24} color="#8b5cf6" aria-hidden />
                <h2 style={{ margin: 0 }}>Key Match</h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 1.5rem' }}>
                Check that a private key belongs to a certificate or CSR, or that two certificates share a key.
            </p>
            <div style={{ marginBottom: '1rem' }}>
                <label htmlFor="match-first">First PEM</label>
                <textarea
                    id="match-first"
                    value={first}
                    onChange={edit(setFirst)}
                    placeholder="A private key, certificate, CSR or public key, e.g. privkey.pem"
                    rows={5}
                    style={PEM_STYLE}
                />
            </div>
            <div style={{ marginBottom: '1.5rem' }}>
                <label htmlFor="match-second">Second PEM</label>
                <textarea
                    id="match-second"
                    value={second}
                    onChange={edit(setSecond)}
                    placeholder="Another one to compare with, e.g. cert.pem or fullchain.pem"
                    rows={5}
                    style={PEM_STYLE}
                />
            </div>
            <button className="btn" onClick={check} disabled={checking} style={{ width: '100%', marginBottom: '1.5rem' }}>
                {checking
                    ? <Loader2 size={18} aria-hidden style={{ marginRight: '0.5rem', animation: 'spin 1s linear infinite' }} />
                    : <GitCompareArrows size={18} aria-hidden style={{ marginRight: '0.5rem' }} />}
                Check Match
            </button>
            {error && <ErrorBanner>{error}</ErrorBanner>}
            {/* Only the verdict is announced: read out, the pins would be noise, and their copy buttons announce for themselves. */}
            <div role="status" className="visually-hidden" data-testid="match-announcement">
                {match && `${headline(match)}: ${describeMatch(match)}`}
            </div>
            {match && <Verdict match={match} />}
        </div>
    );
}

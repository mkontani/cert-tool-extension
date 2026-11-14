import { describe, it, expect } from 'vitest';
import { issuerLinks, type ChainNames } from '../../inspector/chain';

const ROOT: ChainNames = { subject: 'CN=Root', issuer: 'CN=Root' };
const INTERMEDIATE: ChainNames = { subject: 'CN=Intermediate', issuer: 'CN=Root' };
const LEAF: ChainNames = { subject: 'CN=leaf.example', issuer: 'CN=Intermediate' };
const CSR: ChainNames = { subject: 'CN=Intermediate' };

describe('issuerLinks', () => {
    it('links each certificate of a chain in order to the next one, and the root to itself', () => {
        expect(issuerLinks([LEAF, INTERMEDIATE, ROOT])).toEqual([{ kind: 'next' }, { kind: 'next' }, { kind: 'self' }]);
    });

    it('says the issuer is missing when the chain stops below the root', () => {
        expect(issuerLinks([LEAF, INTERMEDIATE])).toEqual([{ kind: 'next' }, { kind: 'missing' }]);
    });

    it('points at the issuer when it is listed out of order', () => {
        expect(issuerLinks([ROOT, INTERMEDIATE, LEAF])).toEqual([
            { kind: 'self' },
            { kind: 'elsewhere', index: 0 },
            { kind: 'elsewhere', index: 1 },
        ]);
        expect(issuerLinks([LEAF, ROOT, INTERMEDIATE])).toEqual([
            { kind: 'elsewhere', index: 2 },
            { kind: 'self' },
            { kind: 'elsewhere', index: 1 },
        ]);
    });

    it('matches names regardless of case and spacing, as RFC 5280 compares most of them', () => {
        const leaf: ChainNames = { subject: 'CN=leaf.example', issuer: 'CN=intermediate ' };
        const intermediate: ChainNames = { subject: 'CN=Intermediate', issuer: 'CN=ROOT' };
        expect(issuerLinks([leaf, intermediate, ROOT])).toEqual([{ kind: 'next' }, { kind: 'next' }, { kind: 'self' }]);
    });

    it('does not link a self-issued certificate to a copy of itself', () => {
        expect(issuerLinks([ROOT, ROOT])).toEqual([{ kind: 'self' }, { kind: 'self' }]);
    });

    it('leaves CSRs and unreadable blocks unlinked, and never takes a CSR for an issuer', () => {
        expect(issuerLinks([LEAF, CSR, null])).toEqual([{ kind: 'missing' }, { kind: 'unknown' }, { kind: 'unknown' }]);
    });

    it('skips unreadable blocks when looking for an issuer listed elsewhere', () => {
        expect(issuerLinks([LEAF, null, INTERMEDIATE])).toEqual([{ kind: 'elsewhere', index: 2 }, { kind: 'unknown' }, { kind: 'missing' }]);
    });
});

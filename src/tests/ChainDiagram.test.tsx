import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import ChainDiagram, { type ChainEntry } from '../components/ChainDiagram';

const LEAF: ChainEntry = {
    label: 'www.example.com', role: 'Leaf', detail: 'ECDSA (P-256)',
    validity: { state: 'expiring', days: 12 }, issuer: { kind: 'next' }, issuerName: 'WE2',
};
const INTERMEDIATE: ChainEntry = {
    label: 'WE2', role: 'Intermediate', detail: 'ECDSA (P-256)',
    validity: { state: 'valid', days: 800 }, issuer: { kind: 'missing' }, issuerName: 'GTS Root R4',
};

function renderDiagram(entries: readonly ChainEntry[], props: { verified?: boolean; selected?: number } = {}) {
    const onSelect = vi.fn();
    render(<ChainDiagram entries={entries} selected={props.selected ?? 0} onSelect={onSelect} controls="out" verified={props.verified} />);
    return { onSelect, group: screen.getByRole('group', { name: 'Certificates in the input' }) };
}

describe('ChainDiagram', () => {
    it('shows one selectable node per certificate, named with its position and role', () => {
        const { group, onSelect } = renderDiagram([LEAF, INTERMEDIATE], { selected: 1 });
        const nodes = within(group).getAllByRole('button');
        expect(nodes.map(n => n.getAttribute('aria-label'))).toEqual(['1: www.example.com (leaf)', '2: WE2 (intermediate)']);
        expect(nodes.map(n => n.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
        expect(nodes[0]).toHaveAttribute('aria-controls', 'out');
        fireEvent.click(nodes[0]);
        expect(onSelect).toHaveBeenCalledWith(0);
    });

    it('draws an "issued by" link to the next certificate when it issued the one above', () => {
        const { group } = renderDiagram([LEAF, INTERMEDIATE]);
        expect(within(group).getAllByText('issued by')).toHaveLength(1);
    });

    it('shows how long each certificate stays valid, and its key', () => {
        const { group } = renderDiagram([LEAF, INTERMEDIATE]);
        const [leaf, intermediate] = within(group).getAllByRole('button');
        expect(leaf).toHaveTextContent('12d left');
        expect(leaf).toHaveAccessibleDescription(/ECDSA \(P-256\)/);
        expect(leaf).toHaveAccessibleDescription(/Expires in 12 days/);
        expect(within(leaf).getByText('12d left')).toHaveAttribute('data-state', 'expiring');
        expect(intermediate).toHaveTextContent('800d left');
    });

    it('explains a root that Chrome left out of the chain it verified', () => {
        const { group } = renderDiagram([LEAF, INTERMEDIATE], { verified: true });
        expect(group).toHaveTextContent('Issued by GTS Root R4, not in the chain: Chrome trusts WE2 directly');
    });

    it('reads the note about the issuer with the certificate', () => {
        const { group } = renderDiagram([LEAF, INTERMEDIATE], { verified: true });
        expect(within(group).getAllByRole('button')[1]).toHaveAccessibleDescription(/Issued by GTS Root R4, not in the chain/);
    });

    it('only says Chrome trusts the last certificate of the chain it verified', () => {
        const { group } = renderDiagram([INTERMEDIATE, LEAF], { verified: true });
        expect(group).toHaveTextContent('Issued by GTS Root R4, not in the input');
        expect(group).not.toHaveTextContent('Chrome');
    });

    it('does not claim an issuer is missing when a block could not be read', () => {
        const leaf: ChainEntry = { ...LEAF, issuer: { kind: 'missing' } };
        const { group } = renderDiagram([leaf, { label: '(unreadable)', unreadable: true, issuer: { kind: 'unknown' } }]);
        expect(group).toHaveTextContent('Issued by WE2, not among the certificates that could be read');
        expect(group).not.toHaveTextContent('not in the input');
    });

    it('names an issuer that is not in the pasted input', () => {
        const { group } = renderDiagram([LEAF, INTERMEDIATE]);
        expect(group).toHaveTextContent('Issued by GTS Root R4, not in the input');
        expect(group).not.toHaveTextContent('Chrome');
    });

    it('points at an issuer listed out of order', () => {
        const root: ChainEntry = { label: 'Example Root CA', detail: 'RSA (2048 bits)', issuer: { kind: 'self' } };
        const leaf: ChainEntry = { label: 'app.example', issuer: { kind: 'elsewhere', index: 0 }, issuerName: 'Example Root CA' };
        const { group } = renderDiagram([root, leaf]);
        expect(group).toHaveTextContent('Issued by #1 Example Root CA, listed out of order');
        expect(within(group).queryByText('issued by')).toBeNull();
        expect(within(group).getAllByRole('button')[0]).toHaveAccessibleDescription(/self-issued/);
    });

    it('marks blocks that could not be read', () => {
        const { group } = renderDiagram([LEAF, { label: '(unreadable)', unreadable: true, issuer: { kind: 'unknown' } }]);
        const unreadable = within(group).getAllByRole('button')[1];
        expect(unreadable).toHaveAttribute('data-unreadable');
        expect(unreadable).toHaveAccessibleDescription('Could not be read');
    });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Lock } from 'lucide-react';
import ToolButton from '../components/ToolButton';

const HINT = 'Reads the chain Chrome verified for this site.';

function renderButton(props: Partial<Parameters<typeof ToolButton>[0]> = {}) {
    const onClick = vi.fn();
    render(<ToolButton icon={<Lock size={16} />} label="Show it" busyLabel="Reading…" busy={false} hint={HINT} error={null} onClick={onClick} {...props} />);
    return { onClick };
}

describe('ToolButton', () => {
    it('runs its action when clicked', () => {
        const { onClick } = renderButton();
        fireEvent.click(screen.getByRole('button', { name: 'Show it' }));
        expect(onClick).toHaveBeenCalledOnce();
    });

    it('explains itself in a tooltip that also describes the button to screen readers', () => {
        renderButton();
        expect(screen.getByRole('tooltip')).toHaveTextContent(HINT);
        expect(screen.getByRole('button')).toHaveAccessibleDescription(HINT);
    });

    it('is the only control, so the info icon cannot be clicked by mistake', () => {
        renderButton();
        expect(screen.getAllByRole('button')).toHaveLength(1);
    });

    it('shows the busy label and disables itself while busy', () => {
        renderButton({ busy: true });
        expect(screen.getByRole('button')).toBeDisabled();
        expect(screen.getByRole('button')).toHaveTextContent('Reading…');
    });

    it('shows an error below the button, outside the tooltip', () => {
        renderButton({ error: 'Something went wrong.' });
        expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong.');
        expect(screen.getByRole('tooltip')).not.toHaveTextContent('Something went wrong.');
    });

    it('shows no error when there is none', () => {
        renderButton();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('keeps the error out of the box the tooltip is placed against, so the tooltip stays right under the button', () => {
        renderButton({ error: 'Something went wrong.' });
        const anchor = screen.getByRole('tooltip').parentElement;
        expect(anchor).toContainElement(screen.getByRole('button'));
        expect(anchor).not.toContainElement(screen.getByRole('alert'));
    });
});

describe('ToolButton Escape key', () => {
    // jsdom does not apply the stylesheet, so a tooltip counts as showing unless a test hides it.
    const tip = () => screen.getByRole('tooltip');
    const isDismissed = () => tip().parentElement?.hasAttribute('data-dismissed');
    const pressEscape = () => fireEvent.keyDown(document, { key: 'Escape' });

    it('hides a showing tooltip, and keeps the popup open by handling the key', () => {
        renderButton();
        expect(pressEscape()).toBe(false); // false: the default action was prevented.
        expect(isDismissed()).toBe(true);
    });

    it('lets the tooltip show again once the pointer leaves or focus moves away', () => {
        renderButton();
        pressEscape();
        fireEvent.mouseLeave(tip().parentElement!);
        expect(isDismissed()).toBe(false);
        pressEscape();
        fireEvent.blur(screen.getByRole('button'));
        expect(isDismissed()).toBe(false);
    });

    it('leaves Escape alone when no tooltip is showing, so it still closes the popup', () => {
        renderButton();
        const hidden = tip(); // Looked up first: once hidden, it is no longer in the accessibility tree.
        hidden.style.visibility = 'hidden';
        expect(pressEscape()).toBe(true);
        expect(hidden.parentElement).not.toHaveAttribute('data-dismissed');
    });

    it('ignores other keys', () => {
        renderButton();
        expect(fireEvent.keyDown(document, { key: 'Enter' })).toBe(true);
        expect(isDismissed()).toBe(false);
    });
});

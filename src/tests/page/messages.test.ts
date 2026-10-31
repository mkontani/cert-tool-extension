import { describe, it, expect } from 'vitest';
import {
    isContentCommand, isContentReply, isInspectTextsRequest,
    MAX_TEXT_LENGTH, MAX_TEXTS, MSG_INSPECT_SELECTION, MSG_INSPECT_TEXTS, MSG_SCAN_PAGE,
} from '../../page/messages';

describe('isInspectTextsRequest', () => {
    it('accepts a list of strings', () => {
        expect(isInspectTextsRequest({ type: MSG_INSPECT_TEXTS, texts: ['a', 'b'] })).toBe(true);
        expect(isInspectTextsRequest({ type: MSG_INSPECT_TEXTS, texts: [] })).toBe(true);
    });

    it.each([
        ['null', null],
        ['a string', MSG_INSPECT_TEXTS],
        ['the wrong type', { type: MSG_SCAN_PAGE, texts: [] }],
        ['missing texts', { type: MSG_INSPECT_TEXTS }],
        ['non-string texts', { type: MSG_INSPECT_TEXTS, texts: [1] }],
        ['too many texts', { type: MSG_INSPECT_TEXTS, texts: Array(MAX_TEXTS + 1).fill('a') }],
        ['an oversized text', { type: MSG_INSPECT_TEXTS, texts: ['a'.repeat(MAX_TEXT_LENGTH + 1)] }],
    ])('rejects %s', (_name, msg) => {
        expect(isInspectTextsRequest(msg)).toBe(false);
    });
});

describe('isContentCommand', () => {
    it('accepts the scan and selection commands', () => {
        expect(isContentCommand({ type: MSG_SCAN_PAGE })).toBe(true);
        expect(isContentCommand({ type: MSG_INSPECT_SELECTION, fallbackText: '' })).toBe(true);
        expect(isContentCommand({ type: MSG_INSPECT_SELECTION, fallbackText: '', preferFallback: true })).toBe(true);
    });

    it.each([
        ['undefined', undefined],
        ['an unknown type', { type: 'other' }],
        ['a selection command without fallback text', { type: MSG_INSPECT_SELECTION }],
        ['a non-boolean preferFallback', { type: MSG_INSPECT_SELECTION, fallbackText: '', preferFallback: 'yes' }],
        ['an oversized fallback text', { type: MSG_INSPECT_SELECTION, fallbackText: 'a'.repeat(MAX_TEXT_LENGTH + 1) }],
    ])('rejects %s', (_name, msg) => {
        expect(isContentCommand(msg)).toBe(false);
    });
});

describe('isContentReply', () => {
    it('accepts a count or an error', () => {
        expect(isContentReply({ found: 0 })).toBe(true);
        expect(isContentReply({ error: 'boom' })).toBe(true);
    });

    it('rejects anything else', () => {
        expect(isContentReply(undefined)).toBe(false);
        expect(isContentReply({ found: '1' })).toBe(false);
        expect(isContentReply({})).toBe(false);
    });
});

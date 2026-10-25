import { describe, it, expect } from 'vitest';
import { AsnConvert } from '@peculiar/asn1-schema';
import { AttributeTypeAndValue, AttributeValue, Name, RelativeDistinguishedName } from '@peculiar/asn1-x509';
import { commonNameOf, describeName, displayText } from '../../inspector/format';

const nameWith = (type: string, utf8String: string) =>
    new Uint8Array(AsnConvert.serialize(new Name([
        new RelativeDistinguishedName([new AttributeTypeAndValue({ type, value: new AttributeValue({ utf8String }) })]),
    ])));

describe('displayText', () => {
    it('keeps ordinary text, including non-Latin scripts', () => {
        expect(displayText('株式会社テスト')).toBe('株式会社テスト');
    });

    it.each([
        { name: 'a C0 control', text: 'a\u0001b', hex: '61:01:62' },
        { name: 'a C1 control', text: 'a\u0085b', hex: '61:85:62' },
        { name: 'a right-to-left override', text: 'a‮b', hex: '61:E2:80:AE:62' },
        { name: 'a bidi isolate', text: 'a⁧b', hex: '61:E2:81:A7:62' },
        { name: 'a zero-width space', text: 'a​b', hex: '61:E2:80:8B:62' },
    ])('shows text containing $name as hex', ({ text, hex }) => {
        expect(displayText(text)).toBe(`(Hex) ${hex}`);
    });
});

describe('describeName', () => {
    it.each([
        { oid: '2.5.4.13', label: 'description' },
        { oid: '2.5.4.65', label: 'pseudonym' },
        { oid: '1.2.840.113549.1.9.2', label: 'unstructuredName' },
        { oid: '2.5.4.46', label: 'dnQualifier' },
    ])('names the $label attribute', ({ oid, label }) => {
        expect(describeName(nameWith(oid, 'x'))).toBe(`${label}=x`);
    });
});

describe('commonNameOf', () => {
    it('returns the most specific common name', () => {
        const name = new Uint8Array(AsnConvert.serialize(new Name([
            new RelativeDistinguishedName([new AttributeTypeAndValue({ type: '2.5.4.3', value: new AttributeValue({ utf8String: 'outer' }) })]),
            new RelativeDistinguishedName([new AttributeTypeAndValue({ type: '2.5.4.3', value: new AttributeValue({ utf8String: 'inner' }) })]),
        ])));
        expect(commonNameOf(name)).toBe('inner');
    });

    it('treats an empty common name as missing', () => {
        expect(commonNameOf(nameWith('2.5.4.3', ''))).toBeUndefined();
    });
});

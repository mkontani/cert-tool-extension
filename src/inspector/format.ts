import { AsnConvert } from '@peculiar/asn1-schema';
import { Name, type GeneralName, type OtherName, type RelativeDistinguishedName } from '@peculiar/asn1-x509';
import * as asn1js from 'asn1js';
import type { DisplayEntry } from './types';

type Binary = ArrayBuffer | ArrayBufferView;

/** Own-property lookup, so OIDs from certificate data can never reach Object.prototype. */
export const nameFor = <T>(table: Readonly<Record<string, T>>, key: string): T | undefined =>
    Object.hasOwn(table, key) ? table[key] : undefined;

const toBytes = (data: Binary): Uint8Array =>
    data instanceof ArrayBuffer ? new Uint8Array(data) : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);

/** "AA:BB:CC", the notation the Inspector uses for binary values. */
export const colonHex = (data: Binary): string =>
    Array.from(toBytes(data), b => b.toString(16).padStart(2, '0').toUpperCase()).join(':');

export const hexValue = (data: Binary): string => `(Hex) ${colonHex(data)}`;

export const bytesToNumber = (data: Binary): number => toBytes(data).reduce((n, b) => n * 256 + b, 0);

const CONTROL_CHARACTERS = /[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]/;

/** Text taken from the certificate, or its bytes as hex when it contains characters that cannot be shown. */
export function displayText(text: string): string {
    if (!CONTROL_CHARACTERS.test(text)) return text;
    const bytes = /[^\x00-\xff]/.test(text) ? new TextEncoder().encode(text) : Uint8Array.from(text, c => c.charCodeAt(0));
    return hexValue(bytes);
}

/** Decodes a DER-encoded ASN.1 string (IA5String, UTF8String, ...), or undefined for any other type. */
export function asn1String(der: Binary): string | undefined {
    const parsed = asn1js.fromBER(toBytes(der));
    return parsed.offset !== -1 && parsed.result instanceof asn1js.BaseStringBlock ? parsed.result.getValue() : undefined;
}

/** Attribute names as node-forge spells them, so the Inspector's existing output does not change. */
const ATTRIBUTE_NAMES: Readonly<Record<string, string>> = {
    '2.5.4.3': 'commonName',
    '2.5.4.4': 'surname',
    '2.5.4.5': 'serialNumber',
    '2.5.4.6': 'countryName',
    '2.5.4.7': 'localityName',
    '2.5.4.8': 'stateOrProvinceName',
    '2.5.4.9': 'streetAddress',
    '2.5.4.10': 'organizationName',
    '2.5.4.11': 'organizationalUnitName',
    '2.5.4.12': 'title',
    '2.5.4.15': 'businessCategory',
    '2.5.4.17': 'postalCode',
    '2.5.4.42': 'givenName',
    '2.5.4.97': 'organizationIdentifier',
    '1.2.840.113549.1.9.1': 'emailAddress',
    '0.9.2342.19200300.100.1.1': 'userId',
    '0.9.2342.19200300.100.1.25': 'domainComponent',
    '1.3.6.1.4.1.311.60.2.1.1': 'jurisdictionOfIncorporationLocalityName',
    '1.3.6.1.4.1.311.60.2.1.2': 'jurisdictionOfIncorporationStateOrProvinceName',
    '1.3.6.1.4.1.311.60.2.1.3': 'jurisdictionOfIncorporationCountryName',
};

export const formatRdn = (rdn: RelativeDistinguishedName): string =>
    rdn.map(atv => `${nameFor(ATTRIBUTE_NAMES, atv.type) ?? atv.type}=${displayText(atv.value.toString())}`).join(' + ');

export const formatName = (name: Name): string => name.map(formatRdn).join(', ');

/** Renders a DER-encoded Name (subject or issuer). */
export const describeName = (der: Uint8Array): string => formatName(AsnConvert.parse(der, Name));

const OTHER_NAME_LABELS: Readonly<Record<string, string>> = {
    '1.3.6.1.4.1.311.20.2.3': 'UPN',
};

function describeOtherName(other: OtherName): string {
    const label = nameFor(OTHER_NAME_LABELS, other.typeId) ?? other.typeId;
    const text = asn1String(other.value);
    return `${label}: ${text === undefined ? hexValue(other.value) : displayText(text)}`;
}

/** The IP converter returns bare hex for lengths that are neither an address nor an address/mask pair. */
const describeIp = (text: string): string =>
    /^[0-9a-f]*$/.test(text) ? hexValue(Uint8Array.from(text.match(/../g) ?? [], h => parseInt(h, 16))) : text;

export function describeGeneralName(name: GeneralName): DisplayEntry {
    if (name.dNSName !== undefined) return { type: 'DNS', value: displayText(name.dNSName) };
    if (name.iPAddress !== undefined) return { type: 'IP', value: describeIp(name.iPAddress) };
    if (name.rfc822Name !== undefined) return { type: 'Email', value: displayText(name.rfc822Name) };
    if (name.uniformResourceIdentifier !== undefined) return { type: 'URI', value: displayText(name.uniformResourceIdentifier) };
    if (name.registeredID !== undefined) return { type: 'RID', value: name.registeredID };
    if (name.directoryName) return { type: 'DirName', value: formatName(name.directoryName) };
    if (name.otherName) return { type: 'otherName', value: describeOtherName(name.otherName) };
    if (name.x400Address) return { type: 'X400', value: hexValue(name.x400Address) };
    if (name.ediPartyName) return { type: 'EDIParty', value: displayText(name.ediPartyName.partyName.toString()) };
    return { type: 'Unknown', value: '' };
}

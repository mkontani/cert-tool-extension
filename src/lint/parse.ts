import * as asn1js from 'asn1js';
import { AsnConvert } from '@peculiar/asn1-schema';
import { Certificate, Name } from '@peculiar/asn1-x509';
import { sameBytes, toHex } from './bytes';
import { decodeExtensions } from './extensions';
import { findPemBlocks } from '../inspector/pem';
import type { AlgorithmInfo, CertContext, PublicKeyInfo } from './types';

export class CertParseError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CertParseError';
    }
}

const OID_COMMON_NAME = '2.5.4.3';
const OID_RSA_ENCRYPTION = '1.2.840.113549.1.1.1';
const OID_EC_PUBLIC_KEY = '1.2.840.10045.2.1';

const NO_CERTIFICATE = 'No "-----BEGIN CERTIFICATE-----" block found.';
const ONLY_CSRS = 'This is a certificate signing request (CSR). Lint checks issued certificates; open the CSR in the Inspector instead.';

interface FirstCertificate {
    readonly der: Uint8Array;
    /** Certificates in the text, counting any that cannot be read. */
    readonly count: number;
}

/** The DER of the first certificate in the text, read the way the Inspector reads it, and how many certificates there are. */
function firstCertificate(text: string): FirstCertificate {
    const { blocks } = findPemBlocks(text);
    const certificates = blocks.filter(block => block.kind === 'certificate');
    const [first] = certificates;
    // Every block findPemBlocks returns is a certificate or a CSR, so with no certificate, any block left is a CSR.
    if (!first) throw new CertParseError(blocks.length > 0 ? ONLY_CSRS : NO_CERTIFICATE);
    if ('error' in first) throw new CertParseError(first.error);
    return { der: first.der, count: certificates.length };
}

const rawBytes = (block: asn1js.AsnType) => new Uint8Array((block as asn1js.BaseBlock).valueBeforeDecodeView);
const children = (block: asn1js.AsnType) => (block as asn1js.Constructed).valueBlock.value;

interface RawFields {
    readonly serialNumber: Uint8Array;
    readonly tbsSignature: Uint8Array;
    readonly signatureAlgorithm: Uint8Array;
    readonly issuer: Uint8Array;
    readonly subject: Uint8Array;
    readonly spkiAlgorithm: Uint8Array;
    readonly subjectPublicKey: Uint8Array;
}

/** Extracts the exact encodings the BR compares byte-for-byte. Throws on unexpected structure. */
function readRawFields(der: Uint8Array): RawFields {
    const parsed = asn1js.fromBER(der);
    if (parsed.offset === -1) throw new Error(parsed.result.error || 'invalid DER');
    if (parsed.offset !== der.byteLength) throw new CertParseError('Unexpected data after the end of the certificate.');

    const [tbs, signatureAlgorithm] = children(parsed.result);
    const fields = children(tbs);
    const first = fields[0].idBlock;
    const tbsFields = first.tagClass === 3 && first.tagNumber === 0 ? fields.slice(1) : fields;
    const [serial, tbsSignature, issuer, , subject, spki] = tbsFields;
    const [spkiAlgorithm, subjectPublicKey] = children(spki);
    return {
        serialNumber: new Uint8Array((serial as asn1js.Integer).valueBlock.valueHexView),
        tbsSignature: rawBytes(tbsSignature),
        signatureAlgorithm: rawBytes(signatureAlgorithm),
        issuer: rawBytes(issuer),
        subject: rawBytes(subject),
        spkiAlgorithm: rawBytes(spkiAlgorithm),
        subjectPublicKey: new Uint8Array((subjectPublicKey as asn1js.BitString).valueBlock.valueHexView),
    };
}

/** Bit length of the modulus of an RSAPublicKey ::= SEQUENCE { modulus INTEGER, publicExponent INTEGER }. */
export function rsaModulusBits(subjectPublicKey: Uint8Array): number | undefined {
    const parsed = asn1js.fromBER(subjectPublicKey);
    if (parsed.offset === -1 || !(parsed.result instanceof asn1js.Sequence)) return undefined;
    const [modulus, exponent] = parsed.result.valueBlock.value;
    if (!(modulus instanceof asn1js.Integer) || !(exponent instanceof asn1js.Integer)) return undefined;
    const bytes = modulus.valueBlock.valueHexView;
    const start = bytes.findIndex(b => b !== 0);
    if (start < 0) return 0;
    return (bytes.length - start - 1) * 8 + Math.floor(Math.log2(bytes[start])) + 1;
}

function namedCurveOid(parameters: ArrayBuffer | null | undefined): string | undefined {
    if (!parameters) return undefined;
    const parsed = asn1js.fromBER(parameters);
    return parsed.offset !== -1 && parsed.result instanceof asn1js.ObjectIdentifier
        ? parsed.result.valueBlock.toString()
        : undefined;
}

function commonNames(name: Name): string[] {
    return name.flatMap(rdn => rdn.filter(atv => atv.type === OID_COMMON_NAME).map(atv => atv.value.toString()));
}

const algorithmInfo = (oid: string, encoded: Uint8Array): AlgorithmInfo => ({ oid, derHex: toHex(encoded) });

function publicKeyInfo(cert: Certificate, raw: RawFields): PublicKeyInfo {
    const { algorithm: oid, parameters } = cert.tbsCertificate.subjectPublicKeyInfo.algorithm;
    const algorithm = algorithmInfo(oid, raw.spkiAlgorithm);
    if (oid === OID_RSA_ENCRYPTION) {
        const bits = rsaModulusBits(raw.subjectPublicKey);
        if (bits === undefined) throw new CertParseError('The RSA public key is malformed.');
        return { algorithm, rsaModulusBits: bits };
    }
    if (oid === OID_EC_PUBLIC_KEY) return { algorithm, ecCurveOid: namedCurveOid(parameters) };
    return { algorithm };
}

function toContext(der: Uint8Array): CertContext {
    const cert = AsnConvert.parse(der, Certificate);
    const raw = readRawFields(der);
    const tbs = cert.tbsCertificate;
    return {
        version: tbs.version + 1,
        serialNumber: raw.serialNumber,
        notBefore: tbs.validity.notBefore.getTime(),
        notAfter: tbs.validity.notAfter.getTime(),
        subjectCommonNames: commonNames(tbs.subject),
        subjectIsEmpty: tbs.subject.length === 0,
        isSelfIssued: sameBytes(raw.issuer, raw.subject),
        signatureAlgorithm: algorithmInfo(cert.signatureAlgorithm.algorithm, raw.signatureAlgorithm),
        signatureAlgorithmsMatch: sameBytes(raw.tbsSignature, raw.signatureAlgorithm),
        publicKey: publicKeyInfo(cert, raw),
        extensions: decodeExtensions(tbs.extensions ?? []),
    };
}

export interface ParsedInput {
    /** The first certificate in the text, which is the one linted. */
    readonly cert: CertContext;
    /** Certificates in the text, e.g. 3 for a leaf pasted with two intermediates. */
    readonly certificateCount: number;
}

/**
 * Parses the first PEM certificate in `text` into the normalized view the checks use, and counts the certificates after it.
 * @throws CertParseError for any input whose first certificate is not well formed.
 */
export function parseFirstCertificate(text: string): ParsedInput {
    const { der, count } = firstCertificate(text);
    try {
        return { cert: toContext(der), certificateCount: count };
    } catch (e: unknown) {
        if (e instanceof CertParseError) throw e;
        const reason = e instanceof Error ? e.message : String(e);
        throw new CertParseError(`The PEM block does not contain a valid X.509 certificate (${reason}).`);
    }
}

/**
 * Parses the first PEM certificate in `text` into the normalized view the checks use.
 * @throws CertParseError for any input that is not a well-formed certificate.
 */
export const parseCertificate = (text: string): CertContext => parseFirstCertificate(text).cert;

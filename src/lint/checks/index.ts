import type { CheckDefinition } from '../types';
import { brMaxValidity, alreadyValid, notExpired, notExpiringSoon, privateMaxValidity } from './validity';
import { dnsNameSyntax, hostnameMatch } from './hostname';
import { cnInSan, sanCriticality, sanPresent, sanPublicNames } from './names';
import { brEkuForbidden, brKeyUsage, clientAuthEku, ekuServerAuth, notCa } from './usage';
import { brPublicKeyAlgorithm, brSignatureAlgorithm, keyStrength, weakSignature } from './crypto';
import {
    authorityKeyId,
    brPolicyOid,
    caIssuers,
    extensionsUnique,
    revocationInfo,
    sctEmbedded,
    selfSigned,
    serialNumberEntropy,
    serialNumberRange,
    x509V3,
} from './structure';

/** All checks, in display order: usability now, client acceptance, private-CA rules, then BR rules. */
export const ALL_CHECKS: readonly CheckDefinition[] = [
    notExpired,
    alreadyValid,
    notExpiringSoon,
    hostnameMatch,
    selfSigned,
    sanPresent,
    ekuServerAuth,
    notCa,
    keyStrength,
    weakSignature,
    x509V3,
    dnsNameSyntax,
    serialNumberRange,
    extensionsUnique,
    privateMaxValidity,
    brMaxValidity,
    brPublicKeyAlgorithm,
    brSignatureAlgorithm,
    serialNumberEntropy,
    sanPublicNames,
    sanCriticality,
    cnInSan,
    brPolicyOid,
    authorityKeyId,
    revocationInfo,
    caIssuers,
    brKeyUsage,
    brEkuForbidden,
    clientAuthEku,
    sctEmbedded,
];

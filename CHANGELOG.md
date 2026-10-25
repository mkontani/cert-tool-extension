# Changelog

All notable changes to Cert Tool are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-10-25

### Added
- **Certificate Linter** tab: checks whether a server certificate is safe to deploy, similar to zlint but running entirely in the browser.
  - 30 checks covering expiry, hostname coverage, SAN/EKU/Basic Constraints, DNS name syntax, key type and size, weak signatures, duplicate extensions, and the CA/Browser Forum TLS Baseline Requirements v2.3.1 (validity limits through 2029, permitted algorithms, policy OIDs, revocation info, Certificate Transparency).
  - *Public CA* and *Private CA* profiles, auto-detected from the certificate policies and selectable by hand.
  - Optional check that a hostname, IP address, or URL is covered by the certificate.
  - Every finding cites the BR section, RFC, or root-program policy it comes from.
- Inspector: paste a full chain (e.g. `fullchain.pem`) and switch between the leaf and intermediates with numbered buttons. CSRs can be pasted alongside certificates.
- Inspector: decodes CRL Distribution Points, Authority Information Access, Certificate Policies (with CA/B validation levels, CPS and notices), embedded SCTs, Name Constraints, Policy Constraints, and the TLS Feature (OCSP Must-Staple) extension.
- Inspector: list-valued extensions such as SANs and CRL URIs are shown one entry per row with a type badge and a count.
- Inspector: names Ed448, RSA-PSS, ML-DSA, secp256k1, Brainpool, and SM2 keys and SHA-3 signatures instead of showing "Unknown".

### Fixed
- Inspector: Authority Key Identifier showed its raw ASN.1 encoding instead of the key ID.
- Inspector: CRL Distribution Points were garbled (e.g. `0-0+ ) '%http://...`).
- Inspector: non-ASCII subject and issuer names (e.g. Japanese organization names) were garbled.
- Inspector: pasting more than one certificate failed with "Invalid character".
- Inspector: Extended Key Usage OIDs without a known name were dropped.
- Inspector: IPv6 addresses in SANs are now formatted per RFC 5952.
- Inspector: a field that cannot be decoded is shown as hex instead of hiding the whole certificate, and names containing bidi or zero-width characters are shown as hex so they cannot be disguised.
- Inspector: very large pastes no longer freeze the popup.

### Changed
- Tighter tab spacing so all five tabs fit in the popup.

### Security
- Updated node-forge to 1.4.0, fixing signature forgery (RSA PKCS#1 v1.5, Ed25519), basicConstraints bypass, and denial-of-service issues. One advisory, GHSA-86w9-cpqp-85rv, has no fixed release yet; Cert Tool never verifies signatures with node-forge, so it is not affected.
- Updated build and test tooling (Vite 7.3.7, Vitest 4.1.12, and transitive dependencies) to clear the remaining `npm audit` advisories.

## [1.0.1] - 2026-01-05

### Added
- CSR generation with ECDSA (P-256, P-384, P-521) and Ed25519 keys, using the Web Crypto API.

## [1.0.0] - 2026-01-03

### Added
- Initial release: key pair generation (RSA, ECDSA, Ed25519), CSR generation, public key derivation, and a certificate/CSR inspector.

[1.1.0]: https://github.com/mkontani/cert-tool-extension/compare/1.0.1...1.1.0
[1.0.1]: https://github.com/mkontani/cert-tool-extension/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/mkontani/cert-tool-extension/releases/tag/1.0.0

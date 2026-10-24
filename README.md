# Cert Tool Chrome Extension

![Cert Tool Icon](public/icons/icon128.png)

A powerful and elegant Chrome extension for handling X.509 certificates and cryptographic keys. Designed with a premium dark-mode interface and glassmorphism aesthetics.

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Available-blue?logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/cert-tool/ojgmjpfknnlfcfjcljkdcfpbpgciefkk)

## Features

### 1. Key Pair Generation
Generate cryptographic key pairs instantly using the Web Crypto API.
![Key Pair Generation](screenshots/gen_keypair_screenshot_web.jpg)
- **Algorithms**: RSA (2048, 4096 bits), ECDSA (P-256, P-384, P-521), and Ed25519.
- **Standard Formats**: Private keys are exported in **PKCS#8** and public keys in **SPKI**.
- **Save As**: Easily download keys with a standard OS save dialog.

### 2. CSR Generation
Create Certificate Signing Requests (CSR) with a user-friendly form.
![CSR Generation](screenshots/gen_csr_screenshot_web.jpg)
- **Customizable DN**: Set Common Name, Organization, Country, and more.
- **SAN Support**: Add multiple Subject Alternative Names (DNS, IP, Email, URI).
- **Flexible Signing**: Sign the request using your own private key.

### 3. Public Key Derivation
Extract the public key component from various sources.
![Public Key Derivation](screenshots/derive_pubkey_screenshot_web.jpg)
- **Input Types**: Supports Private Keys (PKCS#8/PKCS#1), Certificates, or CSRs.
- **Auto-Detection**: Automatically identifies the input type and algorithm.

### 4. Certificate/CSR Inspector
View detailed information about certificates and signing requests.
![Inspector](screenshots/inspector_screenshot_web.jpg)
- **Comprehensive View**: Shows Serial Number, Subject, Issuer, Validity, and Public Key details.
- **Extension Decoding**: Human-readable decoding for SANs, Basic Constraints, Key Usage, and Extended Key Usage (EKU).

### 5. Certificate Linter
Check whether a server certificate is safe to deploy, similar to [zlint](https://github.com/zmap/zlint) but running entirely in the browser.
- **30 checks**: Expiry, hostname coverage, SAN/EKU/Basic Constraints, DNS name syntax, key type and size, weak signatures, duplicate extensions, and the CA/Browser Forum TLS Baseline Requirements (validity limits, permitted algorithms, policy OIDs, revocation info, CT, and more).
- **Two profiles**: *Public CA* applies the Baseline Requirements and browser root-program rules; *Private CA* applies only what browsers and operating systems enforce (e.g. Apple's 825-day limit). The profile is auto-detected from the certificate policies and can be overridden.
- **Hostname check**: Optionally verify that a hostname, IP address, or URL is covered by the SAN (wildcards and IDNs supported).
- **Cited sources**: Every finding links back to the BR section, RFC, or root-program policy it comes from.
- **Out of scope**: Chain building, revocation status lookups, SCT signature verification, CSRs, and CA certificates.

## Installation

1. Clone this repository.
2. Run `npm install` to install dependencies.
3. Run `npm run build` to generate the production build in the `dist` folder.
4. Open Chrome and navigate to `chrome://extensions`.
5. Enable "Developer mode" (top right).
6. Click "Load unpacked" and select the `dist` directory.

## Technology Stack
- **Framework**: Vite + React + TypeScript
- **Crypto Library**: [node-forge](https://github.com/digitalbazaar/forge) & Web Crypto API
- **ASN.1 Parsing (Linter)**: [@peculiar/asn1-x509](https://github.com/PeculiarVentures/asn1-schema) & [asn1js](https://github.com/PeculiarVentures/asn1.js)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Styling**: Vanilla CSS with Glassmorphism effects

## Maintaining the Linter
- `node scripts/update-tlds.mjs` refreshes the IANA TLD list used to detect internal names.
- `scripts/gen-lint-fixtures.sh` regenerates the test certificates (requires OpenSSL 3.4+).
- Rules follow CA/Browser Forum TLS BR v2.3.1, Chrome Root Program Policy v1.8, and Mozilla Root Store Policy v3.1. Date-based rules (e.g. the validity limits that tighten in 2027 and 2029) are already encoded.

---
Developed with focus on security, usability, and modern aesthetics.

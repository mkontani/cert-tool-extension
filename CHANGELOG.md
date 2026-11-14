# Changelog

All notable changes to Cert Tool are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Inspector: SHA-256 and SHA-1 fingerprints of each certificate, written as `openssl x509 -fingerprint` and Chrome's certificate viewer write them, and the public key pin (`pin-sha256`, RFC 7469) of each certificate and CSR. Each one has its own Copy button. The pin stays the same when a certificate is renewed with the same key, so it shows whether a renewal changed the key.

### Changed
- Cert Tool now requires Chrome 137 or later (`minimum_chrome_version`). Ed25519 keys rely on Web Crypto support that shipped in Chrome 137; on older versions, generating or using one failed with "Algorithm: Unrecognized name".
- The tool tabs follow the WAI-ARIA tabs pattern: screen readers announce them as tabs, and the arrow keys, Home and End move between them. Tab moves from the selected tab into its panel.
- Inspector: a pasted chain, or the chain of the current site, is now drawn as a diagram instead of a row of buttons.
  - Each certificate is a node with its name, key, and days left, colored like the badges on pages. It is joined to the next one by an "issued by" link when that certificate issued it. Click a node to see its details, as before.
  - An issuer listed out of order, or missing from the input, is named under the certificate. This shows at a glance when a `fullchain.pem` is in the wrong order or lacks an intermediate.
  - When Chrome's chain for a site stops below the root, the diagram names the root and says Chrome trusts the last certificate directly. Chrome's root store includes some intermediates, such as Google Trust Services' WE2, so youtube.com's chain ends there.
- Gen CSR: SANs can be separated by spaces or new lines as well as commas.
- Gen CSR: subject fields are trimmed and written as UTF8String, as RFC 5280 asks.
  - The country is written as PrintableString and must be a two-letter code. The email address is written as IA5String and must be a valid address.
  - Before, every field was written as PrintableString, which cannot hold `@`, `&` or non-ASCII letters. CSRs with an email address or a Japanese organization name were malformed.
  - Fields longer than RFC 5280 allows are refused with a message: 64 characters for Common Name, Organization and OU, and 128 for State and Locality. So are fields with control characters or broken characters.
- Gen CSR no longer creates a throwaway RSA key before signing with an EC or Ed25519 key, which could freeze the popup for a moment.

### Fixed
- Gen KeyPair, Gen CSR and Derive PubKey: every field and output now has its label attached, so screen readers announce what it is and clicking a label focuses its field. These were the key size and curve, the CSR form's fields and private key, and the generated keys, CSR and public key.
- Lint warned that a certificate with exactly 30 days left was expiring soon, while the badges on pages and the Inspector showed it as valid ("30d left"). All three now share one rule: fewer than 30 days left.
- Switching tabs no longer clears a tool. Before, a generated key pair, a filled-in CSR form or a pasted certificate was lost as soon as another tab was opened. Everything is still kept only while the popup is open, and nothing is saved.
- Copy buttons: when Chrome refused to write to the clipboard, for example because the popup was not focused, nothing happened. The button now shows "Copy failed", and screen readers are told to copy the text by hand. A successful copy is announced too.
- Errors in Gen KeyPair, Gen CSR and Derive PubKey are now announced to screen readers, as they already were in the Inspector and Lint.
- Show this site's certificate: when Chrome took too long to answer, the read gave up after 10 seconds but kept running in the background. If the button was clicked again meanwhile, the old read could send its remaining commands into the new one. It now stops at its next command.
- Gen CSR: CSRs signed with an RSA key used SHA-1 (`sha1WithRSAEncryption`), which public CAs reject. They now use SHA-256 (`sha256WithRSAEncryption`). ECDSA keys sign with SHA-256, SHA-384 or SHA-512 to match the curve, as before.
- Gen CSR: SANs were left out of CSRs signed with an Ed25519 key.
- Gen CSR and Derive PubKey: PKCS#1 keys (`BEGIN RSA PRIVATE KEY`) and SEC1 keys (`BEGIN EC PRIVATE KEY`) failed with "Cannot read properties of undefined".
  - Both formats are now read, including the `EC PARAMETERS` block that `openssl ecparam -genkey` writes before the key.
  - A key pasted after a certificate is found.
  - An encrypted key gets a message saying how to remove its passphrase.
  - An unsupported key, such as X25519 or an OpenSSH key, gets a message naming what is supported.
  - An EC key whose curve is spelled out as explicit parameters gets a message with the openssl command that names it.
- Gen CSR: SANs were sorted into types incorrectly.
  - With an RSA key, IPv6 addresses were requested as DNS names.
  - Values such as `1.2.3` failed with a node-forge error.
  - Now each SAN is checked. IPv4 and IPv6 addresses become IP SANs, `user@host` an email, and `scheme://…` a URI.
  - Anything else must be a valid DNS name: labels of up to 63 characters that do not start or end with a hyphen, no trailing dot, and `*` only as the whole leftmost label.
  - Non-ASCII names must be written in punycode.
  - The error names the entry that is wrong.

## [1.3.0] - 2026-11-12

### Added
- Inspector: **Show this site's certificate** loads the certificate chain Chrome verified for the site in the current tab, from the leaf to the root.
  - Each certificate is labeled Leaf, Intermediate, or Root. A summary shows the TLS version, key exchange group, and cipher, and whether Chrome accepted the certificate. It also notes when Chrome's chain stops below the root.
  - The chain is put in the input as PEM, so it can be copied or linted.
  - Uses the new `debugger` permission, which shows the install warning "Access the page debugger backend". Chrome asks existing users to approve it when they update. The debugger is attached only while the certificate is read, and Chrome shows a "started debugging this browser" bar meanwhile.
  - To read the certificate, the tab sends a HEAD request without cookies to the site's home page, or to the page on the same site the home page redirects to. Redirects to other sites are not followed, and the address of the page you are on is not sent. The page's content is not read or changed.
  - Chrome does not let an extension debug a tab while another extension's frame is in it, such as the bar Vimium shows once it has been used on a page. Cert Tool then reads the certificate over its own connection: it attaches the debugger to its own popup and sends the HEAD request to the site from there, without cookies or a referrer, and blocks redirects to other sites. The summary notes when the connection was Cert Tool's own.
  - A few sites refuse requests that do not come from their own pages, for example with `Cross-Origin-Resource-Policy: same-origin`. If such a site also has another extension's frame on it, the button explains this and suggests reloading the page.

### Changed
- The popup now opens on the Inspector tab instead of Gen KeyPair. The order of the tabs is unchanged.
- Inspector: the explanations under **Scan this page** and **Show this site's certificate** moved into tooltips, so the buttons take one row. Hover a button or its ⓘ icon, or focus it with the keyboard, to read one. Screen readers read it as the button's description.

### Security
- Updated node-forge to 1.4.3. It fixes Ed25519 signature verification accepting small-order public keys (GHSA-6889-vf6x-f3g5), two TLS client crashes (GHSA-w4xr-hqv8-ch44, GHSA-j8rw-jp99-435v), and a ReDoS in `forge.http` (GHSA-6cv4-p8m7-4r25). Cert Tool uses none of these parts of node-forge, so it was not affected.

## [1.2.0] - 2026-11-01

### Added
- Inspect certificates and CSRs on web pages:
  - **Scan this page** (Inspector tab) badges every certificate and CSR on the current page with its name and days left, colored by validity. Hover or click a badge for subject, issuer, validity, key, signature, and extensions. A pasted chain gets one badge listing every entry.
  - Right-click a selected PEM block and pick **Inspect certificate with Cert Tool**.
  - Works with code viewers that put each line in its own element and with text in form fields. Private keys, cut-off blocks, and blocks the page hides are skipped.
  - Every details card notes that it shows what the certificate claims; signatures and trust are not checked.
  - If a selection cannot be inspected (e.g. on a browser page), the toolbar icon shows "!" with the reason.
  - Pages are read only when you click the button or the menu item (new `activeTab`, `scripting`, and `contextMenus` permissions, none of which show an install warning), and the page text never leaves the browser.

### Fixed
- The CSR and public key tabs no longer print debug messages to the browser console.
- The popup no longer scrolls sideways when long results add a vertical scrollbar (on systems with always-visible scrollbars, such as Windows).

### Security
- Updated node-forge to 1.4.2. It fixes a denial of service in which a small crafted certificate with deeply nested BIT STRINGs made the Inspector use gigabytes of memory, plus RSA signature forgery and other issues in parts of node-forge Cert Tool does not use. This includes GHSA-86w9-cpqp-85rv, which had no fix at the 1.1.0 release.

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

[Unreleased]: https://github.com/mkontani/cert-tool-extension/compare/1.3.0...HEAD
[1.3.0]: https://github.com/mkontani/cert-tool-extension/compare/1.2.0...1.3.0
[1.2.0]: https://github.com/mkontani/cert-tool-extension/compare/1.1.0...1.2.0
[1.1.0]: https://github.com/mkontani/cert-tool-extension/compare/1.0.1...1.1.0
[1.0.1]: https://github.com/mkontani/cert-tool-extension/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/mkontani/cert-tool-extension/releases/tag/1.0.0

// Inspector test inputs, generated once with OpenSSL 4.0 (keys discarded):
//   openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout /dev/null -subj "/CN=mixed.example" -days 365 \
//     -addext "subjectAltName=DNS:mixed.example,email:admin@example.com,URI:https://example.com/id,RID:1.2.3.4,otherName:1.3.6.1.4.1.311.20.2.3;UTF8:user@example.com"
//   openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout /dev/null -subj "/CN=csr.example" \
//     -addext "subjectAltName=DNS:csr.example,DNS:www.csr.example,IP:192.0.2.10"
//   openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout /dev/null -subj "/CN=empty.example" -days 365 \
//     -addext "2.5.29.17=DER:3000"

/** subjectAltName with DNS, email, URI, registeredID and otherName (UPN) entries. */
export const MIXED_SAN_CERT = `-----BEGIN CERTIFICATE-----
MIIB0jCCAXigAwIBAgIUSzHAVmcwE+W4/+UidGn5uc+ML2MwCgYIKoZIzj0EAwIw
GDEWMBQGA1UEAwwNbWl4ZWQuZXhhbXBsZTAeFw0yNjEwMjUwNDE3MzFaFw0yNzEw
MjUwNDE3MzFaMBgxFjAUBgNVBAMMDW1peGVkLmV4YW1wbGUwWTATBgcqhkjOPQIB
BggqhkjOPQMBBwNCAARtuPP2lh0Rg0/9CZ+tsZ54D5SCwG9ruzTE/PFf8Lyi8X28
viz6GvpbJ5GqvZDaYARZcI/B3vSakwT9NsE1SbuBo4GfMIGcMB0GA1UdDgQWBBQn
DSSJp23gaf1vylN5Kbk18hk3hDAPBgNVHRMBAf8EBTADAQH/MGoGA1UdEQRjMGGC
DW1peGVkLmV4YW1wbGWBEWFkbWluQGV4YW1wbGUuY29thhZodHRwczovL2V4YW1w
bGUuY29tL2lkiAMqAwSgIAYKKwYBBAGCNxQCA6ASDBB1c2VyQGV4YW1wbGUuY29t
MAoGCCqGSM49BAMCA0gAMEUCIHKdeY1zGQrfyHeUBdEl1o7q22solxAsF7G8oW7q
SoFSAiEA58eDFEPYSYFhpi3OZNBxL4dSAL2r174dgjRlb0FdFnU=
-----END CERTIFICATE-----`;

/** CSR requesting two DNS names and an IP address. */
export const SAN_CSR = `-----BEGIN CERTIFICATE REQUEST-----
MIIBETCBuAIBADAWMRQwEgYDVQQDDAtjc3IuZXhhbXBsZTBZMBMGByqGSM49AgEG
CCqGSM49AwEHA0IABB7Px867hmaaBU8dLaOU0zoPdS48+b8P2+fYbbMJ/H930ACr
dWsu8fSRnH1GQy8DoBy+WBTb+Si/PgMW0mdmulKgQDA+BgkqhkiG9w0BCQ4xMTAv
MC0GA1UdEQQmMCSCC2Nzci5leGFtcGxlgg93d3cuY3NyLmV4YW1wbGWHBMAAAgow
CgYIKoZIzj0EAwIDSAAwRQIgTKp9Awkg6Yw9wr7iZXv/HGlMJ6CGd9tq+vadPBWl
/s4CIQCmHljbODVcUuPxNaZQPi/OqByd2AnvWB3NDP5EbgJUdQ==
-----END CERTIFICATE REQUEST-----`;

/** subjectAltName extension with no names (invalid per RFC 5280 §4.2.1.6, but parseable). */
export const EMPTY_SAN_CERT = `-----BEGIN CERTIFICATE-----
MIIBbzCCARWgAwIBAgIUIcoLWIGuqu5TN75k+5101vVW6k4wCgYIKoZIzj0EAwIw
GDEWMBQGA1UEAwwNZW1wdHkuZXhhbXBsZTAeFw0yNjEwMjUwNDE3MzFaFw0yNzEw
MjUwNDE3MzFaMBgxFjAUBgNVBAMMDWVtcHR5LmV4YW1wbGUwWTATBgcqhkjOPQIB
BggqhkjOPQMBBwNCAATAcuQ9ZLvWjEWdKbgSZdFaOzFR9q+nCAyGW8Frj8OxlgrS
UvluE974KXSg5AGkxNRMGQdKtdPvOHx18H62XF5moz0wOzAdBgNVHQ4EFgQUMxDC
UThNMGhRZeuHE2n/YELpW3IwDwYDVR0TAQH/BAUwAwEB/zAJBgNVHREEAjAAMAoG
CCqGSM49BAMCA0gAMEUCICqZiyEcCrm8invwA2yQoeDRoQSsUO31P36xlGVXjzNX
AiEA5n/CYh0of9GH9prkACnZfDidSBPP2V/JaJ8eOSTm0uY=
-----END CERTIFICATE-----`;

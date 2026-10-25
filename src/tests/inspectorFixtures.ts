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

/**
 * Self-signed secp256k1 certificate exercising most extensions, with a UTF-8 subject.
 *   openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:secp256k1 -nodes -keyout /dev/null -config ks.cnf -days 30
 * ks.cnf:
 *   [req]
 *   distinguished_name = dn
 *   string_mask = utf8only
 *   utf8 = yes
 *   prompt = no
 *   x509_extensions = v3
 *   [dn]
 *   C = JP
 *   O = 株式会社テスト
 *   CN = ks.example.jp
 *   [v3]
 *   subjectAltName = DNS:ks.example.jp,IP:2001:db8:0:1:0:0:0:1,IP:2001:db8:0:0:1:0:0:1
 *   extendedKeyUsage = serverAuth,1.3.6.1.4.1.311.10.3.4
 *   tlsfeature = status_request
 *   certificatePolicies = 2.23.140.1.2.2,@pol
 *   authorityKeyIdentifier = keyid,issuer:always
 *   subjectKeyIdentifier = hash
 *   nameConstraints = permitted;DNS:.example.jp,excluded;IP:10.0.0.0/255.0.0.0
 *   crlDistributionPoints = URI:http://crl.example.jp/a.crl,URI:ldap://ldap.example.jp/cn=CA
 *   authorityInfoAccess = OCSP;URI:http://ocsp.example.jp,caIssuers;URI:http://ca.example.jp/ca.crt
 *   policyConstraints = requireExplicitPolicy:0
 *   1.2.3.4.5 = ASN1:UTF8String:hello
 *   [pol]
 *   policyIdentifier = 1.3.6.1.4.1.99999.1
 *   CPS.1 = https://example.jp/cps
 *   userNotice.1 = @notice
 *   [notice]
 *   explicitText = "Test notice"
 */
export const KITCHEN_SINK_CERT = `-----BEGIN CERTIFICATE-----
MIID/zCCA6SgAwIBAgIUBC2lzQ2jrph0q+RqpOJXlwyqR6kwCgYIKoZIzj0EAwIw
RTELMAkGA1UEBhMCSlAxHjAcBgNVBAoMFeagquW8j+S8muekvuODhuOCueODiDEW
MBQGA1UEAwwNa3MuZXhhbXBsZS5qcDAeFw0yNjEwMjUwNDMxMjVaFw0yNjExMjQw
NDMxMjVaMEUxCzAJBgNVBAYTAkpQMR4wHAYDVQQKDBXmoKrlvI/kvJrnpL7jg4bj
grnjg4gxFjAUBgNVBAMMDWtzLmV4YW1wbGUuanAwVjAQBgcqhkjOPQIBBgUrgQQA
CgNCAARIpxiPTUiKt4X65JFB73AN+mr2bb1LIaclkkjloOQn5xgZ1566lNb15h5j
tadSR25fNIpc5apUMRAK40lEzac+o4ICczCCAm8wPAYDVR0RBDUwM4INa3MuZXhh
bXBsZS5qcIcQIAENuAAAAAEAAAAAAAAAAYcQIAENuAAAAAAAAQAAAAAAATAfBgNV
HSUEGDAWBggrBgEFBQcDAQYKKwYBBAGCNwoDBDARBggrBgEFBQcBGAQFMAMCAQUw
YQYDVR0gBFowWDAIBgZngQwBAgIwTAYJKwYBBAGGjR8BMD8wIgYIKwYBBQUHAgEW
Fmh0dHBzOi8vZXhhbXBsZS5qcC9jcHMwGQYIKwYBBQUHAgIwDRoLVGVzdCBub3Rp
Y2UwHQYDVR0OBBYEFHrtHdqqS37VtoQ9ADnZcjjjgyFYMIGABgNVHSMEeTB3gBR6
7R3aqkt+1baEPQA52XI444MhWKFJpEcwRTELMAkGA1UEBhMCSlAxHjAcBgNVBAoM
FeagquW8j+S8muekvuODhuOCueODiDEWMBQGA1UEAwwNa3MuZXhhbXBsZS5qcIIU
BC2lzQ2jrph0q+RqpOJXlwyqR6kwKAYDVR0eBCEwH6APMA2CCy5leGFtcGxlLmpw
oQwwCocICgAAAP8AAAAwUAYDVR0fBEkwRzAhoB+gHYYbaHR0cDovL2NybC5leGFt
cGxlLmpwL2EuY3JsMCKgIKAehhxsZGFwOi8vbGRhcC5leGFtcGxlLmpwL2NuPUNB
MFsGCCsGAQUFBwEBBE8wTTAiBggrBgEFBQcwAYYWaHR0cDovL29jc3AuZXhhbXBs
ZS5qcDAnBggrBgEFBQcwAoYbaHR0cDovL2NhLmV4YW1wbGUuanAvY2EuY3J0MAwG
A1UdJAQFMAOAAQAwDwYEKgMEBQQHDAVoZWxsbzAKBggqhkjOPQQDAgNJADBGAiEA
/7pGkSQZ2g1v4eCjY4uHZmh7Wp5mNbHRRlijtHay6xcCIQD06VUMEsArM1RFg1FY
cJlLmZ4gcdUHHvG1PPXSQtHwWw==
-----END CERTIFICATE-----`;

/** Self-signed Ed448 certificate: openssl req -x509 -newkey ed448 -nodes -keyout /dev/null -subj "/CN=ed448.example" -days 30 */
export const ED448_CERT = `-----BEGIN CERTIFICATE-----
MIIBbjCB76ADAgECAhRaXuG5ABxSsJwz+v/VeT3i6cyHHTAFBgMrZXEwGDEWMBQG
A1UEAwwNZWQ0NDguZXhhbXBsZTAeFw0yNjEwMjUwNDI2NDhaFw0yNjExMjQwNDI2
NDhaMBgxFjAUBgNVBAMMDWVkNDQ4LmV4YW1wbGUwQzAFBgMrZXEDOgCysNlQUBjs
z/VqrmHkMr7PQBuXNA+/AzA5qJh/UxD4qhKltta2rfczGad2YWIY9/0gOzLpyzOI
2gCjMjAwMB0GA1UdDgQWBBSpFaR7jku+HovMkkKsbX+0wxGGBTAPBgNVHRMBAf8E
BTADAQH/MAUGAytlcQNzAIoMv9WQrWG2O1ZN5Tx8LLid2E91PitkzsTcCUXUtLXd
vC9q4Bzj1FKnqkIhCZFUpiso/vjReleFADPxaDYCD0KSjvXLxzw9IsMbZ3Zfadz0
jyEC4/XJCtS7ajeaT5oKnbborShDA6SREPw970XEpoUEAA==
-----END CERTIFICATE-----`;

/** Self-signed RSASSA-PSS key: openssl req -x509 -newkey rsa-pss -pkeyopt rsa_keygen_bits:2048 -nodes -keyout /dev/null -subj "/CN=pss.example" -days 30 */
export const RSA_PSS_CERT = `-----BEGIN CERTIFICATE-----
MIIDUjCCAgagAwIBAgIUdRleAyvANG3+4g9Kz7KWlPybCbIwQQYJKoZIhvcNAQEK
MDSgDzANBglghkgBZQMEAgEFAKEcMBoGCSqGSIb3DQEBCDANBglghkgBZQMEAgEF
AKIDAgEgMBYxFDASBgNVBAMMC3Bzcy5leGFtcGxlMB4XDTI2MTAyNTA0MjY0OFoX
DTI2MTEyNDA0MjY0OFowFjEUMBIGA1UEAwwLcHNzLmV4YW1wbGUwggEgMAsGCSqG
SIb3DQEBCgOCAQ8AMIIBCgKCAQEAsCQnhnY+KvcW+dWQzTbbMY/GIt6GxJA3gEFd
xkBSdGtVboWc/Vh4aOxUf+86/3PzkYcM8hIMBZWInn9gY0mOKL5ZfueyAKY1Ikqb
P2fKIJZmVROixPltlf0GqN+ZdHzdNf645ELTIpoah01MenavRpxPSPgQQoNAVA6U
iu+THBNOje/QNjI0ZrKWV5dd6oXLnK5agplJj/YyNFCs2cJGPBWwIXCk7VkzfTqA
MBG9/kaTxGz1p2+dIX8XNrLZS8+n7eDnsuEevVvaZZlAMHuTYcDCIWa90+TZar3Y
YcVYa6RCPZOsjQ1eCPqNWa8BwsNq1O0JzO/k3xehzl3jRnBLBQIDAQABozIwMDAd
BgNVHQ4EFgQUXshuviK0jiNWqr2s8zeuK10ZpzUwDwYDVR0TAQH/BAUwAwEB/zBB
BgkqhkiG9w0BAQowNKAPMA0GCWCGSAFlAwQCAQUAoRwwGgYJKoZIhvcNAQEIMA0G
CWCGSAFlAwQCAQUAogMCASADggEBAFCd1W00/GJyyGFfPKi01Lt0v7aUr6HFJUA2
bNrh9Qd4ZQAVRN35aE+AlySMYry6uVMETl5y+63r67kXxBghOmKvj3plPWxDjZ7W
fuWzR/QDzqb9vVaf+qtDAxz3AgaYQaa8oywQ1t6/buBaZSJmNq266Aq+7RiUzUE4
O+5ggN+EUVJc6wpEYkArujEhyzCke46m+RuPHFZamGZtVkhjslWomCBowPvXuwd+
A+JSjakwD8FQbVj4nA0KC8IZk1iL1hm80pGGQ/BOhQo6GgmcisWwk2yBMfidicgV
44mBNUquhCObGMYw0fhCDNbG2YHYWBgX5CkIO1tlE5fGaUZSCx0=
-----END CERTIFICATE-----`;

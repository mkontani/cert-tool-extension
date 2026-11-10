// A fictional chain, as base64 DER the way Chrome's Network.getCertificate reports it (leaf first), generated with OpenSSL 4.0 (keys discarded):
//   openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes -keyout root.key -subj "/O=Example Trust/CN=Example Root CA" -days 3650 \
//     -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign"
//   openssl x509 -req -CA root.pem -CAkey root.key -days 1825 ...   (subject "/O=Example Trust/CN=Example Issuing CA", CA:TRUE,pathlen:0)
//   openssl x509 -req -CA int.pem -CAkey int.key -days 90 ...       (subject "/CN=www.example.com", SAN www.example.com and example.com)

export const LEAF_B64 = 'MIIBsDCCAVWgAwIBAgIURwo4s/7OjUXw/Pew66Bt8YsXNZ8wCgYIKoZIzj0EAwIwNTEWMBQGA1UECgwNRXhhbXBsZSBUcnVzdDEbMBkGA1UEAwwSRXhhbXBsZSBJc3N1aW5nIENBMB4XDTI2MTExMDE5MjAyMFoXDTI3MDIwODE5MjAyMFowGjEYMBYGA1UEAwwPd3d3LmV4YW1wbGUuY29tMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEJPdXd+k+98/E3FCs+KkvnDRLeXlZW7RoD1UdfbEeAP0B/TmHCPYOATe5BeAfdeswGAu5JeviA24X+5a/VIel1KNeMFwwDAYDVR0TAQH/BAIwADAOBgNVHQ8BAf8EBAMCB4AwEwYDVR0lBAwwCgYIKwYBBQUHAwEwJwYDVR0RBCAwHoIPd3d3LmV4YW1wbGUuY29tggtleGFtcGxlLmNvbTAKBggqhkjOPQQDAgNJADBGAiEAiIbsigsJv0fIHllRGDiREocIQxOoR8lwKg07SBsas8gCIQDHV6amTHlkecwbxtSvIiaBA5Y8+Et4xI4jeQIlvfbpDw==';

export const INTERMEDIATE_B64 = 'MIIBjzCCATWgAwIBAgIUWusqHJRQ+uhhx9Bcz7nm9MPg7rEwCgYIKoZIzj0EAwIwMjEWMBQGA1UECgwNRXhhbXBsZSBUcnVzdDEYMBYGA1UEAwwPRXhhbXBsZSBSb290IENBMB4XDTI2MTExMDE5MjAyMFoXDTMxMTEwOTE5MjAyMFowNTEWMBQGA1UECgwNRXhhbXBsZSBUcnVzdDEbMBkGA1UEAwwSRXhhbXBsZSBJc3N1aW5nIENBMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEOI8WoIv4g7c/pcBzen9qKIlIQpLCp9beAksIdE9E3sOQx7Ua3lKvN2VlzmcBHuHWg+B5YJU5WkUqDfCQM2nbUKMmMCQwEgYDVR0TAQH/BAgwBgEB/wIBADAOBgNVHQ8BAf8EBAMCAQYwCgYIKoZIzj0EAwIDSAAwRQIhAKHYq+8wrt52smpypOrA8l4tj2BVzV2Tbj5z7iV1u/gZAiBLkKainbbWxiGkJ5REUkoKbh0fuu4wRJVpmxyAkJ1Z0g==';

export const ROOT_B64 = 'MIIBqDCCAU6gAwIBAgIUTkkexhJdkGXmg122TXk3Yq00n4owCgYIKoZIzj0EAwIwMjEWMBQGA1UECgwNRXhhbXBsZSBUcnVzdDEYMBYGA1UEAwwPRXhhbXBsZSBSb290IENBMB4XDTI2MTExMDE5MjAyMFoXDTM2MTEwNzE5MjAyMFowMjEWMBQGA1UECgwNRXhhbXBsZSBUcnVzdDEYMBYGA1UEAwwPRXhhbXBsZSBSb290IENBMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAELhs+YV2XUzxszNJjvuJMpJn3WrroOnC2dgn9V6KLtup++hMxfe1lc2gDibMP8ouSSsiuVV1ldSuq3eAfI9o0iqNCMEAwHQYDVR0OBBYEFLNlvzdxqz24gLG2z2K3q/KPWhT9MA8GA1UdEwEB/wQFMAMBAf8wDgYDVR0PAQH/BAQDAgEGMAoGCCqGSM49BAMCA0gAMEUCIQCEFSbk/CSNW05UAOeS2t99GkmGgE8PwU62+p5Fic7EdQIgZEbJKbUz3/172W+KUYL+A9f6GCNxy8qhd/LvpMgpAAU=';

export const SITE_CHAIN = [LEAF_B64, INTERMEDIATE_B64, ROOT_B64] as const;

export const SITE_ORIGIN = 'https://www.example.com';

/** What Page.getFrameTree returns for a page on SITE_ORIGIN, trimmed to the fields Cert Tool reads. */
export function frameTree(overrides: Record<string, unknown> = {}) {
    return { frameTree: { frame: { id: 'F1', loaderId: 'L1', url: `${SITE_ORIGIN}/path`, securityOrigin: SITE_ORIGIN, mimeType: 'text/html', ...overrides } } };
}

/** The parameters of a Network.responseReceived event for a TLS 1.3 response from SITE_ORIGIN, trimmed to the fields Cert Tool reads. */
export function responseReceived(overrides: Record<string, unknown> = {}, details: Record<string, unknown> = {}) {
    return {
        requestId: '1.1',
        type: 'Fetch',
        response: {
            url: `${SITE_ORIGIN}/`,
            status: 200,
            securityState: 'secure',
            securityDetails: {
                protocol: 'TLS 1.3',
                keyExchange: '',
                keyExchangeGroup: 'X25519MLKEM768',
                cipher: 'AES_128_GCM',
                certificateId: 0,
                subjectName: 'www.example.com',
                sanList: ['www.example.com', 'example.com'],
                issuer: 'Example Issuing CA',
                validFrom: 1794338420,
                validTo: 1802114420,
                signedCertificateTimestampList: [],
                certificateTransparencyCompliance: 'unknown',
                encryptedClientHello: false,
                ...details,
            },
            ...overrides,
        },
    };
}

/** The parameters of a Network.requestWillBeSent event, trimmed to the fields Cert Tool reads. */
export function requestWillBeSent(method = 'HEAD', requestId = '1.1', url = `${SITE_ORIGIN}/`) {
    return { requestId, type: 'Fetch', request: { url, method, headers: {} } };
}

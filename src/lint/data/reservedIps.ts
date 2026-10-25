// "Reserved IP Address" per the BR: any block in the IANA IPv4/IPv6 Special-Purpose Address Registries.
// Covering blocks taken from the registries as of 2026-10-24 (nested entries such as 192.0.0.8/32 are
// subsumed by their parent block).
// https://www.iana.org/assignments/iana-ipv4-special-registry/
// https://www.iana.org/assignments/iana-ipv6-special-registry/
export const RESERVED_IP_BLOCKS: readonly string[] = [
    '0.0.0.0/8',
    '10.0.0.0/8',
    '100.64.0.0/10',
    '127.0.0.0/8',
    '169.254.0.0/16',
    '172.16.0.0/12',
    '192.0.0.0/24',
    '192.0.2.0/24',
    '192.31.196.0/24',
    '192.52.193.0/24',
    '192.88.99.0/24',
    '192.168.0.0/16',
    '192.175.48.0/24',
    '198.18.0.0/15',
    '198.51.100.0/24',
    '203.0.113.0/24',
    '240.0.0.0/4',
    '::/128',
    '::1/128',
    '::ffff:0:0/96',
    '64:ff9b::/96',
    '64:ff9b:1::/48',
    '100::/64',
    '100:0:0:1::/64',
    '2001::/23',
    '2001:db8::/32',
    '2002::/16',
    '2620:4f:8000::/48',
    '3fff::/20',
    '5f00::/16',
    'fc00::/7',
    'fe80::/10',
];

// Private keys for tests only, generated with OpenSSL 4.1 and used nowhere else:
//   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out rsa.pkcs8.pem
//   openssl rsa -in rsa.pkcs8.pem -traditional -out rsa.pkcs1.pem
//   openssl ecparam -name prime256v1 -genkey -out ec.sec1.pem
//   openssl pkcs8 -topk8 -nocrypt -in ec.sec1.pem -out ec.pkcs8.pem
//   openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-384 -out p384.pem
//   openssl genpkey -algorithm ed25519 -out ed25519.pem
//   openssl genpkey -algorithm X25519 -out x25519.pem
//   openssl pkcs8 -topk8 -v2 aes-256-cbc -passout pass:test -in ec.pkcs8.pem -out encrypted.pem
//   openssl genpkey -algorithm EC -pkeyopt ec_paramgen_curve:P-521 -out p521.pem
//   openssl ec -in ec.sec1.pem -param_enc explicit -out ec.explicit.pem
//   openssl ec -in ec.sec1.pem -no_public -out ec.nopub.pem

/** RSA 2048, PKCS#8. */
export const RSA_PKCS8 = `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDOVxkhquSXRX8X
9RZ4O+kSNfYwlJGeXmiLFbqYG3Lh5hRT0PD8quu+YwzQNqD0Cs2C9xV/wKlMqarz
+BqCJAD1mOXg8N+/tfcOq2pxA1AH1uanS18f0poaN2HnwADSWYG+6dJn5NWykBuf
A/RiXQcrY1H37Kc4k5NMbFdVcF4fu7QARzco6bP53LjSs5fThHVgCE5x9EAzZkQG
DDs1Ewqj/JcGy6oQq1XKzjWTsTiHIro34q0HVWZq/P/x28tYKyE5BDiyPTOMF5jE
t4PBRc1BgI5HRDtbpjODy0jyk3ZJfcnJLvCfhegyZ+ylD72gxw5GZErfK+MASg3g
0oEnpASvAgMBAAECggEAEdZquEPfPgqGeao41o0LUYUzsrBtRD0SGY/30QVycX/j
2vkRlC4scgl7BpbqZB549KzqgWBE4nk6a5vTotN8975PhRodpaOT54M/EOUB6qOT
zfuQjh41LzYBczjgeU6+jiQFifC43pZhpOYBHu2+3GvaHq4pKJVtYupsxFiR8nku
MzAcjrKVfAnaPZkSAo75UkGoAhQb/EcQpV32CBVGawWp3XQluPrNK8cb0u3LqiXZ
QcsqgyEUp9OpQzETdMNQ44i+aJd3PiajOPZu+tcLayNHhMP9BmX2cifopMpWPC+h
cANrB/V2ogIXp5htmTw1arTPNL4g2LQLQxynaIVIoQKBgQD4drAhTqN2tpZ39xf9
yfHm7uK70QdjTIZF+iU6ARuwPXk02bP0nsw8IXhISefSr98p1Iez0Wua6cFL9kQH
XoS+4YObA5o46XhIbrM3TY6OL3uJY4AhiH57IcyZ2od0GYx6AlQJsm5E0pJIeKn7
Rw5TsFnSoXcfNeQ4dsXhXdQMzwKBgQDUmVLGpo2Iwz92ft9gIEGoHqN4kYL3ltN6
t5S0EaI+5Ddi2T/2GZPQXdcV+fAj8KKYEDHF1/fEXqESxD9gHzWpUBYAsQ9L/KkO
m9gnnP3thkBF7r7vwxHP61IsebeCjxwkZFWC+xPcbDSL8gOEPDlX4bG6kkdds3LH
61Rg1i9CIQKBgGMSUGC3jo6Dd7QWHsbfg0ll75qcWqnJlbDJcZaTYor/uBjOxebA
ewdvARsx/PIRlpaDXCjjVFjM5Hp5k96sXZoPKf7hjNksnv2ixmtCzZj8bfH2btzw
JB7M91xRurkchtsPmprTPwzKOfITyxOa3aeZJffK0kjroDizg2u9khQZAoGAcXQ5
JmXvlhKMJZJjZosQPsXK+ya8O6CzzwN1Sfs3GFT18bx6U70mksXhaIrvSl66hmfu
B+TPBm5xivBL2eIN4wMoGspinWyCU5d7bPhs0nsYhbl5D76MHOc5/R4ffn8cx5b7
w2B2IuVjzWMj2UfCWlHJZQV3LFv9Xw8JAnyKz8ECgYATyrxUvVdIw6MPLYIP4hzo
klGzVAXBy93RuT78Qt75JGUwM2JMM4FgWnJC9UX+37S0+j6Ya76bQKe/T2Ds8mEV
cYyuNwgDldxFtDoAZSWu5StdJfOmdIwaAjjalcZrMCjROMe34Q3ornxeW76uX4eH
2VKzGu3hmEQjwOgIMSoldg==
-----END PRIVATE KEY-----`;

/** The same RSA key as RSA_PKCS8, as PKCS#1 ("BEGIN RSA PRIVATE KEY"). */
export const RSA_PKCS1 = `-----BEGIN RSA PRIVATE KEY-----
MIIEogIBAAKCAQEAzlcZIarkl0V/F/UWeDvpEjX2MJSRnl5oixW6mBty4eYUU9Dw
/KrrvmMM0Dag9ArNgvcVf8CpTKmq8/gagiQA9Zjl4PDfv7X3DqtqcQNQB9bmp0tf
H9KaGjdh58AA0lmBvunSZ+TVspAbnwP0Yl0HK2NR9+ynOJOTTGxXVXBeH7u0AEc3
KOmz+dy40rOX04R1YAhOcfRAM2ZEBgw7NRMKo/yXBsuqEKtVys41k7E4hyK6N+Kt
B1Vmavz/8dvLWCshOQQ4sj0zjBeYxLeDwUXNQYCOR0Q7W6Yzg8tI8pN2SX3JyS7w
n4XoMmfspQ+9oMcORmRK3yvjAEoN4NKBJ6QErwIDAQABAoIBABHWarhD3z4Khnmq
ONaNC1GFM7KwbUQ9EhmP99EFcnF/49r5EZQuLHIJewaW6mQeePSs6oFgROJ5Omub
06LTfPe+T4UaHaWjk+eDPxDlAeqjk837kI4eNS82AXM44HlOvo4kBYnwuN6WYaTm
AR7tvtxr2h6uKSiVbWLqbMRYkfJ5LjMwHI6ylXwJ2j2ZEgKO+VJBqAIUG/xHEKVd
9ggVRmsFqd10Jbj6zSvHG9Lty6ol2UHLKoMhFKfTqUMxE3TDUOOIvmiXdz4mozj2
bvrXC2sjR4TD/QZl9nIn6KTKVjwvoXADawf1dqICF6eYbZk8NWq0zzS+INi0C0Mc
p2iFSKECgYEA+HawIU6jdraWd/cX/cnx5u7iu9EHY0yGRfolOgEbsD15NNmz9J7M
PCF4SEnn0q/fKdSHs9FrmunBS/ZEB16EvuGDmwOaOOl4SG6zN02Oji97iWOAIYh+
eyHMmdqHdBmMegJUCbJuRNKSSHip+0cOU7BZ0qF3HzXkOHbF4V3UDM8CgYEA1JlS
xqaNiMM/dn7fYCBBqB6jeJGC95bTereUtBGiPuQ3Ytk/9hmT0F3XFfnwI/CimBAx
xdf3xF6hEsQ/YB81qVAWALEPS/ypDpvYJ5z97YZARe6+78MRz+tSLHm3go8cJGRV
gvsT3Gw0i/IDhDw5V+GxupJHXbNyx+tUYNYvQiECgYBjElBgt46Og3e0Fh7G34NJ
Ze+anFqpyZWwyXGWk2KK/7gYzsXmwHsHbwEbMfzyEZaWg1wo41RYzOR6eZPerF2a
Dyn+4YzZLJ79osZrQs2Y/G3x9m7c8CQezPdcUbq5HIbbD5qa0z8MyjnyE8sTmt2n
mSX3ytJI66A4s4NrvZIUGQKBgHF0OSZl75YSjCWSY2aLED7FyvsmvDugs88DdUn7
NxhU9fG8elO9JpLF4WiK70peuoZn7gfkzwZucYrwS9niDeMDKBrKYp1sglOXe2z4
bNJ7GIW5eQ++jBznOf0eH35/HMeW+8NgdiLlY81jI9lHwlpRyWUFdyxb/V8PCQJ8
is/BAoGAE8q8VL1XSMOjDy2CD+Ic6JJRs1QFwcvd0bk+/ELe+SRlMDNiTDOBYFpy
QvVF/t+0tPo+mGu+m0Cnv09g7PJhFXGMrjcIA5XcRbQ6AGUlruUrXSXzpnSMGgI4
2pXGazAo0TjHt+EN6K58Xlu+rl+Hh9lSsxrt4ZhEI8DoCDEqJXY=
-----END RSA PRIVATE KEY-----`;

/** P-256 as `openssl ecparam -genkey` writes it: an EC PARAMETERS block, then the SEC1 key ("BEGIN EC PRIVATE KEY"). */
export const EC_SEC1 = `-----BEGIN EC PARAMETERS-----
BggqhkjOPQMBBw==
-----END EC PARAMETERS-----
-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIJQ9mGX1IfsjHLl3p7fA5bvbiGjtPP0Evk/w8WStUu/ooAoGCCqGSM49
AwEHoUQDQgAEMhuNG4aVMBxKclc8brsAXagezRXOkLaZ3hYPzGa4u398mjsK7AMQ
hZ+PhdpCXU1gVtO/nIZSwTsX97ZFeSMhOw==
-----END EC PRIVATE KEY-----`;

/** The same P-256 key as EC_SEC1, as PKCS#8. */
export const EC_PKCS8 = `-----BEGIN PRIVATE KEY-----
MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQglD2YZfUh+yMcuXen
t8Dlu9uIaO08/QS+T/DxZK1S7+ihRANCAAQyG40bhpUwHEpyVzxuuwBdqB7NFc6Q
tpneFg/MZri7f3yaOwrsAxCFn4+F2kJdTWBW07+chlLBOxf3tkV5IyE7
-----END PRIVATE KEY-----`;

/** P-384, PKCS#8. */
export const P384_PKCS8 = `-----BEGIN PRIVATE KEY-----
MIG2AgEAMBAGByqGSM49AgEGBSuBBAAiBIGeMIGbAgEBBDCFtI7bXo/j1Gzysc4c
wNCCJpJ1RbM1QV7p3qqhN80mEEJGJx3apdE7sReZydnmrnShZANiAASIzJ5A/uU3
reNhAK5Fwqe9b75NNGRmIqK2ppagX85ndN3tz7kEu6WFgXyoXXg+yp+k0rUj7OF9
8AWTuy7p5yafl1xZDFWPIkqq+fpHZwZphIaha+ZSixQldlJZWuu2dWg=
-----END PRIVATE KEY-----`;

/** Ed25519, PKCS#8. */
export const ED25519_PKCS8 = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIFm+TgyONG9DUDx/FUqYFZON9XWqGo1tEqXj3eUaP6l/
-----END PRIVATE KEY-----`;

/** X25519, PKCS#8: a key-agreement key, which cannot sign. */
export const X25519_PKCS8 = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VuBCIEINh9G+a5PRKp/xJDC6LjhETWOe+bdGVNi3wBZ9l0ilNS
-----END PRIVATE KEY-----`;

/** EC_PKCS8 encrypted with AES-256-CBC (passphrase "test"). */
export const ENCRYPTED_PKCS8 = `-----BEGIN ENCRYPTED PRIVATE KEY-----
MIH0MF8GCSqGSIb3DQEFDTBSMDEGCSqGSIb3DQEFDDAkBBDkonylablI0PyXsrl1
hrO7AgIIADAMBggqhkiG9w0CCQUAMB0GCWCGSAFlAwQBKgQQE8uXatpKf5g3MdSE
gC4r8wSBkDvCp/JjTS960Fg9T+tf/js0nKNL+mNNlmDr6M0QuCNcLiUYLrqItwjQ
+2+NDi1Aq3MgUl0Fkqm+JlfxsCybPEQwKQcJNYiDSbfGk2BmNEKmwvvHnCMTHniC
VAJeq1a2J4WscJGhaJAYGlzVTU65HhZWyTYZSht0J/fcTfJ4I98FpKADBd1chwg1
zSr3gp2Sjw==
-----END ENCRYPTED PRIVATE KEY-----`;

/** The public key of RSA_PKCS8 and RSA_PKCS1: `openssl pkey -in rsa.pkcs8.pem -pubout` */
export const RSA_PUBLIC = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAzlcZIarkl0V/F/UWeDvp
EjX2MJSRnl5oixW6mBty4eYUU9Dw/KrrvmMM0Dag9ArNgvcVf8CpTKmq8/gagiQA
9Zjl4PDfv7X3DqtqcQNQB9bmp0tfH9KaGjdh58AA0lmBvunSZ+TVspAbnwP0Yl0H
K2NR9+ynOJOTTGxXVXBeH7u0AEc3KOmz+dy40rOX04R1YAhOcfRAM2ZEBgw7NRMK
o/yXBsuqEKtVys41k7E4hyK6N+KtB1Vmavz/8dvLWCshOQQ4sj0zjBeYxLeDwUXN
QYCOR0Q7W6Yzg8tI8pN2SX3JyS7wn4XoMmfspQ+9oMcORmRK3yvjAEoN4NKBJ6QE
rwIDAQAB
-----END PUBLIC KEY-----`;

/** The public key of EC_SEC1 and EC_PKCS8: `openssl pkey -in ec.pkcs8.pem -pubout` */
export const EC_PUBLIC = `-----BEGIN PUBLIC KEY-----
MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEMhuNG4aVMBxKclc8brsAXagezRXO
kLaZ3hYPzGa4u398mjsK7AMQhZ+PhdpCXU1gVtO/nIZSwTsX97ZFeSMhOw==
-----END PUBLIC KEY-----`;

/** P-521, PKCS#8. */
export const P521_PKCS8 = `-----BEGIN PRIVATE KEY-----
MIHuAgEAMBAGByqGSM49AgEGBSuBBAAjBIHWMIHTAgEBBEIAp3HoK/KBY0Ig1JRR
Z2WRb7yxBASf75u/mQi1XaReMYaCDG3GGy9JoazsiqabTlDiedgG8ZF6OgRoZ+YW
C9bHfp2hgYkDgYYABABt0ZmcHZbiCVQkARVFyyTMcQIpCzz6FFAzuJf7Pb6cEtJy
95BoLzs5059lWpV9Y9JYwnF8Nljw50+CwrtGjhKPCgDgS9NOV3FdLnmPU+fg1bEJ
48AfhGs3pu5mqEmVieZ3MsrMNfip++KxHeiOIPqHOWT2vL2Q06RwksfKfqLAyHcD
ag==
-----END PRIVATE KEY-----`;

/** EC_SEC1 with the curve spelled out as explicit parameters instead of named. */
export const EC_SEC1_EXPLICIT = `-----BEGIN EC PRIVATE KEY-----
MIIBaAIBAQQglD2YZfUh+yMcuXent8Dlu9uIaO08/QS+T/DxZK1S7+iggfowgfcC
AQEwLAYHKoZIzj0BAQIhAP////8AAAABAAAAAAAAAAAAAAAA////////////////
MFsEIP////8AAAABAAAAAAAAAAAAAAAA///////////////8BCBaxjXYqjqT57Pr
vVV2mIa8ZR0GsMxTsPY7zjw+J9JgSwMVAMSdNgiG5wSTamZ44ROdJreBn36QBEEE
axfR8uEsQkf4vOblY6RA8ncDfYEt6zOg9KE5RdiYwpZP40Li/hp/m47n60p8D54W
K84zV2sxXs7LtkBoN79R9QIhAP////8AAAAA//////////+85vqtpxeehPO5ysL8
YyVRAgEBoUQDQgAEMhuNG4aVMBxKclc8brsAXagezRXOkLaZ3hYPzGa4u398mjsK
7AMQhZ+PhdpCXU1gVtO/nIZSwTsX97ZFeSMhOw==
-----END EC PRIVATE KEY-----`;

/** EC_SEC1 without its public key. */
export const EC_SEC1_NO_PUBLIC = `-----BEGIN EC PRIVATE KEY-----
MDECAQEEIJQ9mGX1IfsjHLl3p7fA5bvbiGjtPP0Evk/w8WStUu/ooAoGCCqGSM49
AwEH
-----END EC PRIVATE KEY-----`;

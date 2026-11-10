# Privacy Policy

Last updated: 2026-11-11

Cert Tool is a Chrome extension. It generates keys and CSRs, inspects certificates, and lints them. Everything runs inside your browser. Cert Tool has no server, no account, and no analytics. It sends nothing to its developer or to anyone else. The only network request it causes is the one described under **The current site's certificate** below, which goes to the site you are already visiting.

## What Cert Tool handles

- **Text you enter in the popup**, such as certificates, CSRs, private keys, and CSR fields (names, organizations, email addresses).
- **Keys and CSRs that Cert Tool generates** for you.
- **Web page content, only when you ask.** Cert Tool reads the text of the current tab when you click **Scan this page** or choose **Inspect certificate with Cert Tool** on a selection. It reads only that tab, only at that moment, and only to find PEM blocks. It does not parse private key blocks it finds on pages; it skips them.
- **The current site's certificate, only when you ask.** When you click **Show this site's certificate**, Cert Tool briefly attaches Chrome's debugger to the current tab. Chrome shows a "started debugging this browser" bar while it is attached. Cert Tool reads the tab's address and origin, and has the tab send a HEAD request without cookies to the site's home page, or to the page on the same site that the home page redirects to. Redirects to other sites are not followed, and the address of the page you are on is not sent. Cert Tool then reads the certificate chain and connection details (TLS version and cipher) Chrome received for that response, and detaches. It does not read or change the page's content. The site sees this request like any other visit without cookies, including your IP address and browser version.

## How it is used

Cert Tool uses this data only to show you results: decoded fields, validity, lint findings, and derived public keys. The data is processed in memory on your device. Certificate text from a page goes only to the extension's own background worker for parsing, and a site's certificate goes only from the background worker to the popup.

## Storage

Cert Tool does not store any of this data. It uses no extension storage, cookies, or local storage.

- Popup results are gone when the popup closes.
- Badges and cards on a page are gone when the page is reloaded or closed.
- A file is saved only when you click a save button, to the location you choose.
- Text is copied to the clipboard only when you click a copy button.

## Sharing

No data leaves your device, apart from the request to the site you are visiting described above, which carries no cookies and no data from Cert Tool. Cert Tool does not sell, transfer, or share user data with anyone. It does not use data for advertising or to determine creditworthiness.

The use of information received by Cert Tool adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/policies), including the Limited Use requirements.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `downloads` | Saves the keys and CSRs you generate, when you click a save button. |
| `activeTab`, `scripting` | Reads the current page, only when you click **Scan this page** or the menu item. |
| `contextMenus` | Adds **Inspect certificate with Cert Tool** to the right-click menu for selected text. |
| `debugger` | Reads the certificate Chrome received from the site in the current tab, only when you click **Show this site's certificate**. Chrome offers extensions no other way to read it. Cert Tool attaches only for that read and detaches right after. |

## Changes

Changes to this policy are recorded in this file's [history](https://github.com/mkontani/cert-tool-extension/commits/main/PRIVACY.md).

## Contact

Please open an issue at <https://github.com/mkontani/cert-tool-extension/issues>.

# Privacy Policy

Last updated: 2026-11-01

Cert Tool is a Chrome extension. It generates keys and CSRs, inspects certificates, and lints them. Everything runs inside your browser. Cert Tool has no server, no account, and no analytics, and it makes no network requests.

## What Cert Tool handles

- **Text you enter in the popup**, such as certificates, CSRs, private keys, and CSR fields (names, organizations, email addresses).
- **Keys and CSRs that Cert Tool generates** for you.
- **Web page content, only when you ask.** Cert Tool reads the text of the current tab when you click **Scan this page** or choose **Inspect certificate with Cert Tool** on a selection. It reads only that tab, only at that moment, and only to find PEM blocks. It does not parse private key blocks it finds on pages; it skips them.

## How it is used

Cert Tool uses this data only to show you results: decoded fields, validity, lint findings, and derived public keys. The data is processed in memory on your device. Certificate text from a page goes only to the extension's own background worker for parsing.

## Storage

Cert Tool does not store any of this data. It uses no extension storage, cookies, or local storage.

- Popup results are gone when the popup closes.
- Badges and cards on a page are gone when the page is reloaded or closed.
- A file is saved only when you click a save button, to the location you choose.
- Text is copied to the clipboard only when you click a copy button.

## Sharing

No data leaves your device. Cert Tool does not sell, transfer, or share user data with anyone. It does not use data for advertising or to determine creditworthiness.

The use of information received by Cert Tool adheres to the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/policies), including the Limited Use requirements.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `downloads` | Saves the keys and CSRs you generate, when you click a save button. |
| `activeTab`, `scripting` | Reads the current page, only when you click **Scan this page** or the menu item. |
| `contextMenus` | Adds **Inspect certificate with Cert Tool** to the right-click menu for selected text. |

## Changes

Changes to this policy are recorded in this file's [history](https://github.com/mkontani/cert-tool-extension/commits/main/PRIVACY.md).

## Contact

Please open an issue at <https://github.com/mkontani/cert-tool-extension/issues>.

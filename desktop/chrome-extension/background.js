/**
 * DEX MADE Owner Activation Bridge
 *
 * Sends only two facts to the local DEX MADE server:
 *   1. Chrome started
 *   2. A Gmail tab was opened
 *
 * It never reads page content, messages, passwords, OTPs or account details,
 * and it does not authenticate anyone. DEX MADE decides on its own whether the
 * owner must verify with face or voice before the personal session unlocks.
 */

const AURIX_ENDPOINTS = ["http://127.0.0.1:3000", "http://localhost:3000"];

async function notifyAurix(source, detail) {
  for (const base of AURIX_ENDPOINTS) {
    try {
      const res = await fetch(`${base}/api/activation/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, detail }),
      });
      if (res.ok) {
        chrome.action.setBadgeText({ text: "ON" });
        chrome.action.setBadgeBackgroundColor({ color: "#10B981" });
        return;
      }
    } catch {
      // DEX MADE is not running — nothing to do, never retry in a loop.
    }
  }
  chrome.action.setBadgeText({ text: "OFF" });
  chrome.action.setBadgeBackgroundColor({ color: "#94A3B8" });
}

chrome.runtime.onStartup.addListener(() => {
  void notifyAurix("chrome", "Google Chrome started");
});

chrome.runtime.onInstalled.addListener(() => {
  void notifyAurix("chrome", "DEX MADE bridge installed — Chrome bridge connected");
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId !== 0) return;
  try {
    const url = new URL(details.url);
    if (url.hostname === "mail.google.com") {
      void notifyAurix("gmail", "Gmail opened in Chrome");
    }
  } catch {
    // Ignore chrome:// and other non-URL navigations.
  }
});

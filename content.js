// Content script is kept minimal since most functionality is handled by the background script
// This script can be expanded for more complex page interactions in the future

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "checkFocusMode") {
      sendResponse({ received: true });
    }
  });
  
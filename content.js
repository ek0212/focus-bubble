console.log('[Focus Bubble] content.js loaded');

// Notify background script that content script is ready
chrome.runtime.sendMessage({ action: "contentScriptReady", tabId: window.__uniqueId });

// Set injection marker
window._focusBubbleInjected = true;

// Content script handles the warning overlay functionality
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showWarning") {
    showWarningOverlay(message.focusAppName, message.delaySeconds);
    Promise.resolve(sendResponse({ success: true })).catch(() => {});
    return true; // Keep message channel open for async response
  }
});

// Function to show the warning overlay
function showWarningOverlay(focusAppName, delaySeconds) {
  if (document.getElementById('focus-bubble-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'focus-bubble-overlay';
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(8px);
    color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;

  const messageBox = document.createElement('div');
  messageBox.style.cssText = `
    background-color: rgba(30, 41, 59, 0.95);
    padding: 48px;
    border-radius: 16px;
    text-align: center;
    max-width: 460px;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transform: translateY(20px);
    transition: transform 0.3s ease;
  `;

  const title = document.createElement('h2');
  title.innerText = 'Stay Focused';
  title.style.cssText = `
    margin: 0 0 24px 0;
    color: #60a5fa;
    font-size: 32px;
    font-weight: 600;
    letter-spacing: -0.5px;
  `;

  const message = document.createElement('p');
  message.innerText = `Currently using: ${focusAppName}. Continue?`;
  message.style.cssText = `
    font-size: 18px;
    line-height: 1.6;
    margin: 0 0 36px 0;
    color: #e2e8f0;
  `;

  const buttons = document.createElement('div');
  buttons.style.cssText = `
    display: flex;
    justify-content: center;
    gap: 16px;
    margin-top: 8px;
  `;

  const stayButton = document.createElement('button');
  stayButton.innerText = 'Stay Focused';
  stayButton.style.cssText = `
    background-color: #10b981;
    color: white;
    border: none;
    padding: 14px 28px;
    border-radius: 10px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 600;
    transition: all 0.2s;
    min-width: 160px;
  `;
  stayButton.onmouseover = () => { stayButton.style.backgroundColor = '#059669'; };
  stayButton.onmouseout = () => { stayButton.style.backgroundColor = '#10b981'; };
  stayButton.onclick = () => {
    overlay.style.opacity = '0';
    messageBox.style.transform = 'translateY(20px)';
    setTimeout(() => {
      chrome.runtime.sendMessage({ action: "closeTab" });
      overlay.remove();
    }, 300);
  };

  const proceedButton = document.createElement('button');
  proceedButton.style.cssText = `
    background-color: transparent;
    color: #94a3b8;
    border: 1px solid #475569;
    padding: 14px 28px;
    border-radius: 10px;
    cursor: not-allowed;
    font-size: 16px;
    font-weight: 600;
    transition: all 0.2s;
    min-width: 160px;
    opacity: 0.7;
  `;

  let countdown = Math.max(0, parseInt(delaySeconds) || 3);
  proceedButton.innerText = `Wait ${countdown}s`;
  proceedButton.disabled = true;

  const countdownInterval = setInterval(() => {
    countdown = Math.max(0, countdown - 1);
    
    if (countdown > 0) {
      proceedButton.innerText = `Wait ${countdown}s`;
    } else {
      clearInterval(countdownInterval);
      proceedButton.disabled = false;
      proceedButton.style.opacity = '1';
      proceedButton.style.cursor = 'pointer';
      proceedButton.style.backgroundColor = '#475569';
      proceedButton.style.borderColor = '#475569';
      proceedButton.style.color = '#f1f5f9';
      proceedButton.innerText = 'Proceed Anyway';

      proceedButton.onmouseover = () => {
        proceedButton.style.backgroundColor = '#64748b';
        proceedButton.style.borderColor = '#64748b';
      };
      proceedButton.onmouseout = () => {
        proceedButton.style.backgroundColor = '#475569';
        proceedButton.style.borderColor = '#475569';
      };
    }
  }, 1000);

  proceedButton.onclick = () => {
    if (!proceedButton.disabled) {
      chrome.storage.local.set({ temporarilyDisabled: true }, () => {
        overlay.style.opacity = '0';
        messageBox.style.transform = 'translateY(20px)';
        setTimeout(() => overlay.remove(), 300);
      });
    }
  };

  buttons.appendChild(stayButton);
  buttons.appendChild(proceedButton);
  messageBox.appendChild(title);
  messageBox.appendChild(message);
  messageBox.appendChild(buttons);
  overlay.appendChild(messageBox);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    messageBox.style.transform = 'translateY(0)';
  });
}

// Default settings - will be customizable later
const defaultSettings = {
    isEnabled: true,
    focusApps: [
      { domain: "docs.google.com", name: "Google Docs" },
      { domain: "notion.so", name: "Notion" },
      { domain: "trello.com", name: "Trello" },
      { domain: "replit.com", name: "Replit" },
      { domain: "canva.com", name: "Canva" },
      { domain: "github.com", name: "GitHub" }
    ],
    distractingSites: [
      { domain: "reddit.com", name: "Reddit" },
      { domain: "twitter.com", name: "Twitter" },
      { domain: "x.com", name: "X" },
      { domain: "youtube.com", name: "YouTube" },
      { domain: "facebook.com", name: "Facebook" },
      { domain: "instagram.com", name: "Instagram" },
      { domain: "tiktok.com", name: "TikTok" }
    ],
    delaySeconds: 5,
    isInFocusMode: false,
    currentFocusApp: null
  };
  
  // Initialize settings
  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set(defaultSettings);
  });
  
  // Listen for tab updates
  chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
      checkCurrentTab(tab);
    }
  });
  
  // Listen for tab activation changes
  chrome.tabs.onActivated.addListener(({ tabId }) => {
    chrome.tabs.get(tabId, checkCurrentTab);
  });
  
  // Function to check if the current tab is a focus app or distraction
  function checkCurrentTab(tab) {
    if (!tab.url) return;
    
    const url = new URL(tab.url);
    const domain = url.hostname.replace('www.', '');
    
    chrome.storage.local.get(defaultSettings, (settings) => {
      if (!settings.isEnabled) return;
      
      // Check if this is a focus app
      const focusApp = settings.focusApps.find(app => domain.includes(app.domain));
      
      if (focusApp) {
        // We're in a focus app - enter focus mode
        chrome.storage.local.set({ 
          isInFocusMode: true,
          currentFocusApp: focusApp
        });
        
        // Update the extension icon to show focused state
        updateIcon(true);
      } else {
        // Check if this is a distraction site while in focus mode
        chrome.storage.local.get(['isInFocusMode', 'currentFocusApp', 'distractingSites'], (data) => {
          if (data.isInFocusMode) {
            const isDistraction = data.distractingSites.some(site => domain.includes(site.domain));
            
            if (isDistraction) {
              console.log('[Focus Bubble] Attempting to inject warning overlay on:', domain);
              try {
                // Store the values in Chrome storage first
                chrome.storage.local.set({
                  tempFocusAppName: data.currentFocusApp.name,
                  tempDelaySeconds: settings.delaySeconds
                }, () => {
                  // Then inject the script without args
                  chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    function: showWarningOverlay
                  });
                });
              } catch (e) {
                console.error('[Focus Bubble] Script injection error:', e);
              }
            }
          }
        });
      }
    });
  }
  
  // Function to update the extension icon based on focus state
  function updateIcon(isFocused) {
    const iconPath = isFocused ? 
      { path: { 16: "icons/icon16.png", 48: "icons/icon48.png", 128: "icons/icon128.png" } } :
      { path: { 16: "icons/icon16-inactive.png", 48: "icons/icon48-inactive.png", 128: "icons/icon128-inactive.png" } };
    
    chrome.action.setIcon(iconPath);
  }
  
  // This function will be injected into the page to show the warning
  function showWarningOverlay(focusAppName, delaySeconds) {
    console.log('[Focus Bubble] showWarningOverlay called with:', focusAppName, delaySeconds);
    // Check if overlay already exists
    if (document.getElementById('focus-bubble-overlay')) return;
  
    // Create overlay container
    const overlay = document.createElement('div');
    overlay.id = 'focus-bubble-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background-color: rgba(0, 0, 0, 0.9);
      color: white;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      z-index: 2147483647;
      font-family: 'Arial', sans-serif;
    `;
  
    // Create message container
    const messageBox = document.createElement('div');
    messageBox.style.cssText = `
      background-color: #2c3e50;
      padding: 40px;
      border-radius: 10px;
      text-align: center;
      max-width: 500px;
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3);
    `;
  
    // Create title
    const title = document.createElement('h2');
    title.innerText = 'Stay Focused!';
    title.style.cssText = 'margin-top: 0; color: #3498db; font-size: 28px;';
  
    // Create message
    const message = document.createElement('p');
    message.innerText = `You're currently working in ${focusAppName}. Do you really need to visit this site right now?`;
    message.style.cssText = 'font-size: 18px; margin: 20px 0;';
  
    // Create buttons container
    const buttons = document.createElement('div');
    buttons.style.cssText = 'display: flex; justify-content: space-between; margin-top: 30px;';
  
    // Create "Stay Focused" button
    const stayButton = document.createElement('button');
    stayButton.innerText = 'Stay Focused';
    stayButton.style.cssText = `
      background-color: #2ecc71;
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      transition: background-color 0.3s;
      margin-right: 10px;
    `;
    stayButton.onmouseover = () => { stayButton.style.backgroundColor = '#27ae60'; };
    stayButton.onmouseout = () => { stayButton.style.backgroundColor = '#2ecc71'; };
    stayButton.onclick = () => {
      window.history.back();
      overlay.remove();
    };
  
    // Create "Proceed Anyway" button
    const proceedButton = document.createElement('button');
    proceedButton.innerText = 'Proceed Anyway';
    proceedButton.style.cssText = `
      background-color: #e74c3c;
      color: white;
      border: none;
      padding: 12px 20px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
      transition: background-color 0.3s;
      margin-left: 10px;
    `;
    proceedButton.onmouseover = () => { proceedButton.style.backgroundColor = '#c0392b'; };
    proceedButton.onmouseout = () => { proceedButton.style.backgroundColor = '#e74c3c'; };
  
    // Set up countdown
    let countdown = delaySeconds;
    proceedButton.innerText = `Proceed Anyway (${countdown}s)`;
    proceedButton.disabled = true;
    proceedButton.style.opacity = '0.5';
    proceedButton.style.cursor = 'not-allowed';
  
    const countdownInterval = setInterval(() => {
      countdown--;
      proceedButton.innerText = `Proceed Anyway (${countdown}s)`;
      
      if (countdown <= 0) {
        clearInterval(countdownInterval);
        proceedButton.disabled = false;
        proceedButton.style.opacity = '1';
        proceedButton.style.cursor = 'pointer';
        proceedButton.innerText = 'Proceed Anyway';
      }
    }, 1000);
  
    proceedButton.onclick = () => {
      if (countdown <= 0) {
        overlay.remove();
      }
    };
  
    // Assemble the overlay
    buttons.appendChild(stayButton);
    buttons.appendChild(proceedButton);
    messageBox.appendChild(title);
    messageBox.appendChild(message);
    messageBox.appendChild(buttons);
    overlay.appendChild(messageBox);
    document.body.appendChild(overlay);
  }
  
  // Listen for messages from popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "toggleFocusMode") {
      chrome.storage.local.get(['isInFocusMode'], (data) => {
        const newState = !data.isInFocusMode;
        chrome.storage.local.set({ isInFocusMode: newState });
        updateIcon(newState);
        sendResponse({ success: true, isInFocusMode: newState });
      });
      return true; // Keep the message channel open for async response
    }
  });
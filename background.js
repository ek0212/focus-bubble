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
  
  let focusedTabs = new Map(); // Maps tabId to {url, domain, timestamp}

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
  
  // Listen for new tab creation
  function checkCurrentTab(tab) {
    if (!tab.url) return;
    
    const url = new URL(tab.url);
    const domain = url.hostname.replace('www.', '');
    
    chrome.storage.local.get(defaultSettings, (settings) => {
        if (!settings.isEnabled) return;
        
        // Check if this is a focus app
        const focusApp = settings.focusApps.find(app => domain.includes(app.domain));
        
        if (focusApp) {
            // Add to focused tabs
            focusedTabs.set(tab.id, {
                url: tab.url,
                domain: domain,
                timestamp: Date.now(),
                appName: focusApp.name
            });
            
            // Update focus mode state
            chrome.storage.local.set({ 
                isInFocusMode: true,
                currentFocusApp: getCurrentlyFocusingOn()
            });
            
            updateIcon(true);
        } else {
            // Remove from focused tabs if it was there
            focusedTabs.delete(tab.id);
            
            // Check if this is a distraction site while in focus mode
            if (focusedTabs.size > 0) { // Still in focus mode if we have other focus tabs
                const isDistraction = settings.distractingSites.some(site => 
                    domain.includes(site.domain)
                );
                
                if (isDistraction) {
                    handleDistraction(tab, settings);
                }
            } else {
                // No more focus tabs, disable focus mode
                chrome.storage.local.set({ 
                    isInFocusMode: false,
                    currentFocusApp: null
                });
                updateIcon(false);
            }
        }
    });
}

// Helper function to get current focus status
function getCurrentlyFocusingOn() {
    if (focusedTabs.size === 0) return null;
    
    const apps = new Set([...focusedTabs.values()].map(tab => tab.appName));
    const appList = Array.from(apps);
    
    if (appList.length === 1) {
        return { name: appList[0] };
    }
    return { name: `${appList.join(' and ')}` };
}

// Helper function to handle distractions
function handleDistraction(tab, settings) {
  console.log('[Focus Bubble] Attempting to show warning overlay');
  try {
    const currentFocus = getCurrentlyFocusingOn();
    chrome.tabs.sendMessage(tab.id, {
      action: "showWarning",
      focusAppName: currentFocus.name,
      delaySeconds: settings.delaySeconds
    });
  } catch (e) {
    console.error('[Focus Bubble] Error showing warning:', e);
  }
}
  
// Function to update the extension icon based on focus state
function updateIcon(isFocused) {
  const iconPath = isFocused ? 
    { path: { 16: "icons/icon16.png", 48: "icons/icon48.png", 128: "icons/icon128.png" } } :
    { path: { 16: "icons/icon16-inactive.png", 48: "icons/icon48-inactive.png", 128: "icons/icon128-inactive.png" } };
  
  chrome.action.setIcon(iconPath);
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

  // Add tab removal listener
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    if (focusedTabs.has(tabId)) {
        focusedTabs.delete(tabId);
        
        // Update focus mode if no more focus tabs
        if (focusedTabs.size === 0) {
            await chrome.storage.local.set({ 
                isInFocusMode: false,
                currentFocusApp: null,
                focusedTabCount: 0
            });
            updateIcon(false);
            // Notify popup to update
            chrome.runtime.sendMessage({
                action: "focusStateChanged",
                isInFocusMode: false
            });
        } else {
            const currentFocus = getCurrentlyFocusingOn();
            await chrome.storage.local.set({
                currentFocusApp: currentFocus,
                focusedTabCount: focusedTabs.size
            });
        }
    }
  });
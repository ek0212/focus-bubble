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
    delaySeconds: 3,
    isInFocusMode: false,
    currentFocusApp: null,
    focusSessions: 0,
    distractionsBlocked: 0
  };
  
  let focusedTabs = new Map(); // Maps tabId to {url, domain, timestamp}
  let contentScriptReadyTabs = new Set(); // Map to track which tabs have content scripts ready

  // Initialize settings
  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set(defaultSettings);
    
    // Reset counters at midnight
    chrome.alarms.create('resetCounters', {
        when: getNextMidnight(),
        periodInMinutes: 24 * 60 // Run daily
    });
  });

  // Reset counters at midnight
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'resetCounters') {
        chrome.storage.local.set({
            focusSessions: 0,
            distractionsBlocked: 0
        }, () => {
            // Notify popup of reset stats
            chrome.runtime.sendMessage({
                action: "statsUpdated"
            });
        });
    }
  });

  function getNextMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime();
  }
  
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
            // Check if this is a new focus session
            const wasInFocusMode = focusedTabs.size > 0;
            
            // Add to focused tabs
            focusedTabs.set(tab.id, {
                url: tab.url,
                domain: domain,
                timestamp: Date.now(),
                appName: focusApp.name
            });
            
            // If this is a new focus session, increment the counter
            if (!wasInFocusMode) {
                chrome.storage.local.get(['focusSessions'], (data) => {
                    chrome.storage.local.set({ 
                        focusSessions: (data.focusSessions || 0) + 1,
                        isInFocusMode: true,
                        currentFocusApp: getCurrentlyFocusingOn()
                    }, () => {
                        // Notify popup of updated stats
                        chrome.runtime.sendMessage({
                            action: "statsUpdated"
                        });
                    });
                });
            } else {
                chrome.storage.local.set({ 
                    isInFocusMode: true,
                    currentFocusApp: getCurrentlyFocusingOn()
                });
            }
            
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
async function handleDistraction(tab, settings) {
    const currentFocus = getCurrentlyFocusingOn();

    // Inject content script and wait for it to be ready
    const injectContentScript = async (tabId) => {
        try {
            const [result] = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => window._focusBubbleInjected === true
            });
            if (result?.result === true) {
                return;
            }
        } catch {
            // Silent fail if script check fails
        }

        try {
            // Inject the content script
            await chrome.scripting.executeScript({
                target: { tabId },
                func: () => {
                    window._focusBubbleInjected = true;
                }
            });

            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content.js']
            });

            // Wait a moment for the script to initialize
            await new Promise(resolve => setTimeout(resolve, 50));
        } catch {
            // Silent fail if injection fails
        }
    };

    // Make sure content script is injected
    await injectContentScript(tab.id);

    try {
        // Update distractions counter
        await new Promise((resolve) => {
            chrome.storage.local.get(['distractionsBlocked'], (data) => {
                chrome.storage.local.set({ 
                    distractionsBlocked: (data.distractionsBlocked || 0) + 1 
                }, () => {
                    chrome.runtime.sendMessage({
                        action: "statsUpdated"
                    });
                    resolve();
                });
            });
        });
    } catch {
        // Silent fail if counter update fails
    }

    // Try to send the message multiple times if needed
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 100;

    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            await chrome.tabs.sendMessage(tab.id, {
                action: "showWarning",
                focusAppName: currentFocus.name,
                delaySeconds: settings.delaySeconds
            });
            break; // Message sent successfully
        } catch {
            if (i < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            }
            // Silent fail on last attempt
        }
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
    if (message.action === "contentScriptReady" && sender.tab) {
        contentScriptReadyTabs.add(sender.tab.id);
    }
    if (message.action === "toggleFocusMode") {
        chrome.storage.local.get(['isInFocusMode'], (data) => {
            const newState = !data.isInFocusMode;
            chrome.storage.local.set({ isInFocusMode: newState });
            updateIcon(newState);
            sendResponse({ success: true, isInFocusMode: newState });
        });
        return true;
    }
});

// Add tab removal listener
chrome.tabs.onRemoved.addListener(async (tabId) => {
    contentScriptReadyTabs.delete(tabId);
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
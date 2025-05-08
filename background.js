// Default settings - will be customizable later
const defaultSettings = {
    focusApps: [
      { domain: "docs.google.com", name: "Google Docs" },
      { domain: "notion.so", name: "Notion" },
      { domain: "trello.com", name: "Trello" },
      { domain: "replit.com", name: "Replit" },
      { domain: "canva.com", name: "Canva" },
      { domain: "github.com", name: "GitHub" }
    ],
    blockedApps: [
      { domain: "reddit.com", name: "Reddit" },
      { domain: "twitter.com", name: "Twitter" },
      { domain: "x.com", name: "X" },
      { domain: "youtube.com", name: "YouTube" },
      { domain: "facebook.com", name: "Facebook" },
      { domain: "instagram.com", name: "Instagram" },
      { domain: "tiktok.com", name: "TikTok" },
      { domain: "slack.com", name: "Slack" }
    ],
    proceedTimeoutMinutes: 5,
    currentFocusApp: null,
    focusSessions: 0,
    temporarilyDisabledUntil: null
};

// Constants
const PROCEED_WAIT_SECONDS = 3;

let focusedTabs = new Map(); // Maps tabId to {url, domain, timestamp}
let contentScriptReadyTabs = new Set(); // Map to track which tabs have content scripts ready

// Initialize settings
chrome.runtime.onInstalled.addListener(() => {
    // Initialize with default settings
    chrome.storage.local.set(defaultSettings);
    
    // Reset counters at midnight
    chrome.alarms.create('resetCounters', {
        when: getNextMidnight(),
        periodInMinutes: 24 * 60 // Run daily
    });
});

// Handle alarms
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'resetCounters') {
        chrome.storage.local.set({
            focusSessions: 0,
            distractionsBlocked: 0
        });
    } else if (alarm.name === 'temporaryDisableExpired') {
        chrome.storage.local.set({ temporarilyDisabledUntil: null }, () => {
            // Recheck current tab when temporary disable expires
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]) {
                    checkCurrentTab(tabs[0]);
                }
            });
        });
    }
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

// Function to check if temporary disable has expired
async function isTemporarilyDisabled() {
    const data = await chrome.storage.local.get(['temporarilyDisabledUntil']);
    if (!data.temporarilyDisabledUntil) return false;
    return Date.now() < data.temporarilyDisabledUntil;
}

// Check current tab function
async function checkCurrentTab(tab) {
    if (!tab || !tab.url) return;
    
    const url = new URL(tab.url);
    const domain = url.hostname.replace('www.', '');
    
    const settings = await chrome.storage.local.get(['focusApps', 'blockedApps', 'currentFocusApp']);
    const focusApps = settings.focusApps || defaultSettings.focusApps;
    const blockedApps = settings.blockedApps || defaultSettings.blockedApps;
    
    // Check if this is a focus app
    const focusApp = focusApps.find(app => domain.includes(app.domain));
    
    if (focusApp) {
        // Add to focused tabs
        focusedTabs.set(tab.id, {
            url: tab.url,
            domain: domain,
            timestamp: Date.now(),
            appName: focusApp.name
        });
        
        // Update current focus app and increment sessions if needed
        const currentFocus = getCurrentlyFocusingOn();
        if (!settings.currentFocusApp) {
            // New focus session started
            chrome.storage.local.get(['focusSessions'], (data) => {
                chrome.storage.local.set({ 
                    focusSessions: (data.focusSessions || 0) + 1,
                    currentFocusApp: currentFocus
                });
            });
        } else {
            await chrome.storage.local.set({ currentFocusApp: currentFocus });
        }
        
        updateIcon(true);
    } else {
        // Remove from focused tabs if it was there
        focusedTabs.delete(tab.id);
        
        // Check if this is a distraction site
        const isDistraction = blockedApps.some(site => domain.includes(site.domain));
        
        // Show warning if we have focus tabs open and this is a distraction site
        if (focusedTabs.size > 0 && isDistraction && !(await isTemporarilyDisabled())) {
            handleDistraction(tab);
        }
        
        // Update icon and current focus app
        const currentFocus = getCurrentlyFocusingOn();
        await chrome.storage.local.set({ 
            currentFocusApp: currentFocus
        });
        updateIcon(focusedTabs.size > 0);
    }
}

// Helper function to get current focus status
function getCurrentlyFocusingOn() {
    if (focusedTabs.size === 0) return null;
    
    const apps = new Set([...focusedTabs.values()].map(tab => tab.appName));
    const appList = Array.from(apps);
    
    if (appList.length === 1) {
        return { name: appList[0] };
    } else if (appList.length === 2) {
        return { name: `${appList[0]} and ${appList[1]}` };
    } else {
        const lastApp = appList.pop();
        return { name: `${appList.join(', ')}, and ${lastApp}` };
    }
}

// Helper function to handle distractions
async function handleDistraction(tab) {
    const currentFocus = getCurrentlyFocusingOn();
    const settings = await chrome.storage.local.get(['proceedTimeoutMinutes']);
    const proceedTimeoutMinutes = settings.proceedTimeoutMinutes || defaultSettings.proceedTimeoutMinutes;

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
            if (chrome.runtime.lastError) {
                console.debug("Script check failed:", chrome.runtime.lastError.message);
            }
        }

        try {
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

            await new Promise(resolve => setTimeout(resolve, 50));
        } catch {
            if (chrome.runtime.lastError) {
                console.debug("Content script injection failed:", chrome.runtime.lastError.message);
            }
        }
    };

    await injectContentScript(tab.id);

    try {
        await chrome.storage.local.get(['distractionsBlocked'], (data) => {
            chrome.storage.local.set({ 
                distractionsBlocked: (data.distractionsBlocked || 0) + 1 
            });
        });
    } catch {
        // Silent fail if counter update fails
    }

    const MAX_RETRIES = 3;
    const RETRY_DELAY = 100;

    for (let i = 0; i < MAX_RETRIES; i++) {
        try {
            await new Promise((resolve, reject) => {
                chrome.tabs.sendMessage(tab.id, {
                    action: "showWarning",
                    focusAppName: currentFocus.name,
                    proceedWaitSeconds: PROCEED_WAIT_SECONDS,
                    proceedTimeoutMinutes: proceedTimeoutMinutes
                }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(chrome.runtime.lastError);
                    } else {
                        resolve(response);
                    }
                });
            });
            break;
        } catch (e) {
            if (i < MAX_RETRIES - 1) {
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
            }
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

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "contentScriptReady" && sender.tab) {
        contentScriptReadyTabs.add(sender.tab.id);
    }
    else if (message.action === "temporarilyDisable" && sender.tab) {
        chrome.storage.local.get(['proceedTimeoutMinutes'], async (data) => {
            const timeoutMinutes = data.proceedTimeoutMinutes || defaultSettings.proceedTimeoutMinutes;
            const disabledUntil = Date.now() + (timeoutMinutes * 60 * 1000);
            
            await chrome.storage.local.set({ temporarilyDisabledUntil: disabledUntil });
            chrome.alarms.create('temporaryDisableExpired', {
                when: disabledUntil
            });
            
            sendResponse({ success: true });
        });
        return true;
    }
    else if (message.action === "closeTab" && sender.tab) {
        chrome.tabs.remove(sender.tab.id);
    }
});

// Add tab removal listener
chrome.tabs.onRemoved.addListener(async (tabId) => {
    contentScriptReadyTabs.delete(tabId);
    if (focusedTabs.has(tabId)) {
        focusedTabs.delete(tabId);
        
        if (focusedTabs.size === 0) {
            await chrome.storage.local.set({ 
                currentFocusApp: null
            });
        } else {
            const currentFocus = getCurrentlyFocusingOn();
            await chrome.storage.local.set({
                currentFocusApp: currentFocus
            });
        }
        
        updateIcon(focusedTabs.size > 0);
    }
});

// Helper function to get next midnight
function getNextMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    return midnight.getTime();
}
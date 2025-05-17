// Default settings - will be customizable later
const defaultSettings = {
    focusApps: [
      { domain: "docs.google.com", name: "Google Docs" },
      { domain: "drive.google.com", name: "Google Drive" },
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
    proceedTimeoutMinutes: 2,
    currentFocusApp: null,
    focusSessions: 0,
    temporarilyDisabledUntil: null,
    distractionsBlocked: 0 // Initialize distractionsBlocked in default settings
};

// Constants
const PROCEED_WAIT_SECONDS = 3;
const FOCUSED_TABS_STORAGE_KEY = 'focusedTabs'; // Key for storage

let focusedTabs = new Map(); // Maps tabId to {url, domain, timestamp, appName}
let contentScriptReadyTabs = new Set(); // Map to track which tabs have content scripts ready

// Function to save focusedTabs to storage
async function saveFocusedTabs() {
    const focusedTabsArray = Array.from(focusedTabs.entries());
    await chrome.storage.local.set({ [FOCUSED_TABS_STORAGE_KEY]: focusedTabsArray });
}

// Function to load focusedTabs from storage and clean up
async function loadAndCleanFocusedTabs() {
    const data = await chrome.storage.local.get([FOCUSED_TABS_STORAGE_KEY]);
    const loadedTabsArray = data[FOCUSED_TABS_STORAGE_KEY] || [];
    focusedTabs = new Map(loadedTabsArray);

    // Clean up entries for tabs that no longer exist
    const tabIds = Array.from(focusedTabs.keys());
    if (tabIds.length > 0) {
        chrome.tabs.query({}, (openTabs) => {
            const openTabIds = new Set(openTabs.map(tab => tab.id));
            let changed = false;
            for (const tabId of tabIds) {
                if (!openTabIds.has(tabId)) {
                    focusedTabs.delete(tabId);
                    changed = true;
                }
            }
            if (changed) {
                saveFocusedTabs(); // Save cleaned state
                updateIcon(focusedTabs.size > 0);
                 // Also update currentFocusApp in storage after cleanup
                const currentFocus = getCurrentlyFocusingOn();
                chrome.storage.local.set({ currentFocusApp: currentFocus });
            } else {
                // If no cleanup was needed, just update icon based on loaded state
                updateIcon(focusedTabs.size > 0);
                 // And update currentFocusApp in storage
                const currentFocus = getCurrentlyFocusingOn();
                 chrome.storage.local.set({ currentFocusApp: currentFocus });
            }
        });
    } else {
        // No tabs loaded, ensure icon and currentFocusApp are correct
        updateIcon(false);
        chrome.storage.local.set({ currentFocusApp: null });
    }
}

// Initialize settings and load state on startup
chrome.runtime.onInstalled.addListener(() => {
    // Initialize with default settings if not already set
    chrome.storage.local.get(Object.keys(defaultSettings), (result) => {
        const settingsToSet = {};
        let changed = false;
        for (const key in defaultSettings) {
            if (result[key] === undefined) {
                settingsToSet[key] = defaultSettings[key];
                changed = true;
            }
        }
        if (changed) {
            chrome.storage.local.set(settingsToSet);
        }
    });

    // Reset counters at midnight - reschedule in case it was missed
    chrome.alarms.clear('resetCounters', (wasCleared) => {
         chrome.alarms.create('resetCounters', {
            when: getNextMidnight(),
            periodInMinutes: 24 * 60 // Run daily
        });
    });

    // Load focused tabs state
    loadAndCleanFocusedTabs();
});

// Also load state when the service worker wakes up if it wasn't an install event
// Use chrome.runtime.onStartup if needed, but onInstalled + query on launch is more common for service workers.
// Let's add a check when the script runs
console.log('[Focus Bubble] Background service worker starting. Loading state...');
loadAndCleanFocusedTabs();

// Handle alarms
chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'resetCounters') {
        await chrome.storage.local.set({
            focusSessions: 0,
            distractionsBlocked: 0
        });
    } else if (alarm.name === 'temporaryDisableExpired') {
        await chrome.storage.local.set({ temporarilyDisabledUntil: null });
        // Recheck current tab when temporary disable expires
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                checkCurrentTab(tabs[0]);
            }
        });
    }
});

// Listen for tab updates
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
        // Delay check slightly to ensure URL is stable
        setTimeout(() => checkCurrentTab(tab), 50);
    }
});

// Listen for tab activation changes
chrome.tabs.onActivated.addListener(({ tabId }) => {
     // Delay check slightly to ensure tab data is available
    setTimeout(() => chrome.tabs.get(tabId, checkCurrentTab), 50);
});

// Function to check if temporary disable has expired
async function isTemporarilyDisabled() {
    const data = await chrome.storage.local.get(['temporarilyDisabledUntil']);
    if (!data.temporarilyDisabledUntil) return false;
    return Date.now() < data.temporarilyDisabledUntil;
}

// Check current tab function
async function checkCurrentTab(tab) {
    if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
         // If the tab is invalid or a chrome internal page, remove it from focusedTabs if present
        if (focusedTabs.has(tab.id)) {
            focusedTabs.delete(tab.id);
            await saveFocusedTabs();
            const currentFocus = getCurrentlyFocusingOn();
            await chrome.storage.local.set({ currentFocusApp: currentFocus });
             updateIcon(focusedTabs.size > 0);
        }
        return; // Do not process invalid/internal tabs further
    }

    const url = new URL(tab.url);
    const domain = url.hostname.replace('www.', '');

    const settings = await chrome.storage.local.get(['focusApps', 'blockedApps', 'currentFocusApp', 'temporarilyDisabledUntil']);
    const focusApps = settings.focusApps || defaultSettings.focusApps;
    const blockedApps = settings.blockedApps || defaultSettings.blockedApps;

    // Check if this is a focus app
    const focusApp = focusApps.find(app => domain.includes(app.domain));

    if (focusApp) {
        // Add/Update in focused tabs
        const tabInfo = {
            url: tab.url,
            domain: domain,
            timestamp: Date.now(),
            appName: focusApp.name
        };
        focusedTabs.set(tab.id, tabInfo);
        await saveFocusedTabs(); // Save state

        // Update current focus app and increment sessions if needed
        const currentFocus = getCurrentlyFocusingOn();
         // Only increment session if this is a *new* focus session (i.e., previously no focus tabs)
        const previousFocusApp = settings.currentFocusApp;
        if (!previousFocusApp || !focusedTabs.has(tab.id)) { // Check if it's a newly added focus tab
             chrome.storage.local.get(['focusSessions'], (data) => {
                 chrome.storage.local.set({
                     focusSessions: (data.focusSessions || 0) + 1,
                     currentFocusApp: currentFocus
                 });
             });
        } else {
             // Just update currentFocusApp if it was already a focus tab
             await chrome.storage.local.set({ currentFocusApp: currentFocus });
        }

        updateIcon(true);
    } else {
        // Remove from focused tabs if it was there
        if (focusedTabs.has(tab.id)) {
            focusedTabs.delete(tab.id);
            await saveFocusedTabs(); // Save state

            // Update icon and current focus app
            const currentFocus = getCurrentlyFocusingOn();
            await chrome.storage.local.set({
                currentFocusApp: currentFocus
            });
            updateIcon(focusedTabs.size > 0);
        }

        // Check if this is a distraction site
        const isDistraction = blockedApps.some(site => domain.includes(site.domain));

        // Show warning if we have focus tabs open and this is a distraction site AND not temporarily disabled
        const isTempDisabled = settings.temporarilyDisabledUntil && Date.now() < settings.temporarilyDisabledUntil;

        if (focusedTabs.size > 0 && isDistraction && !isTempDisabled) {
            handleDistraction(tab);
        }
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
    } else if (appList.length > 2) {
        const lastApp = appList.pop();
        return { name: `${appList.join(', ')}, and ${lastApp}` };
    } else {
        return null; // Should not happen if focusedTabs.size > 0, but for safety
    }
}

// Helper function to handle distractions
async function handleDistraction(tab) {
    const currentFocus = getCurrentlyFocusingOn();
    const settings = await chrome.storage.local.get(['proceedTimeoutMinutes']);
    const proceedTimeoutMinutes = settings.proceedTimeoutMinutes || defaultSettings.proceedTimeoutMinutes;

    // Inject content script and wait for it to be ready
    const injectContentScriptAndAwaitReady = async (tabId) => {
        try {
            // First, check if already injected and ready
            const [result] = await chrome.scripting.executeScript({
                target: { tabId },
                func: () => window._focusBubbleInjected === true && typeof window.showWarningOverlay === 'function',
                world: 'TAB' // Execute in the tab's world to access its window variables
            });
            if (result && result[0]?.result === true) {
                console.debug(`[Focus Bubble] Content script already injected and ready in tab ${tabId}.`);
                return true; // Already ready
            }
        } catch (error) {
             if (chrome.runtime.lastError) {
                console.debug(`[Focus Bubble] Initial script check failed for tab ${tabId}: ${chrome.runtime.lastError.message}`);
            } else {
                 console.debug(`[Focus Bubble] Initial script check failed for tab ${tabId}: ${error}`);
            }
        }

        try {
            // If not ready, inject the content script file
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content.js'],
                world: 'TAB'
            });
            console.debug(`[Focus Bubble] Content script injected into tab ${tabId}.`);

            // Wait for the content script to signal readiness
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    chrome.runtime.onMessage.removeListener(listener); // Clean up listener on timeout
                    reject(new Error("Content script readiness timeout"));
                }, 3000); // 3 second timeout

                const listener = (message, sender) => {
                    if (message.action === "contentScriptReady" && sender.tab && sender.tab.id === tabId) {
                        chrome.runtime.onMessage.removeListener(listener);
                        clearTimeout(timeout);
                        console.debug(`[Focus Bubble] Content script reported ready in tab ${tabId}.`);
                        resolve(true);
                    }
                };
                chrome.runtime.onMessage.addListener(listener);
            });
            return true;

        } catch (error) {
            if (chrome.runtime.lastError) {
                 console.debug(`[Focus Bubble] Content script injection or readiness wait failed for tab ${tabId}: ${chrome.runtime.lastError.message}`);
            } else {
                console.debug(`[Focus Bubble] Content script injection or readiness wait failed for tab ${tabId}: ${error}`);
            }
            return false; // Injection or readiness failed
        }
    };

    // Wait for the content script to be ready in the target tab
    const isReady = await injectContentScriptAndAwaitReady(tab.id);

    if (!isReady) {
        console.error(`[Focus Bubble] Failed to get content script ready in tab ${tab.id}. Cannot show warning.`);
        return; // Abort if content script is not ready
    }

    try {
        // Increment distractionsBlocked counter
        chrome.storage.local.get(['distractionsBlocked'], (data) => {
            chrome.storage.local.set({
                distractionsBlocked: (data.distractionsBlocked || 0) + 1
            });
        });
    } catch {
        // Silent fail if counter update fails
         console.warn("[Focus Bubble] Failed to update distractionsBlocked counter.");
    }

    // Send the showWarning message now that we are sure the content script is ready
    try {
        await new Promise((resolve, reject) => {
            const responseTimeout = setTimeout(() => { // Add a timeout for the response itself
                 reject(new Error("Show warning message response timeout"));
            }, 3000); // 3 second timeout for response

            chrome.tabs.sendMessage(tab.id, {
                action: "showWarning",
                focusAppName: currentFocus.name,
                proceedWaitSeconds: PROCEED_WAIT_SECONDS,
                proceedTimeoutMinutes: proceedTimeoutMinutes
            }, (response) => {
                clearTimeout(responseTimeout);
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                } else {
                    resolve(response);
                }
            });
        });
        console.debug(`[Focus Bubble] Show warning message sent successfully to tab ${tab.id}.`);
    } catch (e) {
        console.error(`[Focus Bubble] Failed to send show warning message to tab ${tab.id}: ${e.message}`);
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
    midnight.setDate(midnight.getDate() + 1); // Move to the next day
    midnight.setHours(0, 0, 0, 0);
    return midnight.getTime();
}
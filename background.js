// Default settings - will be customizable later
const defaultSettings = {
    focusApps: [
        { domain: "docs.google.com", name: "Google Docs" },
        { domain: "drive.google.com", name: "Google Drive" },
        { domain: "trello.com", name: "Trello" },
        { domain: "canva.com", name: "Canva" },
        { domain: "github.com", name: "GitHub" }
    ],
    blockedApps: [
        { domain: "twitter.com", name: "Twitter" },
        { domain: "youtube.com", name: "YouTube" },
        { domain: "facebook.com", name: "Facebook" },
        { domain: "instagram.com", name: "Instagram" },
        { domain: "tiktok.com", name: "TikTok" }
    ],
    proceedTimeoutMinutes: 2,
    currentFocusApp: null,
    focusSessions: 0,
    temporarilyDisabledUntil: null,
    distractionsBlocked: 0
};

const PROCEED_WAIT_SECONDS = 3;
const FOCUSED_TABS_STORAGE_KEY = 'focusedTabs';

let focusedTabs = new Map();
let contentScriptReadyTabs = new Set();

async function saveFocusedTabs() {
    const focusedTabsArray = Array.from(focusedTabs.entries());
    await chrome.storage.local.set({ [FOCUSED_TABS_STORAGE_KEY]: focusedTabsArray });
}

async function loadAndCleanFocusedTabs() {
    const data = await chrome.storage.local.get([FOCUSED_TABS_STORAGE_KEY]);
    const loadedTabsArray = data[FOCUSED_TABS_STORAGE_KEY] || [];
    focusedTabs = new Map(loadedTabsArray);

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
            if (changed) saveFocusedTabs();

            const currentFocus = getCurrentlyFocusingOn();
            chrome.storage.local.set({ currentFocusApp: currentFocus });
            updateIcon(focusedTabs.size > 0);
        });
    } else {
        updateIcon(false);
        chrome.storage.local.set({ currentFocusApp: null });
    }
}

chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(Object.keys(defaultSettings), (result) => {
        const settingsToSet = {};
        for (const key in defaultSettings) {
            if (result[key] === undefined) {
                settingsToSet[key] = defaultSettings[key];
            }
        }
        chrome.storage.local.set(settingsToSet);
    });

    chrome.alarms.create('resetCounters', {
        when: getNextMidnight(),
        periodInMinutes: 24 * 60
    });

    loadAndCleanFocusedTabs();
});

loadAndCleanFocusedTabs();

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'resetCounters') {
        await chrome.storage.local.set({
            focusSessions: 0,
            distractionsBlocked: 0
        });
    } else if (alarm.name === 'temporaryDisableExpired') {
        await chrome.storage.local.set({ temporarilyDisabledUntil: null });
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) checkCurrentTab(tabs[0]);
        });
    }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tab.active) {
        setTimeout(() => checkCurrentTab(tab), 50);
    }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
    setTimeout(() => chrome.tabs.get(tabId, checkCurrentTab), 50);
});

async function checkCurrentTab(tab) {
    if (!tab || !tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
        if (focusedTabs.has(tab.id)) {
            focusedTabs.delete(tab.id);
            await saveFocusedTabs();
            const currentFocus = getCurrentlyFocusingOn();
            await chrome.storage.local.set({ currentFocusApp: currentFocus });
            updateIcon(focusedTabs.size > 0);
        }
        return;
    }

    const url = new URL(tab.url);
    const domain = url.hostname.replace('www.', '');

    const settings = await chrome.storage.local.get(['focusApps', 'blockedApps', 'currentFocusApp', 'temporarilyDisabledUntil']);
    const focusApps = settings.focusApps || defaultSettings.focusApps;
    const blockedApps = settings.blockedApps || defaultSettings.blockedApps;

    const focusApp = focusApps.find(app => domain.includes(app.domain));

    if (focusApp) {
        focusedTabs.set(tab.id, {
            url: tab.url,
            domain: domain,
            timestamp: Date.now(),
            appName: focusApp.name
        });
        await saveFocusedTabs();

        const currentFocus = getCurrentlyFocusingOn();
        const previousFocusApp = settings.currentFocusApp;
        if (!previousFocusApp || !focusedTabs.has(tab.id)) {
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
        if (focusedTabs.has(tab.id)) {
            focusedTabs.delete(tab.id);
            await saveFocusedTabs();
            const currentFocus = getCurrentlyFocusingOn();
            await chrome.storage.local.set({ currentFocusApp: currentFocus });
            updateIcon(focusedTabs.size > 0);
        }

        const isDistraction = blockedApps.some(site => domain.includes(site.domain));
        const isTempDisabled = settings.temporarilyDisabledUntil && Date.now() < settings.temporarilyDisabledUntil;

        if (focusedTabs.size > 0 && isDistraction && !isTempDisabled) {
            handleDistraction(tab);
        }
    }
}

function getCurrentlyFocusingOn() {
    if (focusedTabs.size === 0) return null;
    const apps = new Set([...focusedTabs.values()].map(tab => tab.appName));
    const appList = Array.from(apps);
    if (appList.length === 1) return { name: appList[0] };
    if (appList.length === 2) return { name: `${appList[0]} and ${appList[1]}` };
    const lastApp = appList.pop();
    return { name: `${appList.join(', ')}, and ${lastApp}` };
}

async function handleDistraction(tab) {
    const currentFocus = getCurrentlyFocusingOn();
    const settings = await chrome.storage.local.get(['proceedTimeoutMinutes']);
    const proceedTimeoutMinutes = settings.proceedTimeoutMinutes || defaultSettings.proceedTimeoutMinutes;

    const isReady = await injectContentScriptAndAwaitReady(tab.id);

    if (!isReady) {
        console.error(`[Focus Bubble] Failed to get content script ready in tab ${tab.id}. Cannot show warning.`);
        return;
    }

    chrome.storage.local.get(['distractionsBlocked'], (data) => {
        chrome.storage.local.set({
            distractionsBlocked: (data.distractionsBlocked || 0) + 1
        });
    });

    chrome.tabs.sendMessage(tab.id, {
        action: "showWarning",
        focusAppName: currentFocus.name,
        proceedWaitSeconds: PROCEED_WAIT_SECONDS,
        proceedTimeoutMinutes: proceedTimeoutMinutes
    }, (response) => {
        if (chrome.runtime.lastError) {
            console.warn("[Focus Bubble] Failed to send warning:", chrome.runtime.lastError.message);
        }
    });
}

async function injectContentScriptAndAwaitReady(tabId) {
    try {
        const [res] = await chrome.scripting.executeScript({
            target: { tabId },
            func: () => {
                console.log('[Focus Bubble] Checking injection readiness...');
                return {
                    injected: window._focusBubbleInjected === true,
                    hasOverlay: typeof window.showWarningOverlay === 'function'
                };
            },
            world: 'MAIN'
        });

        const { injected, hasOverlay } = res.result || {};
        console.log(`[Focus Bubble] Check result: injected=${injected}, hasOverlay=${hasOverlay}`);
        if (injected && hasOverlay) return true;
    } catch (err) {
        console.warn(`[Focus Bubble] Script check error: ${err.message}`);
    }

    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content.js']
          });          
        console.log('[Focus Bubble] Script injected.');

        return await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                chrome.runtime.onMessage.removeListener(listener);
                reject(new Error('Timeout waiting for content script'));
            }, 3000);

            const listener = (message, sender) => {
                if (message.action === 'contentScriptReady' && sender.tab && sender.tab.id === tabId) {
                    chrome.runtime.onMessage.removeListener(listener);
                    clearTimeout(timeout);
                    resolve(true);
                }
            };

            chrome.runtime.onMessage.addListener(listener);
        });
    } catch (err) {
        console.error('[Focus Bubble] Injection failed:', err.message);
        return false;
    }
}

function updateIcon(isFocused) {
    const iconPath = isFocused ?
        { path: "icons/icon128.png" } :
        { path: "icons/icon128-inactive.png" };

    chrome.action.setIcon(iconPath);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "contentScriptReady" && sender.tab) {
        contentScriptReadyTabs.add(sender.tab.id);
    } else if (message.action === "temporarilyDisable" && sender.tab) {
        chrome.storage.local.get(['proceedTimeoutMinutes'], async (data) => {
            const timeoutMinutes = data.proceedTimeoutMinutes || defaultSettings.proceedTimeoutMinutes;
            const disabledUntil = Date.now() + (timeoutMinutes * 60 * 1000);
            await chrome.storage.local.set({ temporarilyDisabledUntil: disabledUntil });
            chrome.alarms.create('temporaryDisableExpired', { when: disabledUntil });
            sendResponse({ success: true });
        });
        return true;
    } else if (message.action === "closeTab" && sender.tab) {
        chrome.tabs.remove(sender.tab.id);
    }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
    contentScriptReadyTabs.delete(tabId);
    if (focusedTabs.has(tabId)) {
        focusedTabs.delete(tabId);
        const currentFocus = getCurrentlyFocusingOn();
        await chrome.storage.local.set({ currentFocusApp: currentFocus });
        updateIcon(focusedTabs.size > 0);
    }
});

function getNextMidnight() {
    const now = new Date();
    const midnight = new Date(now);
    midnight.setDate(midnight.getDate() + 1);
    midnight.setHours(0, 0, 0, 0);
    return midnight.getTime();
}
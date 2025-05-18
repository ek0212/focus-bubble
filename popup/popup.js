document.addEventListener('DOMContentLoaded', () => {
  // Main panel elements
  const statusText = document.getElementById('status-text');
  const sessionsCount = document.getElementById('sessions-count');
  const settingsBtn = document.getElementById('settings-btn');
  const temporaryDisableTimer = document.getElementById('temporary-disable-timer');
  const timerValue = document.getElementById('timer-value');

  // Settings panel elements
  const settingsPanel = document.getElementById('settings-panel');
  const backBtn = document.getElementById('back-btn');
  const focusAppsList = document.getElementById('focus-apps-list');
  const newFocusAppDomain = document.getElementById('new-focus-app-domain');
  const addFocusAppBtn = document.getElementById('add-focus-app');
  const blockedAppsList = document.getElementById('blocked-apps-list');
  const newBlockedAppDomain = document.getElementById('new-blocked-app-domain');
  const addBlockedAppBtn = document.getElementById('add-blocked-app');
  const proceedTimeoutMinutes = document.getElementById('proceed-timeout-minutes');

  // Verify required elements exist
  if (!statusText || !sessionsCount || !temporaryDisableTimer || !timerValue) {
    console.error('Required DOM elements not found');
    return;
  }

  // Helper function to extract domain from URL
  function extractDomain(url) {
    try {
      if (!url.includes('://')) {
        url = 'https://' + url;
      }
      const domain = new URL(url).hostname.replace('www.', '');
      return domain;
    } catch (e) {
      return url.replace('www.', '');
    }
  }

  // Helper function to format domain for display
  function formatDomainName(domain) {
    return domain
      .split('.')
      .map(part => part.charAt(0).toLowerCase() + part.slice(1))
      .join('.');
  }

  // Helper function to format time remaining
  function formatTimeRemaining(seconds) {
    if (seconds < 60) {
      return seconds + 's';
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0 ? 
      `${minutes}m ${remainingSeconds}s` : 
      `${minutes}m`;
  }

  // Update status display
  function updateStatusDisplay(isActive, appName = '') {
    if (isActive) {
      statusText.parentElement.classList.add('active');
      statusText.textContent = `Focused on: ${appName}`;
    } else {
      statusText.parentElement.classList.remove('active');
      statusText.textContent = 'Not in focus mode';
    }
  }

  // Load current state and settings
  function loadSettings() {
    chrome.storage.local.get([
      'currentFocusApp', 
      'focusSessions',
      'focusApps', 
      'blockedApps',
      'proceedTimeoutMinutes',
      'temporarilyDisabledUntil'
    ], (data) => {
      // Update status display with current app if available
      if (data.currentFocusApp && data.currentFocusApp.name) {
        updateStatusDisplay(true, data.currentFocusApp.name);
      } else {
        updateStatusDisplay(false);
      }

      // Check temporary disable timer
      if (data.temporarilyDisabledUntil) {
        const remainingTime = Math.max(0, Math.ceil((data.temporarilyDisabledUntil - Date.now()) / 1000));
        if (remainingTime > 0) {
          showTemporaryDisableTimer(remainingTime);
        } else {
          hideTemporaryDisableTimer();
        }
      } else {
        hideTemporaryDisableTimer();
      }
      
      // Update stats
      sessionsCount.textContent = data.focusSessions || 0;
      
      // Update lists if elements exist
      if (focusAppsList) {
        updateList(focusAppsList, data.focusApps || [], 'focusApps');
      }
      if (blockedAppsList) {
        updateList(blockedAppsList, data.blockedApps || [], 'blockedApps');
      }
      
      // Update settings if element exists
      if (proceedTimeoutMinutes) {
        proceedTimeoutMinutes.value = data.proceedTimeoutMinutes || 5;
      }
    });
  }

  function showTemporaryDisableTimer(seconds) {
    temporaryDisableTimer.classList.remove('hidden');
    timerValue.textContent = formatTimeRemaining(seconds);
    
    if (window.timerInterval) {
      clearInterval(window.timerInterval);
    }
    
    if (seconds > 0) {
      window.timerInterval = setInterval(() => {
        seconds--;
        if (seconds <= 0) {
          hideTemporaryDisableTimer();
        } else {
          timerValue.textContent = formatTimeRemaining(seconds);
        }
      }, 1000);
    }
  }

  function hideTemporaryDisableTimer() {
    temporaryDisableTimer.classList.add('hidden');
    if (window.timerInterval) {
      clearInterval(window.timerInterval);
      window.timerInterval = null;
    }
  }

  // Update a dynamic list
  function updateList(listElement, items, listType) {
    if (!listElement) return;
    
    listElement.innerHTML = '';
    items.forEach(item => {
      const listItem = document.createElement('div');
      listItem.className = 'list-item';
      
      const textDiv = document.createElement('div');
      textDiv.className = 'list-item-text';
      textDiv.innerHTML = `${item.name} (${item.domain})`;

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.onclick = () => removeItem(item.domain, listType);

      listItem.appendChild(textDiv);
      listItem.appendChild(removeBtn);
      listElement.appendChild(listItem);
    });
  }

  // Add new item to a list
  function addItem(url, listType) {
    const domain = extractDomain(url);
    if (!domain) {
      alert('Please enter a valid domain');
      return;
    }

    chrome.storage.local.get(['focusApps', 'blockedApps'], (data) => {
      const focusApps = data.focusApps || [];
      const blockedApps = data.blockedApps || [];

      // Check if domain is already in either list
      if (focusApps.some(item => item.domain === domain)) {
        alert('This app is already in your focus apps list');
        return;
      }
      if (blockedApps.some(item => item.domain === domain)) {
        alert('This app is already in your blocked apps list');
        return;
      }

      const newItem = { 
        domain: domain,
        name: formatDomainName(domain)
      };

      if (listType === 'focusApps' && newFocusAppDomain) {
        focusApps.push(newItem);
        chrome.storage.local.set({ focusApps }, () => {
          loadSettings();
          newFocusAppDomain.value = '';
        });
      } else if (listType === 'blockedApps' && newBlockedAppDomain) {
        blockedApps.push(newItem);
        chrome.storage.local.set({ blockedApps }, () => {
          loadSettings();
          newBlockedAppDomain.value = '';
        });
      }
    });
  }

  // Remove item from a list
  function removeItem(domain, listType) {
    chrome.storage.local.get(['focusApps', 'blockedApps'], (data) => {
      if (listType === 'focusApps') {
        const items = data.focusApps || [];
        const updatedItems = items.filter(item => item.domain !== domain);
        chrome.storage.local.set({ focusApps: updatedItems }, loadSettings);
      } else if (listType === 'blockedApps') {
        const items = data.blockedApps || [];
        const updatedItems = items.filter(item => item.domain !== domain);
        chrome.storage.local.set({ blockedApps: updatedItems }, loadSettings);
      }
    });
  }

  // Handle adding items
  function handleAddItem(input, listType) {
    if (!input) return;
    const domain = input.value.trim();
    if (domain) {
      addItem(domain, listType);
    }
  }

  // Add event listeners only if elements exist
  if (settingsBtn && settingsPanel) {
    settingsBtn.addEventListener('click', () => {
      settingsPanel.classList.remove('hidden');
    });
  }

  if (backBtn && settingsPanel) {
    backBtn.addEventListener('click', () => {
      settingsPanel.classList.add('hidden');
    });
  }

  // Add focus app event listeners
  if (addFocusAppBtn && newFocusAppDomain) {
    addFocusAppBtn.addEventListener('click', () => {
      handleAddItem(newFocusAppDomain, 'focusApps');
    });

    newFocusAppDomain.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleAddItem(newFocusAppDomain, 'focusApps');
      }
    });
  }

  // Add blocked app event listeners
  if (addBlockedAppBtn && newBlockedAppDomain) {
    addBlockedAppBtn.addEventListener('click', () => {
      handleAddItem(newBlockedAppDomain, 'blockedApps');
    });

    newBlockedAppDomain.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleAddItem(newBlockedAppDomain, 'blockedApps');
      }
    });
  }

  // Update proceed timeout minutes
  if (proceedTimeoutMinutes) {
    proceedTimeoutMinutes.addEventListener('change', () => {
      const value = Math.min(60, Math.max(1, parseInt(proceedTimeoutMinutes.value, 10) || 5));
      proceedTimeoutMinutes.value = value;
      chrome.storage.local.set({ proceedTimeoutMinutes: value });
    });
  }

  // Initial load
  loadSettings();

  // Listen for changes
  chrome.storage.onChanged.addListener((changes) => {
    loadSettings();
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'resetCounters') {
        chrome.storage.local.set({
            focusSessions: 0,
            distractionsBlocked: 0
        });
    } else if (alarm.name === 'temporaryDisableExpired') {
        chrome.storage.local.set({ temporarilyDisabledUntil: null });
    }
  });
});

document.addEventListener('DOMContentLoaded', () => {
  // Main panel elements
  const statusCircle = document.querySelector('.status');
  const statusText = document.getElementById('status-text');
  const focusToggle = document.getElementById('focus-toggle');
  const currentAppText = document.getElementById('currently-focusing-on');
  const sessionsCount = document.getElementById('sessions-count');
  const settingsBtn = document.getElementById('settings-btn');

  // Settings panel elements
  const settingsPanel = document.getElementById('settings-panel');
  const backBtn = document.getElementById('back-btn');
  const focusAppsList = document.getElementById('focus-apps-list');
  const newFocusAppDomain = document.getElementById('new-focus-app-domain');
  const addFocusAppBtn = document.getElementById('add-focus-app');
  const blockedAppsList = document.getElementById('blocked-apps-list');
  const newBlockedAppDomain = document.getElementById('new-blocked-app-domain');
  const addBlockedAppBtn = document.getElementById('add-blocked-app');
  const delaySeconds = document.getElementById('delay-seconds');

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

  // Load current state and settings
  function loadSettings() {
    chrome.storage.local.get([
      'isInFocusMode', 
      'currentFocusApp', 
      'focusSessions',
      'focusApps', 
      'blockedApps', 
      'delaySeconds'
    ], (data) => {
      // Set toggle state based on manual focus mode setting
      focusToggle.checked = data.isInFocusMode;
      updateStatusDisplay(data.isInFocusMode);
      
      // Update current app display if there is one
      if (data.currentFocusApp) {
        currentAppText.textContent = data.currentFocusApp.name;
      } else {
        currentAppText.textContent = data.isInFocusMode ? 'Focus Mode Active' : 'No app selected';
      }
      
      // Update stats
      sessionsCount.textContent = data.focusSessions || 0;

      // Update lists
      updateList(focusAppsList, data.focusApps || [], 'focusApps');
      updateList(blockedAppsList, data.blockedApps || [], 'blockedApps');

      // Update delay seconds
      delaySeconds.value = data.delaySeconds || 3;
    });
  }

  // Update a dynamic list
  function updateList(listElement, items, listType) {
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

      if (listType === 'focusApps') {
        focusApps.push(newItem);
        chrome.storage.local.set({ focusApps }, () => {
          loadSettings();
          newFocusAppDomain.value = '';
        });
      } else if (listType === 'blockedApps') {
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
    chrome.storage.local.get(['focusApps', 'blockedApps', 'currentFocusApp'], (data) => {
      if (listType === 'focusApps') {
        const items = data.focusApps || [];
        // Check if removing currently focused app
        if (data.currentFocusApp && data.currentFocusApp.domain === domain) {
          if (!confirm('This app is currently in focus. Removing it will end your focus session. Continue?')) {
            return;
          }
          // End focus session
          chrome.runtime.sendMessage({ action: "toggleFocusMode" });
        }
        const updatedItems = items.filter(item => item.domain !== domain);
        chrome.storage.local.set({ focusApps: updatedItems }, loadSettings);
      } else if (listType === 'blockedApps') {
        const items = data.blockedApps || [];
        const updatedItems = items.filter(item => item.domain !== domain);
        chrome.storage.local.set({ blockedApps: updatedItems }, loadSettings);
      }
    });
  }

  // Settings panel navigation
  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden');
  });

  backBtn.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
  });

  // Add new focus app
  addFocusAppBtn.addEventListener('click', () => {
    handleAddItem(newFocusAppDomain, 'focusApps');
  });

  newFocusAppDomain.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleAddItem(newFocusAppDomain, 'focusApps');
    }
  });

  // Add new blocked app
  addBlockedAppBtn.addEventListener('click', () => {
    handleAddItem(newBlockedAppDomain, 'blockedApps');
  });

  newBlockedAppDomain.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleAddItem(newBlockedAppDomain, 'blockedApps');
    }
  });

  // Handle adding items
  function handleAddItem(input, listType) {
    const domain = input.value.trim();
    if (domain) {
      addItem(domain, listType);
    }
  }

  // Update delay seconds
  delaySeconds.addEventListener('change', () => {
    const value = parseInt(delaySeconds.value, 10);
    if (!isNaN(value) && value >= 0 && value <= 60) {
      chrome.storage.local.set({ delaySeconds: value });
    }
  });

  // Toggle focus mode
  focusToggle.addEventListener('change', () => {
    chrome.runtime.sendMessage(
      { action: "toggleFocusMode" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.debug("Error sending message:", chrome.runtime.lastError.message);
          return;
        }
        if (response && response.success) {
          updateStatusDisplay(response.isInFocusMode);
        }
      }
    );
  });

  // Listen for updates from background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "focusStateChanged") {
      updateStatusDisplay(message.isInFocusMode);
      if (!message.isInFocusMode) {
        currentAppText.textContent = 'No app selected';
      }
      refreshStats();
    } else if (message.action === "statsUpdated") {
      refreshStats();
    }
  });

  // Function to refresh stats display
  function refreshStats() {
    chrome.storage.local.get(['focusSessions'], (data) => {
      sessionsCount.textContent = data.focusSessions || 0;
    });
  }

  // Helper function to update status display
  function updateStatusDisplay(isActive) {
    if (isActive) {
      statusCircle.classList.remove('inactive');
      statusCircle.classList.add('active');
      statusText.textContent = 'Focus: ON';
      focusToggle.checked = true;
      currentAppText.textContent = getCurrentAppText();
    } else {
      statusCircle.classList.remove('active');
      statusCircle.classList.add('inactive');
      statusText.textContent = 'Focus: OFF';
      focusToggle.checked = false;
      currentAppText.textContent = 'No app selected';
    }
  }

  // Helper function to get current app text
  function getCurrentAppText() {
    chrome.storage.local.get(['currentFocusApp'], (data) => {
        if (data.currentFocusApp) {
            return data.currentFocusApp.name;
        }
        return 'Focus Mode Active';
    });
  }

  // Initial load
  loadSettings();
});

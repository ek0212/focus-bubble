document.addEventListener('DOMContentLoaded', () => {
  // Main panel elements
  const statusCircle = document.getElementById('status-circle');
  const statusText = document.getElementById('status-text');
  const focusToggle = document.getElementById('focus-toggle');
  const currentAppText = document.getElementById('currently-focusing-on');
  const sessionsCount = document.getElementById('sessions-count');
  const blocksCount = document.getElementById('blocks-count');
  const settingsBtn = document.getElementById('settings-btn');

  // Settings panel elements
  const settingsPanel = document.getElementById('settings-panel');
  const backBtn = document.getElementById('back-btn');
  const focusAppsList = document.getElementById('focus-apps-list');
  const distractingSitesList = document.getElementById('distracting-sites-list');
  const newFocusAppDomain = document.getElementById('new-focus-app-domain');
  const newDistractionDomain = document.getElementById('new-distraction-domain');
  const addFocusAppBtn = document.getElementById('add-focus-app');
  const addDistractionBtn = document.getElementById('add-distraction');
  const delaySeconds = document.getElementById('delay-seconds');

  // Helper function to extract domain from URL
  function extractDomain(url) {
    try {
      // Add protocol if missing
      if (!url.includes('://')) {
        url = 'https://' + url;
      }
      const domain = new URL(url).hostname.replace('www.', '');
      return domain;
    } catch (e) {
      return url.replace('www.', ''); // Return cleaned input if URL parsing fails
    }
  }

  // Helper function to format domain for display
  function formatDomainName(domain) {
    return domain
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('.');
  }

  // Load current state and settings
  function loadSettings() {
    chrome.storage.local.get(['isInFocusMode', 'currentFocusApp', 'focusSessions', 'distractionsBlocked', 
                             'focusApps', 'distractingSites', 'delaySeconds'], (data) => {
      // Set toggle state
      focusToggle.checked = data.isInFocusMode;
      updateStatusDisplay(data.isInFocusMode);
      
      // Update current app display
      if (data.isInFocusMode && data.currentFocusApp) {
        currentAppText.textContent = `Currently focused on: ${data.currentFocusApp.name}`;
      } else {
        currentAppText.textContent = 'Not currently in a focus app';
      }
      
      // Update stats
      sessionsCount.textContent = data.focusSessions || 0;
      blocksCount.textContent = data.distractionsBlocked || 0;

      // Update lists
      updateList(focusAppsList, data.focusApps || [], 'focus');
      updateList(distractingSitesList, data.distractingSites || [], 'distraction');

      // Update delay seconds
      delaySeconds.value = data.delaySeconds || 5;
    });
  }

  // Update a dynamic list
  function updateList(listElement, items, type) {
    listElement.innerHTML = '';
    items.forEach(item => {
      const listItem = document.createElement('div');
      listItem.className = 'list-item';
      
      const textDiv = document.createElement('div');
      textDiv.className = 'list-item-text';
      textDiv.innerHTML = formatDomainName(item.domain);

      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = 'Remove';
      removeBtn.onclick = () => removeItem(item.domain, type);

      listItem.appendChild(textDiv);
      listItem.appendChild(removeBtn);
      listElement.appendChild(listItem);
    });
  }

  // Add new item to a list
  function addItem(url, type) {
    const domain = extractDomain(url);
    if (!domain) return;

    const storageKey = type === 'focus' ? 'focusApps' : 'distractingSites';
    
    chrome.storage.local.get([storageKey], (data) => {
      const items = data[storageKey] || [];
      if (!items.some(item => item.domain === domain)) {
        items.push({ 
          domain: domain,
          name: formatDomainName(domain)
        });
        chrome.storage.local.set({ [storageKey]: items }, () => {
          loadSettings();
          // Clear input field
          if (type === 'focus') {
            newFocusAppDomain.value = '';
          } else {
            newDistractionDomain.value = '';
          }
        });
      }
    });
  }

  // Remove item from a list
  function removeItem(domain, type) {
    const storageKey = type === 'focus' ? 'focusApps' : 'distractingSites';
    
    chrome.storage.local.get([storageKey], (data) => {
      const items = data[storageKey] || [];
      const updatedItems = items.filter(item => item.domain !== domain);
      chrome.storage.local.set({ [storageKey]: updatedItems }, loadSettings);
    });
  }

  // Settings panel navigation
  settingsBtn.addEventListener('click', () => {
    settingsPanel.classList.remove('hidden');
  });

  backBtn.addEventListener('click', () => {
    settingsPanel.classList.add('hidden');
  });

  // Add new items (with Enter key support)
  function handleAddItem(input, type) {
    const domain = input.value.trim();
    if (domain) {
      addItem(domain, type);
    }
  }

  addFocusAppBtn.addEventListener('click', () => {
    handleAddItem(newFocusAppDomain, 'focus');
  });

  addDistractionBtn.addEventListener('click', () => {
    handleAddItem(newDistractionDomain, 'distraction');
  });

  newFocusAppDomain.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleAddItem(newFocusAppDomain, 'focus');
    }
  });

  newDistractionDomain.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleAddItem(newDistractionDomain, 'distraction');
    }
  });

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
        currentAppText.textContent = 'Not currently in a focus app';
      }
      refreshStats();
    } else if (message.action === "statsUpdated") {
      refreshStats();
    }
  });

  // Function to refresh stats display
  function refreshStats() {
    chrome.storage.local.get(['focusSessions', 'distractionsBlocked'], (data) => {
      sessionsCount.textContent = data.focusSessions || 0;
      blocksCount.textContent = data.distractionsBlocked || 0;
    });
  }

  // Helper function to update status display
  function updateStatusDisplay(isActive) {
    if (isActive) {
      statusCircle.classList.remove('inactive');
      statusCircle.classList.add('active');
      statusText.textContent = 'Focus Mode: ON';
    } else {
      statusCircle.classList.remove('active');
      statusCircle.classList.add('inactive');
      statusText.textContent = 'Focus Mode: OFF';
    }
  }

  // Initial load
  loadSettings();
});

document.addEventListener('DOMContentLoaded', () => {
  const statusCircle = document.getElementById('status-circle');
  const statusText = document.getElementById('status-text');
  const focusToggle = document.getElementById('focus-toggle');
  const currentAppText = document.getElementById('current-app-text');
  const sessionsCount = document.getElementById('sessions-count');
  const blocksCount = document.getElementById('blocks-count');
  const settingsBtn = document.getElementById('settings-btn');

  // Load current state
  chrome.storage.local.get(['isInFocusMode', 'currentFocusApp', 'focusSessions', 'distractionsBlocked'], (data) => {
    // Set toggle state
    focusToggle.checked = data.isInFocusMode;
    
    // Update status display
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
  });

  // Toggle focus mode
  focusToggle.addEventListener('change', () => {
    const isEnabled = focusToggle.checked;
    
    chrome.runtime.sendMessage(
      { action: "toggleFocusMode" },
      (response) => {
        if (response && response.success) {
          updateStatusDisplay(response.isInFocusMode);
        }
      }
    );
  });

  // Settings button (just a placeholder for now)
  settingsBtn.addEventListener('click', () => {
    // In the future, this will open a settings page
    alert('Settings functionality will be added in a future update!');
  });

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
});

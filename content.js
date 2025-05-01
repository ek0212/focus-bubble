// Content script handles the warning overlay functionality
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "showWarning") {
    showWarningOverlay(message.focusAppName, message.delaySeconds);
    sendResponse({ success: true });
  }
});

// Function to show the warning overlay
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
    background-color: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(5px);
    color: white;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 2147483647;
    font-family: 'Arial', sans-serif;
    opacity: 0;
    transition: opacity 0.3s ease;
  `;

  // Create message container
  const messageBox = document.createElement('div');
  messageBox.style.cssText = `
    background-color: rgba(44, 62, 80, 0.95);
    padding: 40px;
    border-radius: 10px;
    text-align: center;
    max-width: 500px;
    box-shadow: 0 10px 20px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transform: translateY(20px);
    transition: transform 0.3s ease;
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
    transition: all 0.3s ease;
    margin-right: 10px;
  `;
  stayButton.onmouseover = () => { stayButton.style.backgroundColor = '#27ae60'; };
  stayButton.onmouseout = () => { stayButton.style.backgroundColor = '#2ecc71'; };
  stayButton.onclick = () => {
    overlay.style.opacity = '0';
    messageBox.style.transform = 'translateY(20px)';
    setTimeout(() => {
      window.history.back();
      overlay.remove();
    }, 300);
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
    transition: all 0.3s ease;
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
      overlay.style.opacity = '0';
      messageBox.style.transform = 'translateY(20px)';
      setTimeout(() => overlay.remove(), 300);
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

  // Trigger entrance animation
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    messageBox.style.transform = 'translateY(0)';
  });
}

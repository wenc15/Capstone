// popup.js for Growin extension

document.addEventListener('DOMContentLoaded', () => {
  const statusDiv = document.getElementById('status');
  const currentPageDiv = document.getElementById('currentPage');
  const connectBtn = document.getElementById('connectBtn');

  // Ask background for current Growin status
  function updateGrowinStatus() {
    chrome.runtime.sendMessage({ type: 'GET_GROWIN_STATUS' }, (response) => {
      // In case the service worker was reloaded / no response
      if (chrome.runtime.lastError) {
        console.warn('[Growin] popup: no response from background:', chrome.runtime.lastError.message);
        statusDiv.innerHTML = '<span class="disconnected">⚠️ Background not responding</span>';
        return;
      }

      if (response) {
        displayGrowinStatus(response);
      }
    });
  }

  // Connect / reconnect button
  connectBtn.addEventListener('click', () => {
    console.log('[Growin] popup: Connect button clicked');
    chrome.runtime.sendMessage({ type: 'GROWIN_CONNECT' }, (response) => {
      console.log('[Growin] popup: connect response:', response);
      // Give background a moment to reconnect, then refresh the UI
      setTimeout(updateGrowinStatus, 1000);
    });
  });

  function displayGrowinStatus(status) {
    // Connection state
    if (status.isConnected) {
      statusDiv.innerHTML = '<span class="connected">✅ Connected to Growin backend</span>';
      connectBtn.textContent = 'Reconnect';
      connectBtn.className = 'reconnect';
    } else {
      statusDiv.innerHTML = '<span class="disconnected">❌ Not connected to Growin backend</span>';
      connectBtn.textContent = 'Connect server';
      connectBtn.className = 'primary';
    }

    // Current active page info
    if (status.activePage && status.activePage.url) {
      const duration = status.activePage.duration || 0;

      currentPageDiv.innerHTML = `
        <p><strong>Current page:</strong></p>
        <p>📄 ${status.activePage.title || 'No title'}</p>
        <p>🌐 ${status.activePage.domain}</p>
        <p>⏱️ ${duration}s</p>
      `;
    } else {
      currentPageDiv.innerHTML = '<p>No active page tracked yet</p>';
    }
  }

  // Initial fetch
  updateGrowinStatus();

  // Periodically refresh UI every 2 seconds
  setInterval(updateGrowinStatus, 2000);
});

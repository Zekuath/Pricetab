// CRITICAL: This script runs FIRST to prevent white flash
// Sets body background based on saved theme preference
(function() {
  const savedTheme = localStorage.getItem('crypto_chart_theme') || 'auto';
  let activeTheme = savedTheme;

  // If auto, detect system preference
  if (savedTheme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    activeTheme = prefersDark ? 'dark' : 'light';
  }

  // Set body background immediately
  if (activeTheme === 'dark') {
    document.body.style.backgroundColor = '#000000';
    document.body.style.color = '#ffffff';
  } else {
    document.body.style.backgroundColor = '#ffffff';
    document.body.style.color = '#1a1a1a';
  }
})();

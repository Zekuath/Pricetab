// CRITICAL: This script runs FIRST to prevent white flash
// Sets body background based on saved theme preference
(function() {
  /* Text size first, and before anything measures itself. The whole interface
   * is sized in rem off this, so setting it after React has laid out means the
   * page renders at one size and jumps to another. Read straight out of
   * localStorage rather than through storage.js, which has not loaded yet —
   * the values are the ones in TEXT_SIZE_OPTIONS, and an unknown one falls
   * through to the browser's own default, which is what Default means. */
  const sizes = { xsmall: 13, small: 15, default: 16, large: 18, xlarge: 20 };
  const savedSize = localStorage.getItem('crypto_chart_text_size');
  if (savedSize && sizes[savedSize]) {
    document.documentElement.style.fontSize = sizes[savedSize] + 'px';
  }

  /* How a phone gets around (PHONE_NAV_KEY, config.js): without the tab bar
   * the page reaches the glass, and the rules that leave room for the bar
   * read this attribute — set here so the first frame is not laid out twice. */
  if (localStorage.getItem('crypto_chart_phone_nav') === 'swipe') {
    document.documentElement.setAttribute('data-phone-nav', 'swipe');
  }

  const savedTheme = localStorage.getItem('crypto_chart_theme') || 'auto';
  let activeTheme = savedTheme;

  // If auto, detect system preference
  if (savedTheme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    activeTheme = prefersDark ? 'dark' : 'light';
  }

  /* The home-screen app's status bar: see-through with white type over the
   * dark theme, the system's own (dark type, the page below it) over the
   * light one — white type on a white page was a clock nobody could read.
   * Read by iOS as the page loads, which is why it is set here, first. */
  const bar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (bar) bar.setAttribute('content', activeTheme === 'dark' ? 'black-translucent' : 'default');

  // Set body background immediately
  if (activeTheme === 'dark') {
    document.body.style.backgroundColor = '#000000';
    document.body.style.color = '#ffffff';
  } else {
    document.body.style.backgroundColor = '#ffffff';
    document.body.style.color = '#1a1a1a';
  }
})();

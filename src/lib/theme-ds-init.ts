/**
 * Inline script injected into <head> to prevent theme flash.
 * Must be a string — injected via dangerouslySetInnerHTML.
 */
export const THEME_INIT_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem('faraudit-ds-theme');
    if (stored && stored !== 'system') {
      document.documentElement.setAttribute('data-theme', stored);
    }
  } catch(e) {}
})();
`

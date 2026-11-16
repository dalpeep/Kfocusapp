for (const link of document.querySelectorAll('[data-page-back]')) {
  link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (window.navigation?.canGoBack ?? (window.history.length > 1)) {
      event.preventDefault();
      window.history.back();
    }
  });
}

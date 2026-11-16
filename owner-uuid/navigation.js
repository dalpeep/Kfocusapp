document.getElementById('owner-go-back').addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const canGoBack = window.navigation?.canGoBack ?? (window.history.length > 1);
  if (canGoBack) {
    event.preventDefault();
    window.history.back();
  }
});

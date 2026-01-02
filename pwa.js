/* pwa.js
   - service worker register
   - install banner:
       - Android/Chrome: beforeinstallprompt => riktig install-knapp
       - iOS: visa instruktioner “Lägg till på hemskärmen”
*/

(function () {
  // SW
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  const banner = document.getElementById("installBanner");
  const installBtn = document.getElementById("installBtn");
  const dismissBtn = document.getElementById("dismissInstallBtn");

  const iosModal = document.getElementById("iosInstallModal");
  const closeIosModal = document.getElementById("closeIosModal");
  const hint = document.getElementById("installBannerHint");

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }
  function isInStandaloneMode() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  }

  let deferredPrompt = null;

  function showBanner(textHint) {
    if (isInStandaloneMode()) return;
    if (localStorage.getItem("installBannerDismissed") === "1") return;
    if (textHint) hint.textContent = textHint;
    banner.classList.add("visible");
  }

  function hideBanner() {
    banner.classList.remove("visible");
  }

  dismissBtn.addEventListener("click", () => {
    localStorage.setItem("installBannerDismissed", "1");
    hideBanner();
  });

  closeIosModal.addEventListener("click", () => {
    iosModal.classList.remove("visible");
  });
  iosModal.addEventListener("click", (e) => {
    if (e.target === iosModal) iosModal.classList.remove("visible");
  });

  // Android/Chrome install prompt
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    showBanner("Installera för att köra som app.");
  });

  // iOS: visa instruktioner istället
  // (Safari har typiskt inte beforeinstallprompt)
  if (isIos() && !isInStandaloneMode()) {
    showBanner("På iPhone: Lägg till på hemskärmen via Dela-menyn.");
  }

  installBtn.addEventListener("click", async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice.catch(() => {});
      deferredPrompt = null;
      hideBanner();
      return;
    }
    if (isIos()) {
      iosModal.classList.add("visible");
      return;
    }
    alert("Installera stöds inte här. Prova i Chrome/Edge eller använd ‘Lägg till på hemskärmen’ om det finns.");
  });
})();


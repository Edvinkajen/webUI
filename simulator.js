/* simulator.js
   - Genererar mätningar typ var 1.5s
   - Du kan tweaka profilerna så att det ser realistiskt ut.
*/
window.ESPSim = (() => {
  let timer = null;

  function start({ getActiveUserId, onMeasurement }) {
    stop();

    let t = 0;
    timer = setInterval(() => {
      t += 1;

      const uid = getActiveUserId?.() || "user-default";
      // “realistisk-ish”: baslinje + små variationer + ibland en peak
      const base = 0.02 + 0.02 * Math.sin(t / 6);
      const noise = (Math.random() - 0.5) * 0.03;
      const peak = (Math.random() < 0.08) ? (0.2 + Math.random() * 0.6) : 0;
      const value = Math.max(0, base + noise + peak);

      onMeasurement?.({
        userId: uid,
        value,
        timestamp: new Date()
      });
    }, 1500);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop };
})();


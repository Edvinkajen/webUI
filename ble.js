
/* ble.js
   - Minimal BLE-bridge: connect -> startNotifications -> parse payload
   - Förväntar att device skickar antingen:
       A) ASCII: "0.123" eller JSON: {"value":0.123,"userId":"..."}
       B) little-endian float32 (om du vill, finns stöd här också)
*/

window.BLEBridge = (() => {
  let device = null;
  let server = null;
  let characteristic = null;

  function parseValue(dataView) {
    // 1) försök som text
    try {
      const text = new TextDecoder("utf-8").decode(dataView.buffer);
      const trimmed = text.trim();
      if (!trimmed) return null;

      // JSON?
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        const obj = JSON.parse(trimmed);
        if (typeof obj.value === "number") return obj;
      }

      // float i text?
      const num = Number(trimmed.replace(",", "."));
      if (!Number.isNaN(num)) return { value: num };

    } catch {}

    // 2) fallback: float32 little-endian i första 4 bytes
    if (dataView.byteLength >= 4) {
      const v = dataView.getFloat32(0, true);
      if (!Number.isNaN(v)) return { value: v };
    }

    return null;
  }

  async function connect(opts, onMeasurement, onStatus) {
    const { serviceUuid, characteristicUuid, namePrefix } = opts;

    if (!navigator.bluetooth) {
      throw new Error("Web Bluetooth stöds ej i denna webbläsare.");
    }
    if (!serviceUuid || !characteristicUuid) {
      throw new Error("Fyll i serviceUuid + characteristicUuid.");
    }

    onStatus?.("väljer enhet…");

    device = await navigator.bluetooth.requestDevice({
      filters: [{ namePrefix: namePrefix || "ALKO" }],
      optionalServices: [serviceUuid]
    });

    device.addEventListener("gattserverdisconnected", () => {
      onStatus?.("frånkopplad");
    });

    onStatus?.("kopplar upp…");
    server = await device.gatt.connect();

    const service = await server.getPrimaryService(serviceUuid);
    characteristic = await service.getCharacteristic(characteristicUuid);

    onStatus?.("startar notifications…");
    await characteristic.startNotifications();

    characteristic.addEventListener("characteristicvaluechanged", (ev) => {
      const dv = ev.target.value; // DataView
      const parsed = parseValue(dv);
      if (parsed && typeof parsed.value === "number") {
        onMeasurement?.({
          value: parsed.value,
          userId: parsed.userId,
          timestamp: parsed.timestamp
        });
      }
    });

    onStatus?.("klar");
  }

  function disconnect() {
    try { device?.gatt?.disconnect?.(); } catch {}
    device = null; server = null; characteristic = null;
  }

  return { connect, disconnect };
})();

/* =========================================================
   MIDI CORE - Supporto BLE MIDI (SK-7) + Web MIDI API
   ========================================================= */

const BLE_MIDI_SERVICE = "03b80e5a-ede8-4b33-a751-6ce34ec4c700";
const BLE_MIDI_CHARACTERISTIC = "7772e5db-3868-4112-a1a9-f2669d106bf3";

// Connessioni BLE SK-7
let outDevice = null, outServer = null, outCharacteristic = null;
let inDevice = null, inServer = null, inCharacteristic = null;

// Stato degli effetti (CC)
const fxState = {
  110: false, 111: false, 112: false, 113: false,
  114: false, 116: false, 117: false, 118: false
};

// Logger personalizzabile
function log(msg) {
  const box = document.getElementById("log");
  const time = new Date().toLocaleTimeString();
  if (box) {
    box.textContent += `[${time}] ${msg}\n`;
    box.scrollTop = box.scrollHeight;
  }
  console.log(`[MIDI Log] ${msg}`);
}

/* =========================================================
   CONNESSIONI SK-7 (BLE)
   ========================================================= */

async function connectOutputSK7(onSuccess) {
  try {
    log("Ricerca SK-7 OUT...");
    outDevice = await navigator.bluetooth.requestDevice({
      filters: [{ services: [BLE_MIDI_SERVICE] }],
      optionalServices: [BLE_MIDI_SERVICE]
    });

    log("SK-7 OUT trovato: " + (outDevice.name || "dispositivo"));
    outServer = await outDevice.gatt.connect();
    const service = await outServer.getPrimaryService(BLE_MIDI_SERVICE);
    outCharacteristic = await service.getCharacteristic(BLE_MIDI_CHARACTERISTIC);

    log("SK-7 OUT connesso.");
    if (onSuccess) onSuccess(outDevice.name || "SK-7");

    outDevice.addEventListener("gattserverdisconnected", () => {
      outCharacteristic = null;
      log("SK-7 OUT disconnesso.");
      if (onSuccess) onSuccess(null);
    });
  } catch (error) {
    console.error(error);
    log("ERRORE SK-7 OUT: " + error.message);
  }
}

async function connectInputSK7(onSuccess) {
  try {
    log("Ricerca SK-7 IN...");
    inDevice = await navigator.bluetooth.requestDevice({
      filters: [{ services: [BLE_MIDI_SERVICE] }],
      optionalServices: [BLE_MIDI_SERVICE]
    });

    log("SK-7 IN trovato: " + (inDevice.name || "dispositivo"));
    inServer = await inDevice.gatt.connect();
    const service = await inServer.getPrimaryService(BLE_MIDI_SERVICE);
    inCharacteristic = await service.getCharacteristic(BLE_MIDI_CHARACTERISTIC);

    await inCharacteristic.startNotifications();
    inCharacteristic.addEventListener("characteristicvaluechanged", onBLEMidiMessage);

    log("SK-7 IN connesso e in ascolto.");
    if (onSuccess) onSuccess(inDevice.name || "SK-7");

    inDevice.addEventListener("gattserverdisconnected", () => {
      inCharacteristic = null;
      log("SK-7 IN disconnesso.");
      if (onSuccess) onSuccess(null);
    });
  } catch (error) {
    console.error(error);
    log("ERRORE SK-7 IN: " + error.message);
  }
}

/* =========================================================
   INVIO MESSAGGI MIDI (BLE OUT / WEB MIDI FALLBACK)
   ========================================================= */

async function sendMidiBytes(bytes) {
  // Converte in array standard se necessario
  const data = Array.from(bytes);

  // 1. Invio tramite BLE SK-7
  if (outCharacteristic) {
    try {
      const timestamp = 0x80;
      const packet = new Uint8Array([timestamp, timestamp, ...data]);

      if (outCharacteristic.writeValueWithoutResponse) {
        await outCharacteristic.writeValueWithoutResponse(packet);
      } else {
        await outCharacteristic.writeValue(packet);
      }
      return true;
    } catch (err) {
      log("Errore invio BLE: " + err.message);
    }
  }

  // 2. Fallback tramite Web MIDI standard (USB / Cavo)
  if (typeof navigator.requestMIDIAccess === "function") {
    try {
      const midi = await navigator.requestMIDIAccess();
      let sent = false;
      midi.outputs.forEach(output => {
        output.send(data);
        sent = true;
      });
      if (sent) return true;
    } catch (err) {
      log("Errore Web MIDI: " + err.message);
    }
  }

  log("Nessuna uscita MIDI connessa.");
  return false;
}

// Invio Control Change (CC)
async function sendCC(cc, value) {
  const channel = parseInt(document.getElementById("midiChannel")?.value || 0, 10);
  const status = 0xB0 + channel;
  value = Math.max(0, Math.min(127, value));

  const ok = await sendMidiBytes([status, cc, value]);
  if (ok) log(`OUT CH${channel + 1} CC${cc} = ${value}`);
  return ok;
}

// Helper per pause asincrone
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Invio Cambio Preset (Program Change + Bank Select con delay)
async function sendPresetChange(presetNumber) {
  if (presetNumber < 1 || presetNumber > 384) {
    log("ERRORE: Numero preset deve essere compreso tra 1 e 384");
    return;
  }

  const channel = parseInt(document.getElementById("midiChannel")?.value || 0, 10);
  const zeroBased = presetNumber - 1;
  const bank = Math.floor(zeroBased / 128); // CC 0 -> Banco 0, 1 o 2
  const program = zeroBased % 128;         // PC   -> Indice da 0 a 127

  // 1. Invio Bank Select (CC 0)
  const ccOk = await sendMidiBytes([0xB0 + channel, 0x00, bank]);

  // 2. Pausa tecnica indispensabile per far processare il cambio banco al VoiceLive 2
  await delay(35);

  // 3. Invio Program Change
  const pcOk = await sendMidiBytes([0xC0 + channel, program]);

  if (ccOk && pcOk) {
    log(`PRESET INVIATO -> Preset ${presetNumber} [CC0 Banco: ${bank}, PC Program: ${program}]`);
  }
}

/* =========================================================
   PARSING MIDI IN (Feedback dal VoiceLive 2 via SK-7 IN)
   ========================================================= */

function onBLEMidiMessage(event) {
  const data = new Uint8Array(event.target.value.buffer);
  if (data.length < 3) return;

  for (let i = 2; i < data.length - 2; i++) {
    const byte = data[i];
    if ((byte & 0xF0) === 0xB0) {
      const channel = byte & 0x0F;
      const cc = data[i + 1];
      const value = data[i + 2];

      if (cc < 128 && value < 128) {
        processIncomingCC(channel, cc, value);
      }
    }
  }
}

function processIncomingCC(channel, cc, value) {
  log(`IN CH${channel + 1} CC${cc} = ${value}`);
  if (Object.prototype.hasOwnProperty.call(fxState, cc)) {
    const state = value >= 64;
    fxState[cc] = state;
    if (typeof updateFxUI === "function") updateFxUI(cc, state);
  }
}

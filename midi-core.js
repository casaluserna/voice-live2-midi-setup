// Variable globali per la connessione MIDI
let midiAccess = null;
let activeOutput = null;

// Inizializza la Web MIDI API
async function initMIDI(onDevicesUpdated) {
  if (!navigator.requestMIDIAccess) {
    alert("La Web MIDI API non è supportata da questo browser.");
    return false;
  }

  try {
    midiAccess = await navigator.requestMIDIAccess();
    updateDeviceList(onDevicesUpdated);

    midiAccess.onstatechange = () => updateDeviceList(onDevicesUpdated);
    return true;
  } catch (err) {
    console.error("Errore accesso MIDI:", err);
    return false;
  }
}

// Popola la lista delle porte di uscita disponibili
function updateDeviceList(callback) {
  const outputs = Array.from(midiAccess.outputs.values());
  if (callback) callback(outputs);
}

// Imposta la porta di uscita attiva
function selectMIDIOutput(deviceId) {
  if (!midiAccess) return;
  activeOutput = midiAccess.outputs.get(deviceId) || null;
}

// Funzione per cambiare il PRESET sul VoiceLive 2
function sendPresetChange(presetNumber, channel = 0) {
  if (!activeOutput) {
    console.warn("Nessun dispositivo MIDI selezionato.");
    return;
  }

  // VoiceLive 2 usa numerazione 1-based sul display (1-384)
  const zeroBased = presetNumber - 1;
  const bank = Math.floor(zeroBased / 128); // CC 0 (0 per preset 1-128, 1 per 129-256, 2 per 257-384)
  const program = zeroBased % 128;         // PC (0-127)

  // 1. Invio Bank Select (CC 0)
  activeOutput.send([0xB0 + channel, 0x00, bank]);

  // 2. Invio Program Change (PC)
  activeOutput.send([0xC0 + channel, program]);

  console.log(`Inviato Preset ${presetNumber} -> Banco ${bank}, PC ${program} (Canale ${channel + 1})`);
}

// Funzione per inviare Control Change (CC) per gli effetti
function sendCC(ccNumber, value, channel = 0) {
  if (!activeOutput) return;
  activeOutput.send([0xB0 + channel, ccNumber, value]);
}

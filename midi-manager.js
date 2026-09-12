/**
 * midi-manager.js
 * Gestione unificata connessioni MIDI (Cavo USB / Bluetooth SK-7)
 * per VoiceLive 2 Controller
 */

const MidiManager = {
  midiAccess: null,
  activeOutput: null,
  midiChannel: 0, // Canale 1 (0 = CH 1, 1 = CH 2, ecc.)

  async init(selectElementId = "midiOutputSelect", statusElementId = "midiStatus") {
    this.selectEl = document.getElementById(selectElementId);
    this.statusEl = document.getElementById(statusElementId);

    if (!navigator.requestMIDIAccess) {
      if (this.statusEl) {
        this.statusEl.textContent = "Usa 'Web MIDI Browser' su iPad per il cavo USB ⚠️";
        this.statusEl.style.color = "var(--orange)";
      }
      return false;
    }

    try {
      this.midiAccess = await navigator.requestMIDIAccess({ sysex: false });
      this.refreshPorts();

      this.midiAccess.onstatechange = () => this.refreshPorts();

      if (this.selectEl) {
        this.selectEl.addEventListener("change", (e) => this.onUserSelectPort(e.target.value));
      }
      return true;
    } catch (err) {
      console.error("[MIDI] Errore richiesta accesso:", err);
      if (this.statusEl) {
        this.statusEl.textContent = "Accesso MIDI negato 🔒";
        this.statusEl.style.color = "var(--red)";
      }
      return false;
    }
  },

  refreshPorts() {
    if (!this.midiAccess || !this.selectEl) return;

    this.selectEl.innerHTML = '<option value="">-- Seleziona Interfaccia MIDI --</option>';
    const savedName = localStorage.getItem("vl2_preferred_device");
    let autoSelected = false;

    for (let output of this.midiAccess.outputs.values()) {
      const option = document.createElement("option");
      option.value = output.id;

      const lowerName = output.name.toLowerCase();
      if (lowerName.includes("voicelive")) {
        option.textContent = `🔌 Cavo USB: ${output.name}`;
      } else if (lowerName.includes("sk-7") || lowerName.includes("ble") || lowerName.includes("bluetooth")) {
        option.textContent = `📶 Bluetooth: ${output.name}`;
      } else {
        option.textContent = `🎛️ ${output.name}`;
      }

      if (savedName && output.name === savedName) {
        option.selected = true;
        this.activeOutput = output;
        autoSelected = true;
        this.setStatus(`Connesso: ${output.name} 🟢`, "var(--green)");
      }

      this.selectEl.appendChild(option);
    }

    // Se c'è il VoiceLive 2 via cavo collegato e nulla era memorizzato, selezionalo subito
    if (!autoSelected) {
      for (let output of this.midiAccess.outputs.values()) {
        if (output.name.toLowerCase().includes("voicelive")) {
          this.selectEl.value = output.id;
          this.activeOutput = output;
          this.setStatus(`Connesso: ${output.name} 🟢`, "var(--green)");
          localStorage.setItem("vl2_preferred_device", output.name);
          break;
        }
      }
    }

    if (!this.activeOutput && this.selectEl.options.length <= 1) {
      this.setStatus("Nessun dispositivo MIDI rilevato 🔴", "var(--red)");
    }
  },

  onUserSelectPort(portId) {
    if (!portId) {
      this.activeOutput = null;
      localStorage.removeItem("vl2_preferred_device");
      this.setStatus("Disconnesso 🔴", "var(--red)");
      return;
    }

    this.activeOutput = this.midiAccess.outputs.get(portId);
    if (this.activeOutput) {
      localStorage.setItem("vl2_preferred_device", this.activeOutput.name);
      this.setStatus(`Connesso: ${this.activeOutput.name} 🟢`, "var(--green)");
    }
  },

  sendProgramChange(presetNumber) {
    if (!this.activeOutput) {
      console.warn("Nessun output MIDI attivo!");
      return;
    }
    const statusByte = 0xC0 | (this.midiChannel & 0x0F);
    this.activeOutput.send([statusByte, presetNumber]);
  },

  sendControlChange(ccNumber, value) {
    if (!this.activeOutput) return;
    const statusByte = 0xB0 | (this.midiChannel & 0x0F);
    this.activeOutput.send([statusByte, ccNumber, value]);
  },

  setStatus(text, color) {
    if (this.statusEl) {
      this.statusEl.textContent = text;
      this.statusEl.style.color = color;
    }
  }
};

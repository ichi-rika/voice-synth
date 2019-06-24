import * as math from 'mathjs'
import Sawtooth from './sources/Sawtooth'
import CutoffSawtooth from './sources/CutoffSawtooth'
import RosenbergC from "./sources/RosenbergC"
import LiljencrantsFant from "./sources/LiljencrantsFant"
import KLGLOTT88 from "./sources/KLGLOTT88"
import synthPresets from "../presets"

window.AudioContext = window.AudioContext || window.webkitAudioContext;

class VoiceSynth {

  constructor() {
    this.sources = {
      'sawtooth': new Sawtooth(),
      'cutoffSawtooth': new CutoffSawtooth(),
      'rosenbergC': new RosenbergC(),
      'LF': new LiljencrantsFant(),
      'KLGLOTT88': new KLGLOTT88(),
    };
    this.onPreset = [];
    this.loadPreset = this.loadPreset.bind(this);

    this.context = new AudioContext();
    this.sourceGain = this.context.createGain();
    this.prefiltGain = this.context.createGain();
    this.amp = this.context.createGain();

    this.sourceGain.connect(this.prefiltGain);
    this.amp.connect(this.context.destination);

    this.formantF = [0, 0, 0, 0, 0];
    this._connectFilters();
  }

  start() {
    this.amp.gain.value = this.volume;
    this.playing = true;
  }

  stop() {
    this.playing = false;
    this.amp.gain.value = 0;
  }

  loadPreset(id) {
    if (!id) {
      id = "default";
    }

    const preset = synthPresets[id];

    this.frequency = preset.frequency;
    this.sourceName = preset.source.name;
    this.getSource().params = {...preset.source.params};
    this._setSource();
    this.formantF = [...preset.formants.freqs];
    this.formantBw = [...preset.formants.bands];
    this.formantGain = [...preset.formants.gains];

    this.volume = 1.0;
    this.playing = true;
    this.filterPass = true;
    this.sourceGain.value = 0.1;
    this.prefiltGain.gain.value = 1;
    this.amp.gain.value = this.volume;
    this.poles = new Array(2 * this.formantF.length);
    this._setFilters(true);

    if (this.onPreset) {
      this.onPreset.forEach(fn => fn());
    }
  }

  addPresetListener(callback) {
    this.onPreset.push(callback);
  }

  setVolume(vol) {
    this.volume = vol;
    if (this.playing) {
      this.amp.gain.exponentialRampToValueAtTime(vol, this.context.currentTime + 0.025);
    }
  }

  setFrequency(freq) {
    this.frequency = freq;
    this._setSource();
  }

  setSource(name) {
    this.sourceName = name;
    this._setSource();
  }

  getSource() {
    return this.sources[this.sourceName];
  }

  setSourceParam(key, value) {
    const source = this.getSource();

    if (source.params.hasOwnProperty(key)) {
      source.params[key] = Number(value);
    } else {
      throw Error("'Property doesn't exist.");
    }

    this._setSource();
  }

  toggleFilters(flag) {
    this.filterPass = flag;
    this._setFilters(true);
  }

  setFormantFreq(i, freq) {
    this.formantF[i] = freq;
    this._setFilters(true, i);
  }

  setFormantBw(i, bw) {
    this.formantBw[i] = bw;
    this._setFilters(true, i);
  }

  setFormantGain(i, gain) {
    this.formantGain[i] = gain;
    this._setFilters(true, i);
  }

  _setSource() {
    if (this.source) {
      this.source.stop();
      this.source.disconnect();
    }

    if (this.breath) {
      this.breath.stop();
      this.breath.disconnect();
    }

    const source = this.getSource();
    const buffer = source.getBuffer(this.context, this.frequency);

    this.source = this.context.createBufferSource();
    this.source.buffer = buffer;
    this.source.loop = true;
    this.source.start();
    this.source.connect(this.sourceGain);

    const noiseBuffer = source.getNoiseBuffer(this.context, buffer);

    this.breath = this.context.createBufferSource();
    this.breath.buffer = noiseBuffer;
    this.breath.loop = true;
    this.breath.start();
    this.breath.connect(this.sourceGain);
  }

  _connectFilters() {
    if (this.filters) {
      this.filters.forEach(flt => flt.disconnect());
    }
    if (this.preflt) {
      this.preflt.forEach(flt => flt.disconnect());
    }
    this.prefiltGain.disconnect();
    this.sourceGain.disconnect();

    const N = this.formantF.length;

    this.preflt = new Array(N);
    this.filters = new Array(N);

    for (let i = 0; i < N; ++i) {
      this.preflt[i] = this.context.createGain();
      this.filters[i] = this.context.createBiquadFilter();
      this.filters[i].type = 'bandpass';

      this.prefiltGain.connect(this.preflt[i]);
      this.preflt[i].connect(this.filters[i]);
      this.filters[i].connect(this.amp);
    }
  }

  _setFilters(change, i) {

    this.sourceGain.disconnect();

    if (this.filterPass) {
      for (let j = 0; j < this.filters.length; ++j) {
        const gainNode = this.preflt[j];
        const filter = this.filters[j];
        if (change === true && (i === undefined || i === j)) {
          const Fi = this.formantF[j];
          const Qi = Fi / this.formantBw[j];
          const Gi = Math.pow(10, this.formantGain[j] / 20);

          filter.frequency.exponentialRampToValueAtTime(Fi, this.context.currentTime + 0.025);
          filter.Q.exponentialRampToValueAtTime(Qi, this.context.currentTime + 0.025);
          gainNode.gain.exponentialRampToValueAtTime(Gi, this.context.currentTime + 0.025);
        }
      }

      this.sourceGain.connect(this.prefiltGain);
    } else {
      this.sourceGain.connect(this.amp);
    }

    /*if (this.filter) {
      this.filter.disconnect();
    }
    this.prefiltGain.disconnect();
    this.sourceGain.disconnect();

    if (this.filterPass) {
      if (!this.filter || change === true) {
        const {B, A} = this._calculateFilters(change, i);
        this.filter = this.context.createIIRFilter(B, A);
      }

      this.sourceGain.connect(this.prefiltGain);
      this.prefiltGain.connect(this.filter);
      this.filter.connect(this.amp);
    } else {
      this.sourceGain.connect(this.amp);
    }*/
  }

  _calculateFilters(change, i) {
    const N = this.formantF.length;
    const fs = this.context.sampleRate;

    for (let j = 0; j < N; ++j) {
      if (i === undefined || j === i) {
        const F = this.formantF[j];
        const Bw = this.formantBw[j];

        const r = Math.exp(-Math.PI * Bw / fs);
        const phi = 2 * Math.PI * F / fs;

        const pole = math.complex({r, phi});

        this.poles[j] = pole;
        this.poles[N + j] = math.conj(pole);
      }
    }

    const B = [1];
    const A = VoiceSynth._calculatePoly(this.poles);

    return {B, A};
  }

  static _calculatePoly(z) {
    const N = z.length;
    /*const P = math.zeros(N + 1);
    P.set([0], math.complex(1));*/

    const P = math.identity(1, N + 1);

    for (let k = 0; k < N; ++k) {
      //P[1:k+1] = P[1:k+1] - z[k] * P[0:k];

      const ind = math.index(0, math.range(0, k, true));
      const ind1 = math.index(0, math.range(1, k + 1, true));

      const Pz = math.multiply(z[k], P.subset(ind));
      const PmPz = math.chain(P.subset(ind1)).subtract(Pz).done();

      P.subset(ind1, PmPz);
    }

    const Pre = new Array(N + 1);

    for (let k = 0; k < N + 1; ++k) {
      Pre[k] = math.re(P.get([0, k]));
    }

    return Pre;
  }

}

export default VoiceSynth;
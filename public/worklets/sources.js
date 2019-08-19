const commonParams = [
  {name: 'frequency', defaultValue: 100, minValue: 70, maxValue: 600},
];

class AbstractSourceGenerator extends AudioWorkletProcessor {

  static get parameterDescriptors() {
    throw new Error('Unimplemented accessor');
  }

  static getSample(t, parameters) {
    throw new Error('Unimplemented method');
  }

  constructor() {
    super();
    this.n = 0;

    // Listen for a plot data request
    this.port.onmessage = ({data: {params, nbPoints}}) =>
        this.sendPlotData(params, nbPoints);
  }

  sendPlotData(params, nbPoints) {
    const data = new Array(nbPoints);

    let maxAmplitude = -Infinity;
    for (let k = 0; k < nbPoints; ++k) {
      const x = k / nbPoints;
      const y = this.constructor.getSample(x, params);

      const amplitude = Math.abs(y);
      if (amplitude > maxAmplitude) {
        maxAmplitude = amplitude;
      }

      data[k] = {x, y};
    }

    for (let k = 0; k < nbPoints; ++k) {
      data[k].y /= maxAmplitude;
    }

    this.port.postMessage(data);
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];

    const fs = sampleRate;

    let params = Object.entries(parameters).reduce((p, [key, param]) => {
      p[key] = param[0];
      return p;
    }, {});

    let f0 = params.frequency;
    let t0 = fs / f0;

    for (const outputChannel of output) {

      // Compute glottal vibration output.
      for (let i = 0; i < outputChannel.length; ++i) {

        outputChannel[i] = this.constructor.getSample(this.n / t0, params);

        this.n++;

        if (this.n >= t0) {
          this.n = 0;

          f0 = params.frequency;
          t0 = fs / f0;
          params = Object.entries(parameters).reduce((p, [key, param]) => {
            p[key] = (param.length > 1) ? param[i] : param[0];
            return p;
          }, {});
        }
      }
    }

    return true;
  }

}

class CutoffSawtooth extends AbstractSourceGenerator {

  static get parameterDescriptors() {
    return [
      ...commonParams,
      {name: 'Oq', defaultValue: 0.6, minValue: 0.2, maxValue: 0.8},
    ];
  }

  static getSample(t, {Oq}) {
    if (t < Oq) {
      return 1 - t;
    } else {
      return 0;
    }
  }

}

class LiljencrantsFant extends AbstractSourceGenerator {

  static get parameterDescriptors() {
    return [
      ...commonParams,
      {name: 'Oq', defaultValue: 0.6, minValue: 0.2, maxValue: 0.8},
      {name: 'am', defaultValue: 0.77, minValue: 0.74, maxValue: 0.95},
    ];
  }

  static getSample(t, {Oq, am}) {
    // p1 = Oq = Te
    // p2 = Ug'(Te) = E0 / Ee
    // p3 = 1 - am = 1 - Tp / Te

    const p1 = Oq;
    const p2 = 0.1;
    const p3 = 1 - am;

    const te = p1;
    const mtc = te - 1;
    const wa = Math.PI / (te * (1 - p3));

    const a = -Math.log(-p2 * Math.sin(wa * te)) / te;

    // Modification: Set Up = 1 and calculate e0 from that.
    const Up = 1;
    const e0 = Up / ((wa * Math.exp(a * Math.PI / wa) + 1) / (a ** 2 + wa ** 2));

    const int_a = e0 * ((wa / Math.tan(wa * te) - a) / p2 + wa) / (a ** 2 + wa ** 2);

    // if int_a < 0 we should reduce p2
    // if int_a > 0.5 * p2 * (1 - te) we should increase p2
    const rb0 = p2 * int_a; // correct if rb << (1 - te)
    let rb = rb0;          // rb = 1 / eps

    // Use Newton method to determine rb.
    for (let i = 0; i < 4; ++i) {
      const kk = 1 - Math.exp(mtc / rb);
      const err = rb + mtc * (1 / kk - 1) - rb0;
      const d_err = 1 - (1 - kk) * (mtc / rb / kk) ** 2;

      rb -= err / d_err;
    }

    const e1 = 1 / (p2 * (1 - Math.exp(mtc / rb)));

    if (t < te) {
      return e0 * (Math.exp(a * t) * (a * Math.sin(wa * t) - wa * Math.cos(wa * t)) + wa) / (a ** 2 + wa ** 2);
    } else {
      return e1 * (Math.exp(mtc / rb) * (t - 1 - rb) + Math.exp((te - t) / rb) * rb);
    }
  };

}

class RosenbergC extends AbstractSourceGenerator {

  static get parameterDescriptors() {
    return [
      ...commonParams,
      {name: 'Oq', defaultValue: 0.6, minValue: 0.1, maxValue: 0.8},
      {name: 'am', defaultValue: 0.67, minValue: 0.55, maxValue: 0.9},
    ];
  }

  static getSample(t, {Oq, am}) {
    const Tp = Oq * am;
    const Tn = Oq * (1 - am);

    if (t <= Tp) {
      return .5 * (1 - Math.cos(Math.PI * t / Tp));
    } else if (t <= Tp + Tn) {
      return Math.cos(Math.PI / 2 * (t - Tp) / Tn);
    } else {
      return 0;
    }
  };

}

class KLGLOTT88 extends AbstractSourceGenerator {

  static get parameterDescriptors() {
    return [
      ...commonParams,
      {name: 'Oq', defaultValue: 0.6, minValue: 0.1, maxValue: 0.8},
    ];
  }

  static getSample(t, {Oq}) {
    if (t <= Oq) {
      return (t ** 2 / Oq ** 2 - t ** 3 / Oq ** 3);
    } else {
      return 0;
    }
  }

}

function registerAll(list) {
  for (const processor of list) {
    registerProcessor(processor.name, processor);
  }
}

registerAll([
  CutoffSawtooth,
  RosenbergC,
  LiljencrantsFant,
  KLGLOTT88,
]);

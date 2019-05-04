export class Autobot {
  static FRAME_AUTOMATION_VALUE = 60 // automate every n-th frame; 12 frames ~= 0.2sec

  constructor() {}

  static shouldAutomate(frameCounter: number) {
    return frameCounter === this.FRAME_AUTOMATION_VALUE;
  }

  static selectBestControlFromRamStates(ramStates: object): number {
    let farestXPosition = -1;
    let pad = 0;
    if (ramStates['initial'][0x0770] === 0) { // if on title screen press start
      return 8;
    }
    for (const [padKey, ramState] of Object.entries(ramStates)) {
      if (padKey === 'initial') {
        continue;
      }
      if (ramState[0x0086] >= farestXPosition) {
        farestXPosition = ramState[0x0086];
        pad = padKey;
      }
    }
    return 2 ** pad;
  }
}

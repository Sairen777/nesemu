export class Autobot {
  static FRAME_AUTOMATION_VALUE = 60 // automate every n-th frame; 12 frames ~= 0.2sec
  static RAM_RECORDING_FRAME_FREQUENCY = 10 // record every n frames 
  
  protected ramSnapshots: [number[]?]
  protected padKey: number

  constructor() {
    this.ramSnapshots = []
  }

  public setPadKey(padKey: number): void {
    this.padKey = padKey
  }

  public getPadKey(): number {
    return this.padKey
  }

  public setRamSnapshots(ramSnapshots: [number[]?]): void {
    this.ramSnapshots = ramSnapshots;
  }

  public getRamSnapshots(): [number[]?] {
    return this.ramSnapshots;
  }

  public pushRAMSnapshot(ramState: number[]): void {
    this.ramSnapshots.push(ramState);
  }
  
  static shouldAutomate(frameCounter: number) {
    return frameCounter % this.FRAME_AUTOMATION_VALUE === 0;
  }

  static shouldRecordRAM(frameCounter: number) {
    return frameCounter % this.RAM_RECORDING_FRAME_FREQUENCY === 0;
  }

  public selectBestControlFromRamStates(ramStates: object): void {
    let farestXPosition = -1;
    let pad = 0;
    if (ramStates['initial'][0x0770] === 0) { // if on title screen press start
      this.setPadKey(8)
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
    this.setPadKey(2 ** pad);
  }


}

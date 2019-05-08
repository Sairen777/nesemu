export class Autobot {
  static FRAME_AUTOMATION_VALUE = 60 // automate every n-th frame; 12 frames ~= 0.2sec
  static RAM_RECORDING_FRAME_FREQUENCY = 10 // record every n frames
  static NUMBER_OF_GENERATED_ORDERINGS = 50
  
  protected ramSnapshots: number[][] = []
  protected orderings: number[][] = []
  protected padKey: number

  constructor() {
  }

  public setOrderings(orderings: number[][]): void {
    this.orderings = orderings;
  }

  public getOrderings(): number[][] {
    return this.orderings;
  }

  public setPadKey(padKey: number): void {
    this.padKey = padKey
  }

  public getPadKey(): number {
    return this.padKey
  }

  public setRamSnapshots(ramSnapshots: number[][]): void {
    this.ramSnapshots = ramSnapshots;
  }

  public getRamSnapshots(): number[][] {
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
    // @ts-ignore
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

  public generateOrderings(): void {
    if (this.ramSnapshots.length === 0) {
      return console.log('No RAM snapshots to create orderings from!')
    }
    let prefix = [];
    const remain: number[] = [];
    let localRemain: number[] = [];
    for (let i = 0; i < this.ramSnapshots[0].length; i++) {
      remain.push(i);
    }
    for (let i = 0; i < Autobot.NUMBER_OF_GENERATED_ORDERINGS; i++) {
      localRemain = [...remain];
      prefix = [];
      const ordering = this.makeOrdering(prefix, localRemain);
      this.orderings.push(ordering);
    }
    console.log(this.orderings);
  }

  //  returns list of positions from remain that are tight extensions of the prefix
  private pickCandidates(prefix: number[], remain: number[]): number[] {
    const lequal: number[] = [];
    const notgreater: number[] = [];
    const tight: number[] = [];
    for (let i = 0; i < this.ramSnapshots.length - 1; i++) {
      if (this.isRamsEqualByPrefix(prefix, this.ramSnapshots[i] || [], this.ramSnapshots[i+1] || [])) {
        lequal.push(i);
      }
    }
    for (const i of remain) {
      if (this.isRamsNotGreaterInPos(i, lequal)) {
        notgreater.push(i);
      }
    }
    for (const i of notgreater) {
      if (this.isRamsGreaterInPos(i, lequal)) {
        tight.push(i);
      }
    }
    return tight;
  }

  // returns maximal tight valid ordering
  // prefix is tight and valid
  private makeOrdering(prefix: number[], remain: number[]): number[] {
    const candidates = this.pickCandidates(prefix, remain);
    if (candidates.length === 0) {
      return prefix;
    } else {
      const c = candidates[Math.floor(Math.random() * candidates.length)];
      remain = remain.filter(item => item !== c);
      prefix.push(c);
      return this.makeOrdering(prefix, remain);
    }
  }

  private isRamsGreaterInPos(bitIndex: number, lequal: number[]): boolean {
    for (const ramNumber of lequal) {
      if (this.ramSnapshots[ramNumber] && this.ramSnapshots[ramNumber + 1] && this.ramSnapshots[ramNumber][bitIndex] < this.ramSnapshots[ramNumber + 1][bitIndex]) {
        return true;
      }
    }
    return false;
  }


  private isRamsNotGreaterInPos(bitIndex: number, lequal: number[]): boolean {
    for (const ramNumber of lequal) {
      if (!this.ramSnapshots[ramNumber] || !this.ramSnapshots[ramNumber + 1] || this.ramSnapshots[ramNumber][bitIndex] > this.ramSnapshots[ramNumber + 1][bitIndex]) {
        return false;
      }
    }
    return true;
  }

  private isRamsEqualByPrefix(prefix: number[], arr1: number[], arr2: number[]): boolean {
    if (prefix.length !== 0) {
      for (const i of prefix) {
        if (arr1[i] !== arr2[i]) {
          return false;
        }
      }
      return true;
    } else return true;
  }

  private weightOrdering(ordering: number[]): number {
    let orderingValueFunction: number[][] = [];
    for (const ram of this.ramSnapshots) {
      let ramOrderedSelection: number[] = [];
      // dont push duplicate values ?
      ordering.forEach(index => ramOrderedSelection.push(ram[index]));
      orderingValueFunction.push([...ramOrderedSelection]);
      ramOrderedSelection = [];
    }
    orderingValueFunction = orderingValueFunction.sort();
  }

  private computeValueFunction(ram: number[], ordering: number[], orderingValueFunction: number[][]) {
    const ramOrdering: number[] = [];
    // const orderingValueFunctionNorm = Math.sqrt()
    ordering.forEach(index => ramOrdering.push(ram[index]));
    for (let i = 0; i < orderingValueFunction.length; i++) {
      if (ramOrdering <= orderingValueFunction[i]) {

      }
    }
  }
}

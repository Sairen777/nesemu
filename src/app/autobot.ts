export class Autobot {
  static FRAME_AUTOMATION_VALUE = 1  // automate every n-th frame; 12 frames ~= 0.2sec
  static RAM_RECORDING_FRAME_FREQUENCY = 1 // record every n frames
  static NUMBER_OF_GENERATED_ORDERINGS = 50
  static NUMBER_OF_FRAMES_TO_AUTOMATE_FOR = 10*60 // frames * sec
  
  protected ramSnapshots: number[][] = []
  protected orderings: number[][] = []
  protected orderingsWeight: number[] = []
  protected pressedInputs: number[] = []
  protected motifs: number[][] = []
  protected motifsWeight: object[] = []
  protected motifsPlayHistory: object[] = []
  protected testInputs = []
  protected sessionTestInputs: number[] = [];
  public plainTestInputs: number[] = []
  protected randomFutures: number[][]

  constructor() {
  }

  public getSessiontestInputs(): number[] {
    return this.sessionTestInputs;
  }

  public pushSessionInput(pad: number): void {
    this.sessionTestInputs.push(pad);
  }

  public setPlaintestInputs(inputs: number[]): void {
    this.plainTestInputs = inputs;
  }

  public getPlainTestInputs(): number[] {
    return this.plainTestInputs;
  }

  public getRandomFutures(): number[][] {
    return this.randomFutures;
  }

  public setRandomFutures(randomFutures: number[][]): void {
    this.randomFutures = randomFutures;
  }

  public createRandomFutures(): void {
    for (let i = 0; i < 40; i++) {
      const future: number[] = [];
      for (let len = 0; len < (Math.random() * 10) + 5; len++) {
        future.push(...this.motifsWeight[Math.floor(Math.random() * this.motifsWeight.length)].motif);
      }
      this.randomFutures.push(future);
    }
  }

  public getTestInputs(): object[] {
    return this.testInputs;
  }

  public popPlaintestInput(): number {
    // @ts-ignore
    return this.plainTestInputs.pop();
  }

  public pushPlainTestInput(pad: number): void {
    this.plainTestInputs.push(pad);
  }

  public pushMotifsPlayHistory(motifAndElapsedTime: object): void {
    this.motifsPlayHistory.push(motifAndElapsedTime);
  }

  public setMotifsWeight(motifsWeight: object[]): void {
    this.motifsWeight = motifsWeight;
  }

  public getMotifsWeight(): object[] {
    return this.motifsWeight;
  }

  public setOrderingsWeight(orderingsWeight: number[]): void {
    this.orderingsWeight = orderingsWeight;
  }

  public getOrderingsWeight(): number[] {
    return this.orderingsWeight;
  }

  public setOrderings(orderings: number[][]): void {
    this.orderings = orderings;
  }

  public getOrderings(): number[][] {
    return this.orderings;
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

  public selectBestControlFromRamStates(ramStates: object): number[] {
    let motif: number[] = [];
    let biggestWeight = -1;
    // @ts-ignore
    for (const [motifIndex, ramState] of Object.entries(ramStates)) {
      if (motifIndex === 'initial') {
        continue;
      }
      const countedStateWeight = this.computeNewRamStateWeight(ramStates['initial'], ramState);
      // console.log(countedStateWeight, this.motifsWeight[motifIndex].motif);
      if (countedStateWeight > biggestWeight) {
        biggestWeight = countedStateWeight;
        motif = this.motifsWeight[motifIndex].motif;
      }
    }
    return motif;
  }

  public computeNewRamStateWeight(initialRamState: number[], updatedRamState: number[]): number {
    let initialStateOrdering: number[] = [];
    let updatedStateOrdering: number[] = [];
    let weight = 0;
    for (let i = 0; i < this.orderings.length; i++) {
      this.orderings[i].forEach(index => {
        initialStateOrdering.push(initialRamState[index]);
        updatedStateOrdering.push(updatedRamState[index]);
      });
      if (initialStateOrdering < updatedStateOrdering) {
        weight += this.orderingsWeight[i];
      }
      initialStateOrdering = [];
      updatedStateOrdering = [];
    }
    return weight;
  }

  public generateOrderings(): void {
    if (this.ramSnapshots.length === 0) {
      return console.error('No RAM snapshots to create orderings from!')
    }
    this.setOrderings([]);
    let prefix = [];
    const remain: number[] = [];
    let localRemain: number[] = [];
    for (let i = 0; i < this.ramSnapshots[0].length; i++) {
      remain.push(i);
    }
    // orderings on whole ram recording
    for (let i = 0; i < Autobot.NUMBER_OF_GENERATED_ORDERINGS; i++) {
      localRemain = [...remain];
      prefix = [];
      const ordering = this.makeOrdering(prefix, localRemain, this.ramSnapshots);
      this.orderings.push(ordering);
    }
    // ordering on each 10's memory
    const every10RamSnapshot = this.ramSnapshots.filter((_, index) => index % 10 === 0);
    for (let i = 0; i < 3; i++) {
      localRemain = [...remain];
      prefix = [];
      const tenthOrdering = this.makeOrdering(prefix, localRemain, every10RamSnapshot);
      this.orderings.push(tenthOrdering);
    }
    // starting from i
    for (let i = 0; i < 10; i++) {
      // every 100th
      const every100RamSnapshot = this.ramSnapshots.filter((_, index) => ((index + i) % 100) === 0);
      localRemain = [...remain];
      prefix = [];
      let ord = this.makeOrdering(prefix, localRemain, every100RamSnapshot);
      if (ord.length !== 0) {
        this.orderings.push(ord);
      }
      // every 250th
      const every250RamSnapshot = this.ramSnapshots.filter((_, index) => ((index + i) % 250) === 0);
      localRemain = [...remain];
      prefix = [];
      ord = this.makeOrdering(prefix, localRemain, every250RamSnapshot);
      if (ord.length !== 0) {
        this.orderings.push(ord);
      }
      // every 1000th
      const every1000RamSnapshot = this.ramSnapshots.filter((_, index) => ((index + i) % 1000) === 0);
      localRemain = [...remain];
      prefix = [];
      ord = this.makeOrdering(prefix, localRemain, every1000RamSnapshot);
      if (ord.length !== 0) {
        this.orderings.push(ord);
      }
    }
  }

  //  returns list of positions from remain that are tight extensions of the prefix
  private pickCandidates(prefix: number[], remain: number[], targetArr: number[][]): number[] {
    const lequal: number[] = [];
    const notgreater: number[] = [];
    const tight: number[] = [];
    for (let i = 0; i < targetArr.length - 1; i++) {
      if (this.isRamsEqualByPrefix(prefix, targetArr[i] || [], targetArr[i+1] || [])) {
        lequal.push(i);
      }
    }
    for (const i of remain) {
      if (this.isRamsNotGreaterInPos(i, lequal, targetArr)) {
        notgreater.push(i);
      }
    }
    for (const i of notgreater) {
      if (this.isRamsGreaterInPos(i, lequal, targetArr)) {
        tight.push(i);
      }
    }
    return tight;
  }

  // returns maximal tight valid ordering
  // prefix is tight and valid
  private makeOrdering(prefix: number[], remain: number[], targetArr: number[][]): number[] {
    const candidates = this.pickCandidates(prefix, remain, targetArr);
    if (candidates.length === 0) {
      return prefix;
    } else {
      const c = candidates[Math.floor(Math.random() * candidates.length)];
      remain = remain.filter(item => item !== c);
      prefix.push(c);
      return this.makeOrdering(prefix, remain, targetArr)
    }
  }

  private isRamsGreaterInPos(bitIndex: number, lequal: number[], targetArr: number[][]): boolean {
    for (const ramNumber of lequal) {
      if (targetArr[ramNumber] && targetArr[ramNumber + 1] && targetArr[ramNumber][bitIndex] < targetArr[ramNumber + 1][bitIndex]) {
        return true;
      }
    }
    return false;
  }

  private isRamsNotGreaterInPos(bitIndex: number, lequal: number[], targetArr: number[][]): boolean {
    for (const ramNumber of lequal) {
      if (!targetArr[ramNumber] || !targetArr[ramNumber + 1] || targetArr[ramNumber][bitIndex] > targetArr[ramNumber + 1][bitIndex]) {
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
    let orderingV: number[][] = [];
    for (const ram of this.ramSnapshots) {
      let ramOrderedSelection: number[] = [];
      ordering.forEach(index => {
        // dont push duplicate values
        if (ramOrderedSelection.indexOf(ram[index]) === -1) {
          ramOrderedSelection.push(ram[index])
        }
      });
      orderingV.push([...ramOrderedSelection]);
      ramOrderedSelection = [];
    }
    orderingV = orderingV.sort();
    const orderingsCache = {};
    let orderingWeight = 0;
    let left: number;
    let right: number;
    for (let i = 1; i < this.ramSnapshots.length - 1; i++) {
      if (orderingsCache[i+1]) {
        left = orderingsCache[i+1];
      } else {
        left = this.computeOrderingVF(this.ramSnapshots[i + 1], ordering, orderingV);
        orderingsCache[i+1] = left;
      }
      if (orderingsCache[i]) {
        right = orderingsCache[i];
      } else {
        right = this.computeOrderingVF(this.ramSnapshots[i], ordering, orderingV);
        orderingsCache[i] = right;
      }
      orderingWeight += (left - right);
    }
    return orderingWeight >= 0 ? orderingWeight : 0;
  }

  private computeOrderingVF(ram: number[], ordering: number[], orderingV: number[][]) {
    const ramOrdering: number[] = [];
    // @ts-ignore
    const orderingVNorma = Math.sqrt(orderingV.flat().reduce(
      (acc, currentItem) => acc + currentItem**2
    ));
    ordering.forEach(index => ramOrdering.push(ram[index]));
    let targetIndex = -1;
    for (let i = 0; i < orderingV.length; i++) {
      if (ramOrdering <= orderingV[i]) {
        targetIndex = i;
        break;
      }
    }
    const weight = (targetIndex === -1 ? orderingVNorma : targetIndex) / orderingVNorma;
    return weight;
  }

  public computeOrderingsWeight(): void {
    console.log('started computing orderings weigh');
    this.orderings.forEach(ordering => {
      this.orderingsWeight.push(this.weightOrdering(ordering));
      console.log('weight computed');
    });
    console.log('finished computing orderings weigh');
  }

  public addPressedInput(pad: number): void {
    if (this.motifs.length === 0 || this.motifs[this.motifs.length - 1].length === 10) {
      this.motifs.push([pad]);
    } else {
      this.motifs[this.motifs.length - 1].push(pad);
    }
  }

  public weightMotifs(): void {
    this.motifsWeight = [];
    for (const motif of this.motifs) {
      const existedEntry = this.motifsWeight.find(e => JSON.stringify(e.motif) === JSON.stringify(motif));
      if (!existedEntry) {
        this.motifsWeight.push({motif: motif, weight: 1});
      } else {
        const index = this.motifsWeight.indexOf(existedEntry);
        this.motifsWeight[index].weight += 1;
      }
    }
    this.motifsWeight.sort((a, b) => (a.weight < b.weight) ? 1 : -1);
  }
}

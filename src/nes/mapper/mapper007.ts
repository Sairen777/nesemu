// AxROM

import {Mapper} from './mapper'
import {Cpu} from '../cpu'
import {Ppu, MirrorMode} from '../ppu'

const kMirrorTable = [MirrorMode.SINGLE0, MirrorMode.SINGLE1]

export class Mapper007 extends Mapper {
  constructor(romData: Uint8Array, cpu: Cpu, ppu: Ppu) {
    super()
    // 32KB switchable PRG ROM bank
    const BANK_BIT = 15
    const BANK_SIZE = 1 << BANK_BIT
    const size = romData.length
    const count = size / BANK_SIZE
    let prgBank = 0
    cpu.setReadMemory(0x8000, 0xffff, (adr) => romData[(adr & (BANK_SIZE - 1)) + prgBank])

    // PRG ROM bank
    cpu.setWriteMemory(0x8000, 0xffff, (_adr, value) => {
      prgBank = (value & (count - 1)) << BANK_BIT

      const namePage = (value >> 4) & 1
      ppu.setMirrorMode(kMirrorTable[namePage])
    })
  }
}

import {Nes} from '../nes/nes'
import {MirrorMode} from '../nes/ppu'
import {Autobot} from './autobot'
import {AppEvent} from './app_event'
import {AudioManager} from '../util/audio_manager'
import {KeyCode} from '../util/key_code'
import {ScreenWnd, PaletWnd, NameTableWnd, PatternTableWnd,
        RegisterWnd, TraceWnd, ControlWnd} from './ui'
import StorageUtil from '../util/storage_util'
import Util from '../util/util'
import WindowManager from '../wnd/window_manager'

import * as Pubsub from '../util/pubsub'

const CPU_HZ = 1789773
const MAX_ELAPSED_TIME = 1000 / 15
export const DEFAULT_MASTER_VOLUME = 0.125

export class Option {
  public title?: string
  public centerX?: number
  public centerY?: number
  public onClosed?: (app: App) => void
}

export class App {
  protected destroying = false
  protected isBlur = false
  protected rafId?: number  // requestAnimationFrame
  protected nes: Nes
  protected audioManager: AudioManager
  protected stream = new AppEvent.Stream()
  protected subscription: Pubsub.Subscription

  protected autobot = new Autobot()
  protected isAutomating = false
  protected isLookingIntoFuture = false

  protected title: string
  protected screenWnd: ScreenWnd
  protected paletWnd: PaletWnd|null = null
  protected hasNameTableWnd = false
  protected hasPatternTableWnd = false

  protected hasRegisterWnd = false
  protected hasTraceWnd = false
  protected hasCtrlWnd = false

  protected isRecordingRAM = false

  protected volume = 1

  public static create(wndMgr: WindowManager, option: Option): App {
    return new App(wndMgr, option)
  }

  constructor(protected wndMgr: WindowManager, option: Option, noDefault?: boolean) {
    if (noDefault)
      return

    this.nes = Nes.create()
    window.nes = this.nes  // Put nes into global.
    this.nes.setVblankCallback((leftV) => { this.onVblank(leftV) })
    this.nes.setBreakPointCallback(() => { this.onBreakPoint() })

    this.subscription = this.stream
      .subscribe(type => {
        switch (type) {
        case AppEvent.Type.DESTROY:
          this.cleanUp()
          if (option.onClosed)
            option.onClosed(this)
          break
        case AppEvent.Type.RENDER:
          break
        case AppEvent.Type.RUN:
          this.nes.getCpu().pause(false)
          break
        case AppEvent.Type.PAUSE:
          this.nes.getCpu().pause(true)
          this.muteAudio()
          break
        case AppEvent.Type.STEP:
          this.nes.step(0)
          break
        case AppEvent.Type.RESET:
          this.nes.reset()
          break
        }
      })

    this.screenWnd = new ScreenWnd(this.wndMgr, this, this.nes, this.stream)
    this.wndMgr.add(this.screenWnd)
    this.title = (option.title as string) || 'NES'

    this.autobot.setRamSnapshots(StorageUtil.getObject(`RAMDATA-${this.title}`, []))
    // this.autobot.setRamSnapshots([[0,2,2,2], [0,2,4,2], [0,4,6,2], [0,2,8,6]])
    this.autobot.setOrderings(StorageUtil.getObject(`ORDERINGS-${this.title}`, []))
    this.autobot.setOrderingsWeight(StorageUtil.getObject(`ORDERINGS-WEIGHT-${this.title}`, []))
    this.autobot.setMotifsWeight(StorageUtil.getObject(`MOTIFS-WEIGHT-${this.title}`, {}))
    this.autobot.setSortedMotifs(StorageUtil.getObject(`MOTIFS-SORTED-${this.title}`, []))

    this.screenWnd.setTitle(this.title)

    const size = this.screenWnd.getWindowSize()
    let x = Util.clamp((option.centerX || 0) - size.width / 2,
                       0, window.innerWidth - size.width - 1)
    let y = Util.clamp((option.centerY || 0) - size.height / 2,
                       0, window.innerHeight - size.height - 1)
    this.screenWnd.setPos(x, y)

    this.screenWnd.setCallback((action, ...args) => {
      switch (action) {
      case 'resize':
        {
          const [width, height] = args
          this.screenWnd.onResized(width, height)
        }
        break
      case 'openMenu':
        this.cancelLoopAnimation()
        this.muteAudio()
        break
      case 'closeMenu':
        this.startLoopAnimation()
        break
      }
    })
  }

  public setVolume(vol: number): void {
    this.volume = vol
    this.audioManager.setMasterVolume(this.volume * DEFAULT_MASTER_VOLUME)
  }

  public loadRom(romData: Uint8Array): boolean|string {
    const result = this.nes.setRomData(romData)
    if (result !== true)
      return result

    const contextClass = window.AudioContext || window.webkitAudioContext
    // if (contextClass == null)
    //   return

    this.audioManager = new AudioManager(contextClass)
    this.setupAudioManager()

    this.nes.reset()
    this.nes.getCpu().pause(false)
    this.screenWnd.getContentHolder().focus()
    this.stream.triggerLoadRom()

    this.startLoopAnimation()

    if (window.$DEBUG) {  // Accessing global variable!!!
      this.createPaletWnd()
      this.createNameTableWnd()
      this.createPatternTableWnd()
      this.createTraceWnd()
      this.createRegisterWnd()
      this.createControlWnd()
    }

    return true
  }

  public close(): void {
    this.screenWnd.close()
  }

  public saveData() {
    const saveData = this.nes.save()
    StorageUtil.putObject(this.title, saveData)
  }

  public loadData() {
    const saveData = StorageUtil.getObject(this.title, null)
    if (saveData) {
      try {
        this.nes.load(saveData)
      } catch (e) {
        console.error(e)
        this.wndMgr.showSnackbar('Error: Load data failed')
        this.nes.reset()
      }
    } else {
      this.wndMgr.showSnackbar(`No save data for "${this.title}"`)
    }
  }

  public onBlur() {
    if (this.isBlur)
      return
    this.isBlur = true
    // this.cancelLoopAnimation()
    if (this.audioManager)
      this.audioManager.setMasterVolume(0)
  }

  public onFocus() {
    if (!this.isBlur)
      return
    this.isBlur = false
    // this.startLoopAnimation()
    if (this.audioManager)
      this.audioManager.setMasterVolume(this.volume * DEFAULT_MASTER_VOLUME)
  }

  public createPaletWnd(): boolean {
    if (this.paletWnd != null)
      return false
    const paletWnd = new PaletWnd(this.wndMgr, this.nes, this.stream)
    this.wndMgr.add(paletWnd)
    paletWnd.setPos(520, 0)
    paletWnd.setCallback(action => {
      if (action === 'close') {
        this.paletWnd = null
      }
    })
    this.paletWnd = paletWnd
    return true
  }

  public createNameTableWnd(): boolean {
    if (this.hasNameTableWnd)
      return false
    const nameTableWnd = new NameTableWnd(this.wndMgr, this.nes, this.stream,
                                          this.nes.getPpu().getMirrorMode() === MirrorMode.HORZ)
    this.wndMgr.add(nameTableWnd)
    nameTableWnd.setPos(520, 40)
    nameTableWnd.setCallback(action => {
      if (action === 'close') {
        this.hasNameTableWnd = false
      }
    })
    return this.hasNameTableWnd = true
  }

  public createPatternTableWnd(): boolean {
    if (this.hasPatternTableWnd)
      return false

    const getSelectedPalets = (buf: Uint8Array) => {
      if (this.paletWnd != null)
        this.paletWnd.getSelectedPalets(buf)
      else
        buf[0] = buf[1] = 0
    }
    const patternTableWnd = new PatternTableWnd(this.wndMgr, this.nes, this.stream,
                                                getSelectedPalets)
    this.wndMgr.add(patternTableWnd)
    patternTableWnd.setPos(520, 300)
    patternTableWnd.setCallback(action => {
      if (action === 'close') {
        this.hasPatternTableWnd = false
      }
    })
    return this.hasPatternTableWnd = true
  }

  public createTraceWnd(): boolean {
    if (this.hasTraceWnd)
      return false
    const traceWnd = new TraceWnd(this.wndMgr, this.nes, this.stream)
    this.wndMgr.add(traceWnd)
    traceWnd.setPos(0, 500)
    traceWnd.setCallback(action => {
      if (action === 'close') {
        this.hasTraceWnd = false
      }
    })

    return this.hasTraceWnd = true
  }

  public createRegisterWnd(): boolean {
    if (this.hasRegisterWnd)
      return false
    const registerWnd = new RegisterWnd(this.wndMgr, this.nes, this.stream)
    this.wndMgr.add(registerWnd)
    registerWnd.setPos(410, 500)
    registerWnd.setCallback(action => {
      if (action === 'close') {
        this.hasRegisterWnd = false
      }
    })

    return this.hasRegisterWnd = true
  }

  public createControlWnd(): boolean {
    if (this.hasCtrlWnd)
      return false
    const ctrlWnd = new ControlWnd(this.wndMgr, this.stream)
    this.wndMgr.add(ctrlWnd)
    ctrlWnd.setPos(520, 500)
    ctrlWnd.setCallback(action => {
      if (action === 'close') {
        this.hasCtrlWnd = false
      }
    })

    return this.hasCtrlWnd = true
  }

  protected cleanUp() {
    this.cancelLoopAnimation()
    this.destroying = true
    if (this.audioManager)
      this.audioManager.release()

    this.subscription.unsubscribe()
  }

  protected onVblank(leftV: number): void {
    if (leftV < 1)
      this.render()
    this.updateAudio()
  }

  protected onBreakPoint(): void {
    this.stream.triggerBreakPoint()
  }

  public startRecordingRAM(): void {
    console.log('started recording ram');
    this.isRecordingRAM = true;
  }

  public endRecordingRAM(): void {
    this.isRecordingRAM = false;
    console.log('ended recording ram');
    StorageUtil.putObject(`RAMDATA-${this.title}`, this.autobot.getRamSnapshots())
    this.autobot.weightMotifs();
    StorageUtil.putObject(`MOTIFS-WEIGHT-${this.title}`, this.autobot.getMotifsWeight());
    this.autobot.createOrderedMotifsFromWeights();
    StorageUtil.putObject(`MOTIFS-SORTED-${this.title}`, this.autobot.getSortedMotifs());
  }

  public startAutomation(): void {
    this.isAutomating = true
  }

  public stopAutomation(): void {
    this.isAutomating = false
  }

  public generateAndSaveOrderings(): void {
    this.autobot.generateOrderings();
    const generatedOrderings = this.autobot.getOrderings();
    if (generatedOrderings.length !== 0) {
      StorageUtil.putObject(`ORDERINGS-${this.title}`, this.autobot.getOrderings())
    }
  }

  public computeOrderingsWeight(): void {
    this.autobot.computeOrderingsWeight();
    if (this.autobot.getOrderingsWeight().length !== 0) {
      StorageUtil.putObject(`ORDERINGS-WEIGHT-${this.title}`, this.autobot.getOrderingsWeight())
    }
  }

  protected startLoopAnimation(): void {
    if (this.rafId != null)
      return
    let lastTime = window.performance.now()
    let frameCounter = 0;

    const loopFn = () => {
      if (this.destroying)
        return
      this.stream.triggerStartCalc()
      const curTime = window.performance.now()
      const elapsedTime = curTime - lastTime
      lastTime = curTime

      if (this.isRecordingRAM && Autobot.shouldRecordRAM(frameCounter)) {
        this.autobot.pushRAMSnapshot([...this.nes.getRam()])
        console.log('saved snapshot')
      }
      const shouldAutomate = this.isAutomating && Autobot.shouldAutomate(frameCounter);

      if (shouldAutomate) {
        const saveData = this.nes.save();
        const ramData = {initial: [...this.nes.getRam()]};
        this.isLookingIntoFuture = true;
        let p = 0;
        for (const [motifIndex, motif] of this.autobot.getSortedMotifs().entries()) {
          for (const pad of motif) {
            this.update(elapsedTime, pad)
            p = pad;
          }
          // random stuff probly not need
          for (let j = 0; j < 10; j++) {
            this.update(elapsedTime, p)
          }

          ramData[motifIndex] = [...this.nes.getRam()];
          this.nes.load(saveData);
        }
        const bestMotif = this.autobot.selectBestControlFromRamStates(ramData);
        this.isLookingIntoFuture = false;
        for (const pad of bestMotif) {
          this.update(elapsedTime, pad)
        }
      } else {
        this.update(elapsedTime)
      }

      this.stream.triggerEndCalc()
      this.rafId = requestAnimationFrame(loopFn)
      frameCounter++;
    }

    this.rafId = requestAnimationFrame(loopFn)
  }

  protected cancelLoopAnimation(): void {
    if (this.rafId == null)
      return
    cancelAnimationFrame(this.rafId)
    this.rafId = undefined
  }

  // cycles in frame
  protected update(elapsedTime: number, keyPadPress?: number): void {
    if (this.nes.getCpu().isPaused())
      return

    for (let i = 0; i < 2; ++i) {
      const pad = this.wndMgr.getPadStatus(this.screenWnd, i)
      const p = (i === 0 ? (keyPadPress || pad) : pad);
      this.nes.setPadStatus(i, p)
      if (this.isRecordingRAM) {
        if ((i !== 1 && pad !== 0) || (i !== 0 && pad !== 0)) {
          this.autobot.addPressedInput(pad);
        }
      }
    }

    let et = Math.min(elapsedTime, MAX_ELAPSED_TIME)
    et = (this.wndMgr.getKeyPressing(this.screenWnd, KeyCode.SHIFT)
          ? et * 4 : et)

    const cycles = (CPU_HZ * et / 1000) | 0
    this.nes.runCycles(cycles)
  }

  protected render(): void {
    if (this.isLookingIntoFuture) return
    this.stream.triggerRender()
  }

  protected updateAudio(): void {
    const audioManager = this.audioManager
    const count = audioManager.getChannelCount()
    for (let ch = 0; ch < count; ++ch) {
      const volume = this.nes.getSoundVolume(ch)
      audioManager.setChannelVolume(ch, volume)
      if (volume > 0) {
        audioManager.setChannelFrequency(ch, this.nes.getSoundFrequency(ch))
        audioManager.setChannelDutyRatio(ch, this.nes.getSoundDutyRatio(ch))
      }
    }
  }

  protected muteAudio(): void {
    const n = this.audioManager.getChannelCount()
    for (let ch = 0; ch < n; ++ch)
      this.audioManager.setChannelVolume(ch, 0)
  }

  protected setupAudioManager() {
    this.audioManager.release()

    this.audioManager.setMasterVolume(this.volume * DEFAULT_MASTER_VOLUME)
    const channelTypes = this.nes.getSoundChannelTypes()
    for (const type of channelTypes) {
      this.audioManager.addChannel(type)
    }
  }
}

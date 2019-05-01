///<reference path="./decl/patch.d.ts" />

import {App} from './app/app'
import DomUtil from './util/dom_util'
import {JsApp} from './app/js_powered_app'
import {GamepadManager, GamepadWnd} from './util/gamepad_manager'
import StorageUtil from './util/storage_util'
import Util from './util/util'
import WindowManager from './wnd/window_manager'
import './nes/polyfill'
import * as JSZip from 'jszip'

// Request Animation Frame
window.requestAnimationFrame = (function() {
  return (window.requestAnimationFrame || window.mozRequestAnimationFrame ||
          window.webkitRequestAnimationFrame || window.msRequestAnimationFrame)
})()

const KEY_VOLUME = 'volume'

class Main {
  private wndMgr: WindowManager
  private apps: App[] = []
  private volume = 1

  constructor(private root: HTMLElement) {
    this.wndMgr = new WindowManager(root)

    this.volume = Util.clamp(StorageUtil.getFloat(KEY_VOLUME, 1), 0, 1)

    this.setUpFileDrop()
    this.setUpGamePadLink()
    this.setUpVolumeLink()
    this.setUpOpenRomLink()
    this.setUpBlur()
  }

  private setUpFileDrop(): void {
    // Handle file drop.
    if (!(window.File && window.FileReader && window.FileList && window.Blob))
      return
    DomUtil.handleFileDrop(this.root, (files, x, y) => this.createAppFromFiles(files, x, y))

    const dropDesc = document.getElementById('drop-desc')
    if (dropDesc)
      dropDesc.style.display = ''
  }

  private createAppFromFiles(files: FileList, x: number, y: number): void {
    // Load .js files
    for (let i = 0; i < files.length; ++i) {
      const file = files[i]
      const ext = Util.getExt(file.name).toLowerCase()
      if (ext !== 'js')
        continue
      const jsApp = new JsApp(this.wndMgr, {
        title: file.name,
        centerX: x,
        centerY: y,
        onClosed: (app) => {
          this.removeApp(app)
        },
      })
      jsApp.setFile(file)
      this.apps.push(jsApp)
    }

    const kTargetExts = ['nes']

    // Unzip and flatten.
    const promises = new Array<Promise<any>>()
    for (let i = 0; i < files.length; ++i) {
      const file = files[i]
      let promise: Promise<any>|null = null
      const ext = Util.getExt(file.name).toLowerCase()
      if (ext === 'js') {
        // Skip, because already processed.
      } else if (ext === 'zip') {
        promise = DomUtil.loadFile(file)
          .then(binary => {
            const zip = new JSZip()
            return zip.loadAsync(binary)
          })
          .then((loadedZip: JSZip) => {
            for (let fileName of Object.keys(loadedZip.files)) {
              const ext2 = Util.getExt(fileName).toLowerCase()
              if (kTargetExts.indexOf(ext2) >= 0) {
                return loadedZip.files[fileName].async('uint8array')
                  .then(unzipped => Promise.resolve({type: ext2, binary: unzipped, fileName}))
              }
            }
            return Promise.reject(`No .nes file included: ${file.name}`)
          })
      } else if (kTargetExts.indexOf(ext) >= 0) {
        promise = DomUtil.loadFile(file)
          .then(binary => Promise.resolve({type: ext, binary, fileName: file.name}))
      } else {
        promise = Promise.reject(`Unsupported file: ${file.name}`)
      }
      if (promise)
        promises.push(promise)
    }
    Promise.all(promises)
      .then(results => {
        const typeMap: {[key: string]: Array<any>} = {}
        results.forEach(result => {
          if (!typeMap[result.type])
            typeMap[result.type] = []
          typeMap[result.type].push(result)
        })
        // Load .nes files.
        if (typeMap.nes) {
          typeMap.nes.forEach(file => {
            this.createAppFromRom(file.binary, file.fileName, x, y)
            x += 16
            y += 16
          })
        }
      })
      .catch((e: Error) => {
        this.wndMgr.showSnackbar(e.toString())
      })
  }

  private createAppFromRom(romData: Uint8Array, name: string, x: number, y: number): void {
    const m = name.match(/^(.*?)\s*\(.*\)\.\w*$/)
    const title = m ? m[1] : name
    const option = {
      title,
      centerX: x,
      centerY: y,
      onClosed: (app2) => {
        this.removeApp(app2)
      },
    }
    const app = new App(this.wndMgr, option)
    const result = app.loadRom(romData)
    if (result !== true) {
      this.wndMgr.showSnackbar(`${name}: ${result}`)
      app.close()
      return
    }
    app.setVolume(this.volume)
    this.apps.push(app)
  }

  private removeApp(app: App): void {
    const index = this.apps.indexOf(app)
    if (index >= 0)
      this.apps.splice(index, 1)
  }

  private setUpGamePadLink(): void {
    const gamepadText = document.getElementById('gamepad')
    if (gamepadText == null)
      return

    if (!GamepadManager.isSupported()) {
      gamepadText.style.display = 'none'
      return
    }

    gamepadText.addEventListener('click', () => {
      const gamepadWnd = new GamepadWnd(this.wndMgr)
      this.wndMgr.add(gamepadWnd)
    })
  }

  private setUpVolumeLink(): void {
    const volumeText = document.getElementById('volume')
    const sliderContainer = document.getElementById('volume-slider-container')
    const slider = document.getElementById('volume-slider')
    if (volumeText == null || sliderContainer == null || slider == null)
      return

    let dragging = false
    let leave = false
    sliderContainer.addEventListener('mousedown', (event) => {
      dragging = true
      const sliderHeight = (slider.parentNode as HTMLElement).getBoundingClientRect().height
      const updateSlider = (event2) => {
        const [, y] = DomUtil.getMousePosIn(event2, slider.parentNode as HTMLElement)
        const height = Util.clamp(sliderHeight - y, 0, sliderHeight)
        slider.style.height = `${height}px`
        this.volume = height / sliderHeight
        this.apps.forEach(app => {
          app.setVolume(this.volume)
        })
      }
      DomUtil.setMouseDragListener({
        move: updateSlider,
        up: (_event2) => {
          dragging = false
          if (leave)
            hideSlider()
          this.volume = Math.round(this.volume * 100) / 100
          StorageUtil.put(KEY_VOLUME, this.volume)
        },
      })
      updateSlider(event)
    })

    const showSlider = () => {
      const prect = volumeText.getBoundingClientRect() as DOMRect
      const w = parseInt(sliderContainer.style.width || '0', 10)
      const h = parseInt(sliderContainer.style.height || '0', 10)
      DomUtil.setStyles(sliderContainer, {
        display: 'inherit',
        top: `${Math.round(prect.y - h)}px`,
        left: `${Math.round(prect.x + (prect.width - w) / 2)}px`,
      })
      const sliderHeight = (slider.parentNode as HTMLElement).getBoundingClientRect().height
      slider.style.height = `${this.volume * sliderHeight}px`
    }
    const hideSlider = () => {
      DomUtil.setStyles(sliderContainer, {
        display: 'none',
      })
    }
    const toggleSlider = () => {
      if (sliderContainer.style.display === 'none')
        showSlider()
      else
        hideSlider()
    }

    volumeText.addEventListener('click', toggleSlider)
    volumeText.addEventListener('mouseenter', () => {
      showSlider()
    })

    sliderContainer.addEventListener('mouseenter', (_event) => {
      leave = false
    })
    sliderContainer.addEventListener('mouseleave', (_event) => {
      leave = true
      if (!dragging)
        hideSlider()
    })
  }

  private setUpOpenRomLink(): void {
    const romFile = document.getElementById('rom-file') as HTMLInputElement
    romFile.addEventListener('change', () => {
      if (!romFile.value)
        return
      const fileList = romFile.files
      if (!fileList)
        return
      this.createAppFromFiles(fileList, 0, 0)

      // Clear.
      romFile.value = ''
    })
  }

  private setUpBlur(): void {
    window.addEventListener('blur', () => {
      this.apps.forEach(app => { app.onBlur() })
    })
    window.addEventListener('focus', () => {
      this.apps.forEach(app => { app.onFocus() })
    })
  }
}

window.addEventListener('load', () => {
  StorageUtil.setKeyPrefix('nesemu:')
  GamepadManager.setUp()

  const root = document.getElementById('nesroot')
  if (root != null)
    new Main(root)
})

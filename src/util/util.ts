import * as JSZip from 'jszip'

export default class Util {
  public static hex(x: number, order: number = 2): string {
    const s = x.toString(16)
    const dif = s.length - order
    if (dif > 0)
      return s.substring(dif)
    if (dif === 0)
      return s
    const zeros = '0000000'
    return zeros.substring(zeros.length + dif) + s
  }

  public static clamp(x: number, min: number, max: number): number {
    return x < min ? min : x > max ? max : x
  }

  public static clearCanvas(canvas: HTMLCanvasElement): void {
    const context = canvas.getContext('2d')
    context.strokeStyle = ''
    context.fillStyle = `rgb(64,64,64)`
    context.fillRect(0, 0, canvas.width, canvas.height)
  }

  public static removeAllChildren(element: HTMLElement): void {
    for (let child of element.childNodes)
      element.removeChild(child)
  }

  public static loadFile(file: File): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = function(e) {
        const binary = new Uint8Array((e.target as any).result)
        resolve(binary)
      }
      reader.onerror = function(e) {
        reject(reader.error)
      }
      reader.readAsArrayBuffer(file)
    })
  }

  public static unzip(zipped: Uint8Array): Promise<any> {
    const zip = new JSZip()
    return zip.loadAsync(zipped)
      .then((loadedZip: JSZip) => {
        for (let fileName of Object.keys(loadedZip.files)) {
          if (Util.getExt(fileName).toLowerCase() === 'nes') {
            return loadedZip.files[fileName].async('uint8array')
              .then(unzipped => Promise.resolve({unzipped, fileName}))
          }
        }
        return Promise.reject('No .nes file included')
      })
  }

  public static getExt(fileName: string): string {
    const index = fileName.lastIndexOf('.')
    if (index >= 0)
      return fileName.slice(index + 1)
    return ''
  }

  public static handleFileDrop(dropZone: HTMLElement,
                               onDropped: (file: File, x: number, y: number) => void): void
  {
    function onDrop(event) {
      event.stopPropagation()
      event.preventDefault()
      const files = event.dataTransfer.files
      if (files.length > 0) {
        for (let i = 0; i < files.length; ++i) {
          const file = files[i]
          onDropped(file, event.pageX, event.pageY)
        }
      }
      return false
    }

    function onDragOver(event) {
      event.stopPropagation()
      event.preventDefault()
      event.dataTransfer.dropEffect = 'copy'
      return false
    }

    dropZone.addEventListener('dragover', onDragOver, false)
    dropZone.addEventListener('drop', onDrop, false)
  }
}
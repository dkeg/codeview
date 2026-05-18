// Run with: ./node_modules/.bin/electron gen-icon.js
const { app, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')

const SIZES = [16, 32, 64, 128, 256, 512, 1024]
const ICONSET = path.join(__dirname, 'assets', 'codeview.iconset')

app.whenReady().then(async () => {
  if (fs.existsSync(ICONSET)) fs.rmSync(ICONSET, { recursive: true })
  fs.mkdirSync(ICONSET)

  const win = new BrowserWindow({
    width: 1024, height: 1024,
    show: false,
    webPreferences: { offscreen: true }
  })

  await win.loadFile(path.join(__dirname, 'assets', 'icon-dark.html'))
  await new Promise(r => setTimeout(r, 500))

  const full = await win.webContents.capturePage()
  const fullPng = full.toPNG()

  for (const size of SIZES) {
    const img = full.resize({ width: size, height: size, quality: 'best' })
    fs.writeFileSync(path.join(ICONSET, `icon_${size}x${size}.png`), img.toPNG())
    if (size <= 512) {
      const img2 = full.resize({ width: size * 2, height: size * 2, quality: 'best' })
      fs.writeFileSync(path.join(ICONSET, `icon_${size}x${size}@2x.png`), img2.toPNG())
    }
  }

  win.close()

  const out = path.join(__dirname, 'assets', 'icon-dark.icns')
  try {
    execSync(`iconutil -c icns "${ICONSET}" -o "${out}"`)
    console.log('Generated:', out)
  } catch (e) {
    console.error('iconutil failed:', e.message)
  }

  fs.rmSync(ICONSET, { recursive: true })
  app.quit()
})

/* globals escHtml */
'use strict';

window.Icons = {
  iconForPath(name) {
    if (/\.json$/i.test(name)) return this.iconJSON()
    if (/\.(html?|jsx?)$/i.test(name)) return this.iconCode()
    if (/\.(ts|tsx)$/i.test(name)) return this.iconCode()
    if (/\.py$/i.test(name)) return this.iconCode()
    if (/\.ya?ml$/i.test(name)) return this.iconCode()
    if (/\.(sh|bash|zsh)$/i.test(name)) return this.iconCode()
    if (/\.txt$/i.test(name)) return this.iconText()
    if (/\.(md|markdown)$/i.test(name)) return this.iconMD()
    return this.iconFile()
  },

  iconForType(type) {
    if (type === 'json') return this.iconJSON()
    if (type === 'markdown') return this.iconMD()
    if (type === 'text') return this.iconText()
    return this.iconCode()
  },

  iconMD() {
    return `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M14.85 3H1.15C.52 3 0 3.52 0 4.15v7.69C0 12.48.52 13 1.15 13h13.69c.64 0 1.15-.52 1.15-1.15V4.15C16 3.52 15.48 3 14.85 3zM9 11H7.5V8.25L6 10l-1.5-1.75V11H3V5h1.5l1.5 2 1.5-2H9v6zm4-1.5l-1.5 1.5-1.5-1.5L11 9V5h1.5v4l.5-.5z"/></svg>`
  },

  iconJSON() {
    return `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M2.74 1c-.866 0-1.5.7-1.5 1.5v2c0 .55-.45 1-1 1H0v1h.24c.55 0 1 .45 1 1v2c0 .8.634 1.5 1.5 1.5H3.5v-1H2.74c-.3 0-.5-.2-.5-.5V8.5c0-.67-.38-1.25-.93-1.5.55-.25.93-.83.93-1.5v-2c0-.3.2-.5.5-.5H3.5V2H2.74zm10.52 0H12v1h.76c.3 0 .5.2.5.5v2c0 .67.38 1.25.93 1.5-.55.25-.93.83-.93 1.5v1.5c0 .3-.2.5-.5.5H12v1h1.26c.866 0 1.5-.7 1.5-1.5v-2c0-.55.45-1 1-1H16v-1h-.24c-.55 0-1-.45-1-1v-2C14.76 1.7 14.126 1 13.26 1zM6 6.5a.5.5 0 110 1 .5.5 0 010-1zM8 6.5a.5.5 0 110 1 .5.5 0 010-1zM10 6.5a.5.5 0 110 1 .5.5 0 010-1z"/></svg>`
  },

  iconCode() {
    return `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4.72 3.22a.75.75 0 011.06 1.06L2.06 8l3.72 3.72a.75.75 0 11-1.06 1.06L.47 8.53a.75.75 0 010-1.06l4.25-4.25zm6.56 0a.75.75 0 10-1.06 1.06L13.94 8l-3.72 3.72a.75.75 0 101.06 1.06l4.25-4.25a.75.75 0 000-1.06L11.28 3.22z"/></svg>`
  },

  iconText() {
    return `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.5 2.75a.25.25 0 01.25-.25h12.5a.25.25 0 01.25.25v1.5a.75.75 0 001.5 0V2.75A1.75 1.75 0 0014.25 1H1.75A1.75 1.75 0 000 2.75v1.5a.75.75 0 001.5 0V2.75zM7.25 7.5a.75.75 0 011.5 0v6a.75.75 0 01-1.5 0v-6z"/></svg>`
  },

  iconFolder() {
    return `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.75 1A1.75 1.75 0 000 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0016 13.25v-8.5A1.75 1.75 0 0014.25 3H7.5L5.75 1H1.75zM1.5 2.75a.25.25 0 01.25-.25H5.5l1.75 2H14.25a.25.25 0 01.25.25v8.5a.25.25 0 01-.25.25H1.75a.25.25 0 01-.25-.25V2.75z"/></svg>`
  },

  iconFile() {
    return `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3.75 1.5a.25.25 0 00-.25.25v11.5c0 .138.112.25.25.25h8.5a.25.25 0 00.25-.25V6H9.75A1.75 1.75 0 018 4.25V1.5H3.75zm5.75.56v2.19c0 .138.112.25.25.25h2.19L9.5 2.06zM2 1.75C2 .784 2.784 0 3.75 0h5.086c.464 0 .909.184 1.237.513l3.414 3.414c.329.328.513.773.513 1.237v8.086A1.75 1.75 0 0112.25 15h-8.5A1.75 1.75 0 012 13.25V1.75z"/></svg>`
  }
};

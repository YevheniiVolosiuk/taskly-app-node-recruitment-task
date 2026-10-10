import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom has no modal dialog API; the design-system Drawer opens and closes through it.
HTMLDialogElement.prototype.showModal = function () {
  this.open = true
}
HTMLDialogElement.prototype.close = function () {
  this.open = false
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

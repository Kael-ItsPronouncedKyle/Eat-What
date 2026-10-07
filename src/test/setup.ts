import '@testing-library/jest-dom/vitest'
import 'fake-indexeddb/auto'

// jsdom has no <dialog> show/showModal/close. The shared Sheet calls them, so give every test a minimal polyfill.
const dialogProto = globalThis.HTMLDialogElement?.prototype as (HTMLDialogElement & { close?: () => void }) | undefined
if (dialogProto && typeof dialogProto.showModal !== 'function') {
  dialogProto.show = function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  dialogProto.showModal = function (this: HTMLDialogElement) { this.setAttribute('open', '') }
  dialogProto.close = function (this: HTMLDialogElement) { this.removeAttribute('open') }
}

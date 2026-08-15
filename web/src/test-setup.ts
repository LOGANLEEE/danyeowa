import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

/* jsdom does not implement <dialog>: showModal/close are undefined, so any component using the
   native modal throws here while working fine in a browser. These stand-ins only track the
   `open` attribute — focus trapping, Esc and backdrop dismissal are real browser behaviour and
   are covered by the e2e suite, not by this shim. */
if (typeof HTMLDialogElement !== "undefined" && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  };
}

afterEach(() => {
  cleanup();
});

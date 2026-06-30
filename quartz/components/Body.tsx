import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

// ─────────────────────────────────────────────────────────────────────────────
// Ko-fi "Support me" floating button.
//
// SET THIS to your Ko-fi page name — the part after ko-fi.com/ in your profile
// URL. e.g. if your page is https://ko-fi.com/isaiahbarker, put "isaiahbarker".
// While it is left as "" the button is hidden entirely (safe to ship empty).
const KOFI_NAME = ""
// ─────────────────────────────────────────────────────────────────────────────

const Body: QuartzComponent = ({ children }: QuartzComponentProps) => {
  return (
    <div id="quartz-body">
      {children}
      {KOFI_NAME && (
        <a
          class="kofi-fab no-popover"
          href={`https://ko-fi.com/${KOFI_NAME}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Support me on Ko-fi"
          data-no-popover="true"
        >
          <span class="kofi-fab-cup" aria-hidden="true">
            ☕
          </span>
          <span class="kofi-fab-text">Support me</span>
        </a>
      )}
    </div>
  )
}

export default (() => Body) satisfies QuartzComponentConstructor

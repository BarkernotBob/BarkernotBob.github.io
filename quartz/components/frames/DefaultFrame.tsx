import { PageFrame, PageFrameProps } from "./types"

// Site sections shown in the top navigation bar. Active state is derived from
// the current page slug.
const NAV_ITEMS: { label: string; href: string; match: string }[] = [
  { label: "Notes", href: "/notes", match: "notes" },
  { label: "Tools", href: "/tools", match: "tools" },
  { label: "Games", href: "/games", match: "games" },
  { label: "YouTube", href: "/youtube", match: "youtube" },
]

/**
 * The default page frame — a full-width top navigation bar (wordmark + section
 * links + search + theme), then a three-column layout with left sidebar, center
 * content (header + body + afterBody), and right sidebar, followed by a footer.
 */
export const DefaultFrame: PageFrame = {
  name: "default",
  render({
    componentData,
    header,
    beforeBody,
    pageBody: Content,
    afterBody,
    left,
    right,
    footer: Footer,
  }: PageFrameProps) {
    const slug = (componentData.fileData.slug ?? "") as string
    const isActive = (match: string) => slug === match || slug.startsWith(`${match}/`)

    return (
      <>
        <div class="topbar">
          <div class="topbar-inner">
            {header.map((HeaderComponent) => (
              <HeaderComponent {...componentData} />
            ))}
            <nav class="rr-nav">
              {NAV_ITEMS.map((item) => (
                <a href={item.href} class={`rr-nav-link${isActive(item.match) ? " active" : ""}`}>
                  {item.label}
                </a>
              ))}
            </nav>
          </div>
        </div>
        <div class="left sidebar">
          {left.map((BodyComponent) => (
            <BodyComponent {...componentData} />
          ))}
        </div>
        <div class="center">
          <div class="page-header">
            <div class="popover-hint">
              {beforeBody.map((BodyComponent) => (
                <BodyComponent {...componentData} />
              ))}
            </div>
          </div>
          <Content {...componentData} />
          <hr />
          <div class="page-footer">
            {afterBody.map((BodyComponent) => (
              <BodyComponent {...componentData} />
            ))}
          </div>
        </div>
        <div class="right sidebar">
          {right.map((BodyComponent) => (
            <BodyComponent {...componentData} />
          ))}
        </div>
        <Footer {...componentData} />
      </>
    )
  },
}

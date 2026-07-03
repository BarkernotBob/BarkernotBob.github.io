import { Action, ActionPanel, Form, Icon, popToRoot, showToast, Toast } from "@raycast/api"
import { useState } from "react"
import { bulkAddContacts, parseContacts } from "./teams"

type Props = {
  /** Called after a successful import so a parent list can refresh. */
  onImported?: () => void
}

export default function ImportPeople(props: Props) {
  const { onImported } = props
  const [raw, setRaw] = useState("")

  const parsed = parseContacts(raw)
  const preview = parsed
    .slice(0, 8)
    .map((p) => (p.name === p.email ? p.email : `${p.name} — ${p.email}`))
    .join("\n")

  async function handleSubmit(values: { people: string }) {
    const people = parseContacts(values.people)
    if (people.length === 0) {
      await showToast({ style: Toast.Style.Failure, title: "No email addresses found" })
      return
    }
    const { added, skipped } = await bulkAddContacts(people)
    await showToast({
      style: Toast.Style.Success,
      title: `Added ${added} ${added === 1 ? "person" : "people"}`,
      message: skipped > 0 ? `${skipped} already in your list` : undefined,
    })
    onImported?.()
    await popToRoot()
  }

  return (
    <Form
      navigationTitle="Import People"
      actions={
        <ActionPanel>
          <Action.SubmitForm icon={Icon.AddPerson} title="Import" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextArea
        id="people"
        title="Paste People"
        placeholder={
          "Paste emails here — any mix of:\n" +
          "alex@contoso.com, sam@contoso.com\n" +
          "Jordan Lee <jordan@contoso.com>\n" +
          "one email per line also works"
        }
        info="Works with plain emails (comma / newline separated), 'Name <email>' address-book format, and pasted spreadsheet columns. Each person becomes a one-on-one chat."
        value={raw}
        onChange={setRaw}
      />
      <Form.Description
        title="Detected"
        text={
          parsed.length === 0
            ? "No email addresses found yet."
            : `${parsed.length} ${parsed.length === 1 ? "person" : "people"}:\n${preview}${
                parsed.length > 8 ? `\n…and ${parsed.length - 8} more` : ""
              }`
        }
      />
      <Form.Description text="People already saved are skipped automatically, so re-pasting is safe." />
    </Form>
  )
}

// A folder path field with a Browse button. Browse opens a small list of the
// folders under the person's home folder, read through the app backend
// (workspaces.browse): the page runs in Kiro Crew's iframe, which has no
// native folder dialog. The typed path stays; a pick fills it in.
import { useState } from 'react'
import { Btn } from './ui/Btn'
import { Input } from './ui/Input'
import { errorMessage, type FolderListing, type WorkspaceClient } from './workspace-api'
import { ArrowUp, Folder, FolderOpen } from './icons.ts'
import Badge from './ui/Badge.tsx'
import { Hint } from './ui/Hint'
import { Row } from './ui/Row'
import { Box } from './ui/Box'
import { PlainButton } from './ui/Plain'

export function FolderField(props: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  client: WorkspaceClient
  placeholder?: string
  required?: boolean
}) {
  const [listing, setListing] = useState<FolderListing | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const show = async (at?: string) => {
    setLoading(true)
    setError(null)
    try {
      setListing(await props.client.browse(at))
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }
  const toggle = () => {
    if (open) return setOpen(false)
    setOpen(true)
    // Start where the typed path is, when it is in home; else at home.
    const typed = props.value.trim()
    void (async () => {
      if (typed) {
        setLoading(true)
        try {
          setListing(await props.client.browse(typed))
          setError(null)
          setLoading(false)
          return
        } catch {
          // Not a folder in home: start at home instead.
        }
      }
      await show()
    })()
  }
  const pick = (path: string) => {
    props.onChange(path)
    void show(path)
  }
  return (
    <Box flex flexCol gap="1" size="sm" data-folder-field={props.id}>
      <label htmlFor={props.id}>{props.label}</label>
      <Row gap={2} wrap={false}>
        <Input
          id={props.id}
          value={props.value}
          placeholder={props.placeholder}
          required={props.required}
          onChange={(event) => props.onChange(event.target.value)}
          css-flex="1"
          css-min-width="0"
        />
        <Btn
          type="button"
          data-folder-browse
          aria-expanded={open}
          aria-controls={`${props.id}-browser`}
          onClick={toggle}
          css-display="inline-flex"
          css-align-items="center"
          css-gap="6"
          css-flex-shrink="0"
        >
          <FolderOpen size={14} aria-hidden="true" /> Browse
        </Btn>
      </Row>
      <Hint size="xs">A full path. ~/ means your home folder.</Hint>
      {open && (
        <Box id={`${props.id}-browser`} data-folder-browser css-border-color="border" flex flexCol rounded="base" border="all">
          <Box css-border-color="border" flex items="center" gap="2" border="b" px="2" py="1">
            <Btn
              type="button"
              data-folder-up
              aria-label="Up one folder"
              disabled={!listing?.parent || loading}
              onClick={() => listing?.parent && pick(listing.parent)}
              css-display="inline-flex"
              css-align-items="center"
              css-padding="0-6px"
            >
              <ArrowUp size={14} aria-hidden="true" />
            </Btn>
            <Box as="span" css-overflow-wrap="anywhere" minW0 flex1 size="xs" tone="muted" data-folder-at>
              {listing ? listing.path : 'Loading…'}
            </Box>
            {listing?.workspace && <Badge variant="info">Workspace</Badge>}
          </Box>
          {error && (
            <Box role="alert" as="p" px="2" py="1" size="xs" tone="danger">
              {error}
            </Box>
          )}
          <Box as="ul" css-max-height="200" css-list-style="none" css-margin="0" css-padding-left="0" flex flexCol overflow="y-auto" py="1" aria-label="Folders" data-folder-list>
            {listing && listing.folders.length === 0 && (
              <Box as="li" px="2" py="1" size="xs" tone="muted">
                No folders here.
              </Box>
            )}
            {listing?.folders.map((folder) => (
              <li key={folder.path}>
                <PlainButton
                  type="button"
                  data-folder={folder.name}
                  onClick={() => pick(folder.path)}
                  css-background="none"
                  css-border="0"
                  css-color="text"
                  css-cursor="pointer"
                  flex
                  wFull
                  items="center"
                  gap="2"
                  px="2"
                  py="1"
                  align="left"
                  size="sm"
                >
                  <Folder size={14} aria-hidden="true" style={{ color: 'var(--muted)', flexShrink: 0 }} />
                  <Box as="span" minW0 flex1 truncate>
                    {folder.name}
                  </Box>
                  {folder.workspace && <Badge variant="info">Workspace</Badge>}
                </PlainButton>
              </li>
            ))}
            {listing?.truncated && (
              <Box as="li" px="2" py="1" size="xs" tone="muted">
                Only the first 500 folders show. Type the rest of the path.
              </Box>
            )}
          </Box>
          <Box css-border-color="border" flex justify="end" border="t" px="2" py="1">
            <Btn type="button" data-folder-done onClick={() => setOpen(false)}>
              Use this folder
            </Btn>
          </Box>
        </Box>
      )}
    </Box>
  )
}

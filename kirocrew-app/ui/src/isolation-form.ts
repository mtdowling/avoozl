// The Isolation panel's form (Settings > Repository setup): how a
// repository's checks run. It mirrors the `isolation` setting the backend
// validates (check-isolation.mjs) and writes it with repository.configure.

export interface Isolation {
  run: 'sandbox' | 'container' | 'unconfined'
  image?: string
  network: 'off' | 'on'
  readable?: string[]
  writable?: string[]
  prepare?: string[]
}

export interface IsolationForm {
  run: Isolation['run']
  image: string
  network: Isolation['network']
  readable: string
  writable: string
  prepare: string
}

export const RUN_CHOICES: { value: Isolation['run']; label: string; hint: string }[] = [
  { value: 'sandbox', label: 'Sandbox', hint: 'The checks write only their folder, a temp folder, a cache folder and the paths below.' },
  { value: 'container', label: 'Container', hint: 'docker or podman runs the image with the checks folder mounted and no home folder.' },
  { value: 'unconfined', label: 'Not sandboxed', hint: 'The checks run as you, with no isolation. This machine must allow it.' },
]

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

export function isolationForm(value: Partial<Isolation> | null | undefined): IsolationForm {
  return {
    run: value?.run ?? 'sandbox',
    image: value?.image ?? '',
    network: value?.network ?? 'off',
    readable: (value?.readable ?? []).join('\n'),
    writable: (value?.writable ?? []).join('\n'),
    prepare: (value?.prepare ?? []).join(' '),
  }
}

// What is wrong with the form, or null. The backend checks again.
export function isolationProblem(form: IsolationForm): string | null {
  if (form.run === 'container' && !form.image.trim()) return 'Name the container image.'
  if (/\s/.test(form.image.trim())) return 'The image is one name, such as node:22.'
  for (const path of [...lines(form.readable), ...lines(form.writable)]) if (!path.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(path)) return `${path} is not an absolute path.`
  return null
}

// The setting the form writes.
export function isolationInput(form: IsolationForm): Isolation {
  const prepare = form.prepare.trim().split(/\s+/).filter(Boolean),
    readable = lines(form.readable),
    writable = lines(form.writable)
  return {
    run: form.run,
    ...(form.run === 'container' ? { image: form.image.trim() } : {}),
    network: form.network,
    ...(readable.length ? { readable } : {}),
    ...(writable.length ? { writable } : {}),
    ...(prepare.length ? { prepare } : {}),
  }
}

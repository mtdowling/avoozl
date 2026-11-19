// The Isolation panel's form (Settings > Repository setup): how a
// repository's checks run. It mirrors the `isolation` setting the backend
// validates (check-isolation.mjs) and writes it with repository.configure.

export interface Isolation {
  run: 'sandbox' | 'container' | 'unconfined'
  worker?: 'sandbox' | 'container'
  runtime?: 'apple-container' | 'podman' | 'docker'
  strangers?: 'container' | 'hold' | 'host'
  strangerRoles?: string[]
  image?: string
  network: 'off' | 'on'
  readable?: string[]
  writable?: string[]
  prepare?: string[]
}

export interface IsolationForm {
  run: Isolation['run']
  worker: NonNullable<Isolation['worker']>
  runtime: NonNullable<Isolation['runtime']> | ''
  strangers: NonNullable<Isolation['strangers']>
  strangerRoles: string
  image: string
  network: Isolation['network']
  readable: string
  writable: string
  prepare: string
}

export const RUN_CHOICES: { value: Isolation['run']; label: string; hint: string }[] = [
  { value: 'sandbox', label: 'Sandbox', hint: 'The checks write only their folder, a temp folder, a cache folder and the paths below.' },
  { value: 'container', label: 'Container', hint: 'Apple container, podman or docker runs the image with the checks folder mounted and no home folder.' },
  { value: 'unconfined', label: 'Not sandboxed', hint: 'The checks run as you, with no isolation. This machine must allow it.' },
]

export const WORKER_CHOICES: { value: IsolationForm['worker']; label: string; hint: string }[] = [
  { value: 'sandbox', label: 'Sandbox', hint: "The agent and every command it runs use this machine's sandbox." },
  { value: 'container', label: 'Container', hint: 'The agent stays signed in on this machine; every command it runs goes to a box with no network and no home folder.' },
]

export const RUNTIME_CHOICES: { value: IsolationForm['runtime']; label: string }[] = [
  { value: '', label: 'The first that works here' },
  { value: 'apple-container', label: 'Apple container' },
  { value: 'podman', label: 'podman' },
  { value: 'docker', label: 'docker' },
]

export const STRANGER_CHOICES: { value: IsolationForm['strangers']; label: string; hint: string }[] = [
  { value: 'container', label: 'In a box only', hint: "A stranger's issue or pull request runs only in a box. With no box here it waits in Needs you." },
  { value: 'hold', label: 'Wait for me', hint: 'Work with stranger input waits in Needs you until you start it or change this.' },
  { value: 'host', label: 'On this machine', hint: "A stranger's code runs as you in the host sandbox alone, and every record says so." },
]

// What the page warns while stranger input may run on this machine.
export const STRANGER_HOST_WARNING = "A stranger's code runs as you on this machine, in the host sandbox alone. It can reach what you can reach there."

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

export function isolationForm(value: Partial<Isolation> | null | undefined): IsolationForm {
  return {
    run: value?.run ?? 'sandbox',
    worker: value?.worker ?? 'sandbox',
    runtime: value?.runtime ?? '',
    strangers: value?.strangers ?? 'container',
    strangerRoles: (value?.strangerRoles ?? []).join(', '),
    image: value?.image ?? '',
    network: value?.network ?? 'off',
    readable: (value?.readable ?? []).join('\n'),
    writable: (value?.writable ?? []).join('\n'),
    prepare: (value?.prepare ?? []).join(' '),
  }
}

// What is wrong with the form, or null. The backend checks again.
export function isolationProblem(form: IsolationForm): string | null {
  if ((form.run === 'container' || form.worker === 'container') && !form.image.trim()) return 'Name the container image.'
  if (/\s/.test(form.image.trim())) return 'The image is one name, such as node:22.'
  for (const path of [...lines(form.readable), ...lines(form.writable)]) if (!path.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(path)) return `${path} is not an absolute path.`
  return null
}

// The setting the form writes.
export function isolationInput(form: IsolationForm): Isolation {
  const prepare = form.prepare.trim().split(/\s+/).filter(Boolean),
    readable = lines(form.readable),
    writable = lines(form.writable),
    roles = form.strangerRoles
      .split(/[\s,]+/)
      .map((role) => role.trim())
      .filter(Boolean)
  return {
    run: form.run,
    ...(form.worker !== 'sandbox' ? { worker: form.worker } : {}),
    ...(form.runtime ? { runtime: form.runtime } : {}),
    ...(form.run === 'container' || form.worker === 'container' ? { image: form.image.trim() } : {}),
    ...(form.strangers !== 'container' ? { strangers: form.strangers } : {}),
    ...(roles.length ? { strangerRoles: roles } : {}),
    network: form.network,
    ...(readable.length ? { readable } : {}),
    ...(writable.length ? { writable } : {}),
    ...(prepare.length ? { prepare } : {}),
  }
}

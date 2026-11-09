// Velocity is measured in screen pixels, independent of chart scale and refresh rate.
export function createPanMomentum({
  move,
  end = () => {},
  requestFrame = (cb) => requestAnimationFrame(cb),
  cancelFrame = (id) => cancelAnimationFrame(id),
  now = () => performance.now(),
  reducedMotion = () =>
    globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ??
    false,
} = {}) {
  const decayTime = 240,
    minSpeed = 0.018,
    maxSpeed = 3;
  let samples = [],
    frame = 0,
    running = false,
    previous = 0,
    vx = 0,
    vy = 0;
  function stop() {
    if (frame) cancelFrame(frame);
    frame = 0;
    samples = [];
    const wasRunning = running;
    running = false;
    if (wasRunning) end();
  }
  function sample(x, y, time = now()) {
    if (!Number.isFinite(x + y + time)) return;
    if (samples.length && time < samples.at(-1).time) return;
    if (samples.at(-1)?.time === time) samples.pop();
    samples.push({ x, y, time });
    while (samples.length > 2 && samples[1].time < time - 100) samples.shift();
  }
  function begin(x, y, time = now()) {
    stop();
    sample(x, y, time);
  }
  function step(time) {
    frame = 0;
    if (!running) return;
    const dt = time - previous;
    previous = time;
    if (dt > 100 || dt < 0 || reducedMotion()) {
      stop();
      return;
    }
    const decay = Math.exp(-dt / decayTime),
      distance = decayTime * (1 - decay),
      dx = vx * distance,
      dy = vy * distance;
    const moved = move(dx, dy);
    vx *= decay;
    vy *= decay;
    if (moved === false) {
      stop();
      return;
    }
    if (moved && typeof moved === "object") {
      if (Math.abs(moved.x) < 0.01 && Math.abs(dx) > 0.01) vx = 0;
      if (Math.abs(moved.y) < 0.01 && Math.abs(dy) > 0.01) vy = 0;
    }
    if (Math.hypot(vx, vy) < minSpeed) {
      stop();
      return;
    }
    frame = requestFrame(step);
  }
  function release(time = now()) {
    if (
      reducedMotion() ||
      samples.length < 2 ||
      time - samples.at(-1).time > 70
    ) {
      samples = [];
      return false;
    }
    const first = samples[0],
      last = samples.at(-1),
      dt = last.time - first.time;
    if (dt < 8) {
      samples = [];
      return false;
    }
    vx = (last.x - first.x) / dt;
    vy = (last.y - first.y) / dt;
    const speed = Math.hypot(vx, vy);
    if (speed < 0.08) {
      samples = [];
      return false;
    }
    if (speed > maxSpeed) {
      vx *= maxSpeed / speed;
      vy *= maxSpeed / speed;
    }
    samples = [];
    running = true;
    previous = now();
    frame = requestFrame(step);
    return true;
  }
  const visibility = () => {
    if (document.hidden) stop();
  };
  if (typeof document !== "undefined")
    document.addEventListener("visibilitychange", visibility);
  return {
    begin,
    sample,
    release,
    stop,
    get running() {
      return running;
    },
    destroy() {
      stop();
      if (typeof document !== "undefined")
        document.removeEventListener("visibilitychange", visibility);
    },
  };
}

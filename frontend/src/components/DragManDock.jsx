/**
 * DragManDock — the pictogram man sits in a bubble docked at the bottom-right
 * corner. Grab him and he dangles from your pointer as a TRUE ragdoll: every
 * limb is its own damped pendulum with independent mass, swing frequency and
 * damping, integrated each frame from the pointer's velocity. The arms trail
 * and overshoot on their own timeline, the legs swing slower and heavier, the
 * head lolls — and when you stop, each part settles at its own rate. A target
 * ring under his FEET shows exactly where the report pin lands.
 */
import { useEffect, useRef, useState } from 'react';

// Water layer ids that may exist depending on the basemap style.
const WATER_LAYERS = ['water', 'water-shadow', 'waterway', 'ocean'];

function isOnWater(map, x, y) {
  const layers = WATER_LAYERS.filter((id) => map.getLayer(id));
  if (!layers.length) return false;
  try {
    return map.queryRenderedFeatures([x, y], { layers }).length > 0;
  } catch {
    return false;
  }
}

// Per-limb pendulum parameters — DELIBERATELY different so nothing moves in
// lockstep. f0 = natural frequency (rad/s, higher = stiffer/faster), zeta =
// damping ratio (<1 underdamped → overshoot & wobble), drive = how strongly
// pointer velocity pushes it. Arms swing most & loosest; legs are heavier &
// slower; head is stiff with a small loll; torso barely moves. The left/right
// pairs are intentionally mismatched so the body never looks mirror-symmetric.
// Chain order matters: head carries torso carries arms+legs. Drives are tuned
// for that accumulation — the spine (head/torso) leans modestly, the dangling
// limbs add the loose, overshooting swing on top.
const LIMBS = {
  head:  { f0: 10.5, zeta: 0.32, drive: 0.70, max: 26 },
  torso: { f0: 12.5, zeta: 0.40, drive: 0.45, max: 18 },
  arml:  { f0: 9.0,  zeta: 0.15, drive: 1.05, max: 44 },
  armr:  { f0: 8.1,  zeta: 0.18, drive: 0.95, max: 44 },
  legl:  { f0: 6.4,  zeta: 0.19, drive: 0.70, max: 34 },
  legr:  { f0: 6.8,  zeta: 0.22, drive: 0.62, max: 34 },
};

function Man({ dragging, svgRef }) {
  return (
    <svg
      ref={svgRef}
      className={`man-svg${dragging ? ' dragging' : ''}`}
      viewBox="-26 -70 52 76" width="44" height="64"
    >
      <defs>
        <linearGradient id="man-grad" x1="0" y1="-70" x2="0" y2="2" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3a4150" /><stop offset="1" stopColor="#1d2230" />
        </linearGradient>
      </defs>
      {/* Connected kinematic CHAIN — held at the crown, each joint nested in
          its parent so motion propagates down the body like a real ragdoll:
          head → torso → (arms + legs). A part inherits every ancestor's swing
          and adds its own pendulum on top, so the limbs whip cumulatively. */}
      <g className="joint man-head">
        <g className="joint man-torso">
          {/* legs behind the torso fill */}
          <g className="joint man-leg man-leg-l"><rect x="-7" y="-28" width="6" height="30" rx="3" fill="url(#man-grad)" /></g>
          <g className="joint man-leg man-leg-r"><rect x="1" y="-28" width="6" height="30" rx="3" fill="url(#man-grad)" /></g>
          <path d="M-9 -50 Q0 -53 9 -50 L6 -28 Q0 -25 -6 -28 Z" fill="url(#man-grad)" />
          {/* arms hang from the shoulders, which ride with the torso */}
          <g className="joint man-arm man-arm-l"><rect x="-15" y="-50" width="6" height="26" rx="3" fill="url(#man-grad)" /></g>
          <g className="joint man-arm man-arm-r"><rect x="9" y="-50" width="6" height="26" rx="3" fill="url(#man-grad)" /></g>
        </g>
        <circle cx="0" cy="-58" r="8" fill="url(#man-grad)" />
      </g>
    </svg>
  );
}

// Metro Manila envelope — must match the map's maxBounds. Used to reject a GPS
// fix that falls outside the area we cover.
const METRO = { minLat: 14.25, maxLat: 14.88, minLng: 120.82, maxLng: 121.32 };

export default function DragManDock({ map, onPlace }) {
  const [dragging, setDragging] = useState(false);
  const [pos, setPos] = useState(null); // {x,y} pointer coords while dragging
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState(null); // { text, error } transient hint

  const svgRef = useRef(null);       // floating man's <svg> — we write CSS vars here
  const targetRef = useRef(null);    // foot target ring — the real drop point
  const pointerXRef = useRef(0);     // latest pointer x (read by the physics loop)
  const stateRef = useRef(null);     // per-limb { theta, omega }
  const rafRef = useRef(0);
  const startRef = useRef(null);     // pointer-down point (tap vs drag)
  const movedRef = useRef(false);    // did this gesture travel far enough to be a drag?
  const noticeTimer = useRef(0);

  const flashNotice = (text, error = false) => {
    setNotice({ text, error });
    clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2800);
  };

  // Tap (no real drag) → drop the pin at the user's GPS position.
  const dropAtMyLocation = () => {
    if (!navigator.geolocation) {
      flashNotice('Location not available here', true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        const lat = p.coords.latitude, lng = p.coords.longitude;
        if (lat < METRO.minLat || lat > METRO.maxLat || lng < METRO.minLng || lng > METRO.maxLng) {
          flashNotice("You're outside Metro Manila", true);
          return;
        }
        onPlace?.({ lat, lng });
      },
      () => {
        setLocating(false);
        flashNotice('Could not get your location', true);
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 10000 }
    );
  };

  const startDrag = (e) => {
    e.preventDefault();
    pointerXRef.current = e.clientX;
    startRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    // Fresh, limp ragdoll each grab.
    stateRef.current = Object.fromEntries(
      Object.keys(LIMBS).map((k) => [k, { theta: 0, omega: 0 }])
    );
    setPos({ x: e.clientX, y: e.clientY });
    setDragging(true);
  };

  // ── Physics loop: one independent damped-pendulum integrator per limb ──
  useEffect(() => {
    if (!dragging) return;

    let last = performance.now();
    let prevX = pointerXRef.current;
    let smoothVx = 0;

    const tick = (now) => {
      const dt = Math.min((now - last) / 1000, 0.04); // clamp big gaps (tab blur)
      last = now;

      // Pointer horizontal velocity (px/s), lightly smoothed so it reads as
      // momentum rather than jitter. Zero when the pointer is still → limbs settle.
      const curX = pointerXRef.current;
      const vx = dt > 0 ? (curX - prevX) / dt : 0;
      prevX = curX;
      smoothVx += (vx - smoothVx) * 0.35;

      const svg = svgRef.current;
      const st = stateRef.current;
      if (svg && st) {
        for (const key in LIMBS) {
          const p = LIMBS[key];
          const s = st[key];
          // Damped harmonic oscillator driven by motion:
          //   θ'' = -ω0² θ  - 2ζω0 θ'  +  drive·(-vx)
          // Trailing: moving right (vx>0) swings the lower end left (negative θ).
          const accel =
            -(p.f0 * p.f0) * s.theta
            - 2 * p.zeta * p.f0 * s.omega
            - p.drive * smoothVx;
          s.omega += accel * dt;
          s.theta += s.omega * dt;
          if (s.theta > p.max) { s.theta = p.max; s.omega *= -0.3; }
          else if (s.theta < -p.max) { s.theta = -p.max; s.omega *= -0.3; }
          svg.style.setProperty(`--a-${key}`, `${s.theta.toFixed(2)}deg`);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [dragging]);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (e) => {
      pointerXRef.current = e.clientX;
      if (startRef.current) {
        const dx = e.clientX - startRef.current.x;
        const dy = e.clientY - startRef.current.y;
        if (dx * dx + dy * dy > 100) movedRef.current = true; // >10px = a real drag
      }
      setPos({ x: e.clientX, y: e.clientY });
    };

    const onUp = (e) => {
      setDragging(false);
      setPos(null);

      // A tap (no real drag) → drop where the USER is, via geolocation.
      if (!movedRef.current) {
        dropAtMyLocation();
        return;
      }

      // A drag → drop at the FEET (target ring), not the cursor/head.
      let foot;
      if (targetRef.current) {
        const r = targetRef.current.getBoundingClientRect();
        foot = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      } else {
        foot = { x: e.clientX, y: e.clientY };
      }

      if (map) {
        const rect = map.getContainer().getBoundingClientRect();
        const x = foot.x - rect.left;
        const y = foot.y - rect.top;
        if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) {
          if (isOnWater(map, x, y)) {
            flashNotice("Can't report on water — drop on land", true);
          } else {
            const ll = map.unproject([x, y]);
            onPlace?.({ lat: ll.lat, lng: ll.lng });
          }
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragging, map, onPlace]);

  return (
    <>
      {/* Corner bubble dock */}
      <div className={`man-dock${dragging ? ' empty' : ''}`}>
        <div className="man-bubble" onPointerDown={startDrag} role="button" aria-label="Tap to report at your location, or drag onto the map">
          {!dragging && <Man />}
        </div>
        {locating ? (
          <span className="man-dock-hint man-dock-locating"><span className="man-dock-spinner" />Locating you…</span>
        ) : notice ? (
          <span className={`man-dock-hint${notice.error ? ' man-dock-blocked' : ''}`}>{notice.text}</span>
        ) : !dragging ? (
          <span className="man-dock-hint">Tap for my location · drag to place</span>
        ) : null}
      </div>

      {/* Floating ragdoll — dangles from the pointer, feet (+ target) below */}
      {dragging && pos && (
        <div className="man-float" style={{ left: pos.x, top: pos.y }}>
          <Man dragging svgRef={svgRef} />
          <div className="man-drop-target" ref={targetRef} />
        </div>
      )}
    </>
  );
}

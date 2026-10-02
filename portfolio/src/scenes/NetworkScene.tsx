import { Canvas, useFrame } from '@react-three/fiber';
import { Float, Html } from '@react-three/drei';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';

export type SceneMode = 'network' | 'scattered' | 'converge' | 'ambient';

interface NodeDef { id: string; label: string; color: string }
const NODES: NodeDef[] = [
  { id: 'github', label: 'GitHub', color: '#e2e8f0' },
  { id: 'gmail', label: 'Gmail', color: '#e2e8f0' },
  { id: 'calendar', label: 'Calendar', color: '#e2e8f0' },
  { id: 'agent', label: 'AI Agent', color: '#5b8cff' },
];

/** Target layouts per scene mode. Agent is index 3. */
const LAYOUTS: Record<SceneMode, THREE.Vector3[]> = {
  network: [new THREE.Vector3(-3.0, 1.9, 0), new THREE.Vector3(3.0, 1.7, -0.5), new THREE.Vector3(0.2, -2.6, 0.3), new THREE.Vector3(0, -0.2, 0)],
  scattered: [new THREE.Vector3(-5.5, 2.6, -2), new THREE.Vector3(5.4, 2.2, -3), new THREE.Vector3(1.5, -3.4, -1), new THREE.Vector3(0, -1, -14)],
  converge: [new THREE.Vector3(-0.9, 0.5, 0), new THREE.Vector3(0.9, 0.5, 0), new THREE.Vector3(0, -0.9, 0), new THREE.Vector3(0, 0, 0)],
  ambient: [new THREE.Vector3(-6, 3, -6), new THREE.Vector3(6, 2.5, -7), new THREE.Vector3(2, -4, -6), new THREE.Vector3(-2, 0, -5)],
};

const PARTICLES_PER_EDGE = 14;

function Network({ mode }: { mode: SceneMode }) {
  const positions = useRef(LAYOUTS.network.map((v) => v.clone()));
  const nodeRefs = useRef<Array<THREE.Group | null>>([]);
  const edgeBuffer = useMemo(() => new Float32Array(3 * 2 * 3), []);
  const edges = useRef<THREE.LineSegments>(null);
  const points = useRef<THREE.Points>(null);
  const group = useRef<THREE.Group>(null);
  const edgesVisible = mode === 'network' || mode === 'converge';

  const particleBuffer = useMemo(() => new Float32Array(3 * PARTICLES_PER_EDGE * 3), []);
  const particleOffsets = useMemo(() => Array.from({ length: 3 * PARTICLES_PER_EDGE }, (_, i) => (i % PARTICLES_PER_EDGE) / PARTICLES_PER_EDGE), []);

  useFrame((state, delta) => {
    const targets = LAYOUTS[mode];
    const lerp = 1 - Math.exp(-delta * 2.2);
    positions.current.forEach((p, i) => {
      p.lerp(targets[i]!, lerp);
      const g = nodeRefs.current[i];
      if (g) g.position.copy(p);
    });
    const agent = positions.current[3]!;
    for (let e = 0; e < 3; e++) {
      const from = positions.current[e]!;
      edgeBuffer.set([from.x, from.y, from.z, agent.x, agent.y, agent.z], e * 6);
      for (let k = 0; k < PARTICLES_PER_EDGE; k++) {
        const idx = e * PARTICLES_PER_EDGE + k;
        const t = (particleOffsets[idx]! + state.clock.elapsedTime * 0.18) % 1;
        const base = idx * 3;
        particleBuffer[base] = THREE.MathUtils.lerp(from.x, agent.x, t);
        particleBuffer[base + 1] = THREE.MathUtils.lerp(from.y, agent.y, t) + Math.sin(t * Math.PI) * 0.12;
        particleBuffer[base + 2] = THREE.MathUtils.lerp(from.z, agent.z, t);
      }
    }
    if (edges.current) {
      (edges.current.geometry.attributes['position'] as THREE.BufferAttribute).needsUpdate = true;
      const mat = edges.current.material as THREE.LineBasicMaterial;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, edgesVisible ? 0.35 : 0, lerp);
    }
    if (points.current) {
      (points.current.geometry.attributes['position'] as THREE.BufferAttribute).needsUpdate = true;
      const mat = points.current.material as THREE.PointsMaterial;
      mat.opacity = THREE.MathUtils.lerp(mat.opacity, edgesVisible ? 0.9 : 0, lerp);
    }
    if (group.current) {
      const wide = state.size.width > 1024;
      const targetX = mode === 'network' && wide ? 2.3 : 0;
      const targetY = mode === 'network' && !wide ? -2.2 : 0;
      group.current.position.y = THREE.MathUtils.lerp(group.current.position.y, targetY, lerp);
      group.current.position.x = THREE.MathUtils.lerp(group.current.position.x, targetX, lerp);
      group.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.12) * 0.12;
      group.current.rotation.x = Math.cos(state.clock.elapsedTime * 0.1) * 0.05;
    }
  });

  return (
    <group ref={group}>
      <lineSegments ref={edges}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[edgeBuffer, 3]} />
        </bufferGeometry>
        <lineBasicMaterial color="#5b8cff" transparent opacity={0} />
      </lineSegments>
      <points ref={points}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[particleBuffer, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.07} color="#9db7ff" transparent opacity={0} sizeAttenuation depthWrite={false} />
      </points>
      {NODES.map((n, i) => (
        <group key={n.id} ref={(r) => { nodeRefs.current[i] = r; }}>
          <Float speed={1.4} rotationIntensity={0.2} floatIntensity={0.5}>
            <mesh>
              <sphereGeometry args={[i === 3 ? 0.42 : 0.26, 48, 48]} />
              <meshStandardMaterial color={n.color} emissive={i === 3 ? '#2a56d6' : '#1b2538'} emissiveIntensity={i === 3 ? 1.2 : 0.4} roughness={0.35} metalness={0.4} />
            </mesh>
            {i === 3 && (
              <mesh>
                <sphereGeometry args={[0.8, 32, 32]} />
                <meshBasicMaterial color="#5b8cff" transparent opacity={0.08} />
              </mesh>
            )}
            <Html position={[0, i === 3 ? -0.8 : -0.6, 0]} center zIndexRange={[1, 0]} style={{ pointerEvents: 'none', display: mode === 'ambient' ? 'none' : 'block', transition: 'opacity .5s' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.25em', color: i === 3 ? '#9db7ff' : '#94a3b8', whiteSpace: 'nowrap' }}>{n.label.toUpperCase()}</span>
            </Html>
          </Float>
        </group>
      ))}
    </group>
  );
}

function Stars() {
  const positions = useMemo(() => {
    const arr = new Float32Array(600 * 3);
    for (let i = 0; i < arr.length; i++) arr[i] = (Math.random() - 0.5) * 40;
    return arr;
  }, []);
  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.03} color="#64748b" transparent opacity={0.5} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/** Persistent background canvas; `mode` is derived from the active slide. */
export function NetworkScene({ mode, dim }: { mode: SceneMode; dim: boolean }) {
  const narrow = useNarrow();
  return (
    <div className="pointer-events-none fixed inset-0 -z-0 transition-opacity duration-700" style={{ opacity: dim ? 0.35 : narrow ? 0.45 : 1 }} aria-hidden>
      <Canvas camera={{ position: [0, 0, 9], fov: 45 }} dpr={[1, 1.8]} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 6, 5]} intensity={1.4} />
        <pointLight position={[0, 0, 2]} intensity={2} color="#5b8cff" distance={8} />
        <Stars />
        <Network mode={mode} />
      </Canvas>
    </div>
  );
}

function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() => (typeof window !== 'undefined' ? window.innerWidth <= 1024 : false));
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1024px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

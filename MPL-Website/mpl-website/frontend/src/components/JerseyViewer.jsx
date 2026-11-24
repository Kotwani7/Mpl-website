import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const sourceBounds = { minX: -1.28, maxX: 1.28, minY: -1.47, maxY: 1.52 };

function makePlaceholderTexture(team, side) {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 760;
  const ctx = canvas.getContext('2d');
  const base = team.secondaryColor || '#17130d';
  const accent = team.color || '#d9a21b';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, `${accent}32`);
  gradient.addColorStop(0.48, '#0c0b0a');
  gradient.addColorStop(1, `${accent}18`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = `${accent}38`;
  ctx.lineWidth = 2;
  for (let x = -600; x < 1200; x += 112) {
    ctx.save(); ctx.translate(x, 0); ctx.rotate(0.52); ctx.strokeRect(0, 0, 14, 1100); ctx.restore();
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f5e8c9';
  ctx.font = '800 34px Arial, sans-serif';
  ctx.fillText((team.shortName || team.name || 'MPL').toUpperCase(), 320, 205);
  ctx.strokeStyle = '#080808';
  ctx.fillStyle = accent;
  ctx.lineWidth = 15;
  ctx.font = '900 190px Arial, sans-serif';
  ctx.strokeText('00', 320, 435);
  ctx.fillText('00', 320, 435);
  ctx.fillStyle = '#f2e7d0';
  ctx.font = '900 28px Arial, sans-serif';
  ctx.fillText('TEAM KIT', 320, 548);
  ctx.fillStyle = '#dbb95f';
  ctx.font = '700 21px Arial, sans-serif';
  ctx.fillText('OFFICIAL ARTWORK', 320, 590);
  ctx.fillStyle = '#9d9076';
  ctx.font = '700 17px Arial, sans-serif';
  ctx.fillText(`${side.toUpperCase()} NEEDED`, 320, 630);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function sampleBodyProfile(y) {
  const profile = [
    [-1.47, 0.59, 0.175], [-1.22, 0.61, 0.185], [-0.78, 0.59, 0.19],
    [-0.3, 0.6, 0.2], [0.2, 0.63, 0.21], [0.57, 0.68, 0.22],
    [0.82, 0.75, 0.23], [0.99, 0.7, 0.21], [1.1, 0.48, 0.19], [1.2, 0.285, 0.165]
  ];
  for (let index = 0; index < profile.length - 1; index += 1) {
    const [y0, width0, depth0] = profile[index];
    const [y1, width1, depth1] = profile[index + 1];
    if (y <= y1) {
      const t = THREE.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1);
      const smooth = t * t * (3 - 2 * t);
      return [THREE.MathUtils.lerp(width0, width1, smooth), THREE.MathUtils.lerp(depth0, depth1, smooth)];
    }
  }
  return [0.285, 0.165];
}

function createTorsoPanel(back = false) {
  const rows = 52;
  const columns = 48;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let row = 0; row <= rows; row += 1) {
    const progress = row / rows;
    const baseY = THREE.MathUtils.lerp(sourceBounds.minY, 1.2, progress);
    for (let column = 0; column <= columns; column += 1) {
      const across = column / columns;
      const theta = back ? Math.PI / 2 + across * Math.PI : -Math.PI / 2 + across * Math.PI;
      const [width, depth] = sampleBodyProfile(baseY);
      const foldEnvelope = Math.sin(progress * Math.PI) * Math.sin(across * Math.PI);
      const ripple = foldEnvelope * (Math.sin(baseY * 9 + theta * 5) * 0.009 + Math.sin(baseY * 15 - theta * 7) * 0.004);
      const x = (width + ripple) * Math.sin(theta);
      const y = baseY + Math.sin(theta * 5 + baseY * 8) * foldEnvelope * 0.0025;
      const z = (depth + ripple) * Math.cos(theta) + Math.cos(theta) * Math.sin(baseY * 7 + theta * 4) * foldEnvelope * 0.004;
      positions.push(x, y, z);
      const projectedU = (x - sourceBounds.minX) / (sourceBounds.maxX - sourceBounds.minX);
      const v = (y - sourceBounds.minY) / (sourceBounds.maxY - sourceBounds.minY);
      uvs.push(back ? 1 - projectedU : projectedU, v);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function sleevePoint(side, progress, angle) {
  const x = side * (0.49 + progress * 0.69);
  const y = 1.01 - progress * 0.6 + Math.sin(progress * Math.PI) * 0.018;
  const radius = 0.29 - progress * 0.065;
  const normalX = side * 0.66;
  const normalY = 0.75;
  const radial = radius + Math.sin(progress * 28 + angle * 4) * 0.006 * (0.3 + progress * 0.7);
  return [
    x + radial * Math.cos(angle) * normalX,
    y + radial * Math.cos(angle) * normalY,
    radial * Math.sin(angle)
  ];
}

function createSleevePanel(side, back = false) {
  const rows = 24;
  const columns = 24;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let row = 0; row <= rows; row += 1) {
    const progress = row / rows;
    for (let column = 0; column <= columns; column += 1) {
      const across = column / columns;
      const angle = (back ? Math.PI : 0) + across * Math.PI;
      const [x, y, z] = sleevePoint(side, progress, angle);
      positions.push(x, y, z);
      const projectedU = (x - sourceBounds.minX) / (sourceBounds.maxX - sourceBounds.minX);
      const v = (y - sourceBounds.minY) / (sourceBounds.maxY - sourceBounds.minY);
      uvs.push(back ? 1 - projectedU : projectedU, v);
    }
  }
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const a = row * (columns + 1) + column;
      const b = a + columns + 1;
      indices.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function OrbitControlRig({ controlsRef }) {
  const { camera, gl } = useThree();
  useEffect(() => {
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.075;
    controls.enablePan = false;
    controls.minDistance = 3.45;
    controls.maxDistance = 8;
    controls.minPolarAngle = 0.32;
    controls.maxPolarAngle = Math.PI - 0.32;
    controls.target.set(0, 0, 0);
    controls.update();
    controlsRef.current = controls;
    return () => { controlsRef.current = null; controls.dispose(); };
  }, [camera, gl, controlsRef]);
  useFrame(() => controlsRef.current?.update());
  return null;
}

function CameraDirector({ view, resetKey, controlsRef }) {
  const { camera } = useThree();
  const destination = useRef(new THREE.Vector3(0, 0.06, 5.05));
  const moving = useRef(true);
  useEffect(() => {
    destination.current.set(0, 0.06, view === 'back' ? -5.05 : 5.05);
    moving.current = true;
  }, [view, resetKey]);
  useFrame((_, delta) => {
    if (!moving.current) return;
    const blend = 1 - Math.exp(-delta * 4.4);
    camera.position.lerp(destination.current, blend);
    controlsRef.current?.target?.lerp(new THREE.Vector3(0, 0, 0), blend);
    controlsRef.current?.update?.();
    if (camera.position.distanceTo(destination.current) < 0.015) moving.current = false;
  });
  return null;
}

function ShadowBlob() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(128, 64, 4, 128, 64, 62);
    gradient.addColorStop(0, 'rgba(0,0,0,.52)');
    gradient.addColorStop(0.55, 'rgba(0,0,0,.22)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
    return new THREE.CanvasTexture(canvas);
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return <mesh position={[0, -1.48, 0]} rotation={[-Math.PI / 2, 0, 0]}>
    <planeGeometry args={[2.9, 1.25]} />
    <meshBasicMaterial map={texture} transparent opacity={0.75} depthWrite={false} />
  </mesh>;
}

function JerseySleeves({ frontTexture, backTexture }) {
  const sleeves = useMemo(() => [-1, 1].map((side) => ({
    side,
    front: createSleevePanel(side),
    back: createSleevePanel(side, true),
    rotation: (() => {
      const axis = new THREE.Vector3(side * 0.755, -0.656, 0).normalize();
      return new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis));
    })()
  })), []);
  useEffect(() => () => sleeves.forEach((sleeve) => { sleeve.front.dispose(); sleeve.back.dispose(); }), [sleeves]);
  return sleeves.map(({ side, front, back, rotation }) => {
    const [x, y] = sleevePoint(side, 1, 0);
    const [shoulderX, shoulderY] = sleevePoint(side, 0, 0);
    return <group key={side}>
      <mesh geometry={front} castShadow receiveShadow>
        <meshStandardMaterial map={frontTexture} roughness={0.84} metalness={0.005} side={THREE.DoubleSide} transparent alphaTest={0.035} />
      </mesh>
      <mesh geometry={back} castShadow receiveShadow>
        <meshStandardMaterial map={backTexture} roughness={0.84} metalness={0.005} side={THREE.DoubleSide} transparent alphaTest={0.035} />
      </mesh>
      <mesh position={[x, y, 0]} rotation={rotation}>
        <torusGeometry args={[0.215, 0.014, 8, 36]} />
        <meshStandardMaterial color="#77716a" roughness={0.88} />
      </mesh>
      <mesh position={[shoulderX, shoulderY, 0]} rotation={rotation}>
        <torusGeometry args={[0.285, 0.018, 10, 48]} />
        <meshStandardMaterial color="#111213" roughness={0.92} />
      </mesh>
    </group>;
  });
}

function JerseyModel({ team, jersey, playerName, playerNumber, showIcon }) {
  const { gl } = useThree();
  const referenceKit = team?.name?.trim().toLocaleLowerCase() === 'db xi';
  const frontUrl = jersey?.frontImageUrl || (referenceKit ? '/assets/jersey/sultan-front.png' : '');
  const backUrl = jersey?.backImageUrl || (referenceKit ? '/assets/jersey/sultan-back.png' : '');
  const [frontLoaded, setFrontLoaded] = useState(null);
  const [backLoaded, setBackLoaded] = useState(null);
  const [backCustomizationTexture, setBackCustomizationTexture] = useState(null);
  const frontPlaceholder = useMemo(() => makePlaceholderTexture(team, 'front'), [team.id, team.name, team.shortName, team.color, team.secondaryColor]);
  const backPlaceholder = useMemo(() => makePlaceholderTexture(team, 'back'), [team.id, team.name, team.shortName, team.color, team.secondaryColor]);
  const geometry = useMemo(() => ({ front: createTorsoPanel(), back: createTorsoPanel(true) }), []);
  useEffect(() => () => { geometry.front.dispose(); geometry.back.dispose(); }, [geometry]);

  useEffect(() => {
    let alive = true;
    const loader = new THREE.TextureLoader();
    const pending = [];
    setFrontLoaded(null); setBackLoaded(null);
    const loadSide = (side, url, setTexture) => {
      if (!url) return;
      const texture = loader.load(url, (loaded) => {
        if (!alive) { loaded.dispose(); return; }
        loaded.colorSpace = THREE.SRGBColorSpace;
        loaded.anisotropy = gl.capabilities.getMaxAnisotropy();
        loaded.wrapS = THREE.ClampToEdgeWrapping;
        loaded.wrapT = THREE.ClampToEdgeWrapping;
        setTexture({ url, texture: loaded, image: loaded.image, side });
      }, undefined, () => {});
      pending.push(texture);
    };
    loadSide('front', frontUrl, setFrontLoaded);
    loadSide('back', backUrl, setBackLoaded);
    return () => {
      alive = false;
      pending.forEach((texture) => texture.dispose());
    };
  }, [frontUrl, backUrl, gl]);

  useEffect(() => {
    const normalizedName = playerName.trim().toUpperCase();
    const normalizedNumber = String(playerNumber).trim();
    if (!referenceKit || !backLoaded?.image || (normalizedName === 'VASITA' && normalizedNumber === '22' && showIcon)) {
      setBackCustomizationTexture(null);
      return undefined;
    }
    const image = backLoaded.image;
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width || 580;
    canvas.height = image.naturalHeight || image.height || 710;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    if (!showIcon) {
      ctx.fillStyle = '#090a0b';
      ctx.fillRect(canvas.width * 0.305, canvas.height * 0.323, canvas.width * 0.39, canvas.height * 0.09);
    }
    if (normalizedNumber !== '22') {
      const box = { x: canvas.width * 0.305, y: canvas.height * 0.417, width: canvas.width * 0.39, height: canvas.height * 0.168 };
      const numberFill = ctx.createLinearGradient(box.x, box.y, box.x + box.width, box.y + box.height);
      numberFill.addColorStop(0, '#08090a'); numberFill.addColorStop(0.52, '#111112'); numberFill.addColorStop(1, '#08090a');
      ctx.fillStyle = numberFill;
      ctx.fillRect(box.x, box.y, box.width, box.height);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `900 ${Math.round(canvas.height * 0.176)}px Impact, 'Arial Narrow', sans-serif`;
      ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(5, canvas.height * 0.012); ctx.strokeStyle = '#30293f';
      ctx.strokeText(normalizedNumber, canvas.width / 2, canvas.height * 0.502, canvas.width * 0.72);
      ctx.fillStyle = '#fff'; ctx.fillText(normalizedNumber, canvas.width / 2, canvas.height * 0.502, canvas.width * 0.72);
    }
    if (normalizedName !== 'VASITA') {
      const name = normalizedName.slice(0, 18);
      const fontSize = Math.min(49, Math.max(28, 420 / Math.max(name.length, 7)));
      ctx.fillStyle = '#0a0a0b';
      ctx.fillRect(canvas.width * 0.2, canvas.height * 0.655, canvas.width * 0.6, canvas.height * 0.102);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `900 ${fontSize}px Arial, sans-serif`;
      ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = '#343044';
      ctx.strokeText(name, canvas.width / 2, canvas.height * 0.706, canvas.width * 0.72);
      ctx.fillStyle = '#fff'; ctx.fillText(name, canvas.width / 2, canvas.height * 0.706, canvas.width * 0.72);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = gl.capabilities.getMaxAnisotropy();
    setBackCustomizationTexture(texture);
    return () => texture.dispose();
  }, [backLoaded, gl, playerName, playerNumber, referenceKit, showIcon]);

  useEffect(() => () => { frontPlaceholder.dispose(); backPlaceholder.dispose(); }, [frontPlaceholder, backPlaceholder]);
  const frontTexture = frontLoaded?.url === frontUrl ? frontLoaded.texture : frontPlaceholder;
  const backTexture = backCustomizationTexture || (backLoaded?.url === backUrl ? backLoaded.texture : backPlaceholder);

  return <group position={[0, 0, 0]}>
    <mesh geometry={geometry.front} castShadow receiveShadow>
      <meshStandardMaterial map={frontTexture} roughness={0.83} metalness={0.005} side={THREE.DoubleSide} transparent alphaTest={0.035} />
    </mesh>
    <mesh geometry={geometry.back} castShadow receiveShadow>
      <meshStandardMaterial map={backTexture} roughness={0.83} metalness={0.005} side={THREE.DoubleSide} transparent alphaTest={0.035} />
    </mesh>
    <JerseySleeves frontTexture={frontTexture} backTexture={backTexture} />

    <mesh position={[0, 1.185, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.66, 1]}>
      <torusGeometry args={[0.285, 0.055, 14, 56]} />
      <meshStandardMaterial color="#090909" roughness={0.88} />
    </mesh>
    <mesh position={[0, 1.154, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, 0.67, 1]}>
      <torusGeometry args={[0.275, 0.008, 8, 56]} />
      <meshStandardMaterial color="#9c9a93" roughness={0.7} />
    </mesh>
    <mesh position={[0, 0.915, 0.211]} castShadow>
      <boxGeometry args={[0.105, 0.38, 0.055]} />
      <meshStandardMaterial color="#090909" roughness={0.9} />
    </mesh>
    {[0.83, 0.97, 1.105].map((y) => <mesh key={y} position={[0, y, 0.247]}>
      <sphereGeometry args={[0.025, 14, 10]} />
      <meshStandardMaterial color="#d4d0c8" roughness={0.38} metalness={0.1} />
    </mesh>)}
    <mesh position={[0, -1.43, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1.18, 0.36, 1]}>
      <torusGeometry args={[0.5, 0.021, 8, 72]} />
      <meshStandardMaterial color="#68635d" roughness={0.9} />
    </mesh>
  </group>;
}

function StudioBackdrop() {
  return <>
    {[-1, 1].map((side) => <group key={side} position={[0, 0.03, side * 1.48]}>
      <mesh rotation={side < 0 ? [0, 0, 0] : [0, Math.PI, 0]}>
        <circleGeometry args={[2.05, 72]} />
        <meshBasicMaterial color="#362913" transparent opacity={0.42} side={THREE.DoubleSide} />
      </mesh>
      <mesh>
        <torusGeometry args={[1.78, 0.014, 8, 96]} />
        <meshStandardMaterial color="#b78a35" emissive="#55370e" emissiveIntensity={0.7} roughness={0.55} />
      </mesh>
      <mesh>
        <torusGeometry args={[1.9, 0.004, 6, 96]} />
        <meshStandardMaterial color="#d9b662" emissive="#47300c" emissiveIntensity={0.6} />
      </mesh>
    </group>)}
  </>;
}

export default function JerseyViewer({ team, jersey, playerName = 'VASITA', playerNumber = '22', showIcon = true }) {
  const [view, setView] = useState('front');
  const [resetKey, setResetKey] = useState(0);
  const controlsRef = useRef(null);
  if (!team) return <div className="jersey-stage jersey-stage--empty">Choose a team to preview its kit.</div>;
  const referenceKit = team.name?.trim().toLocaleLowerCase() === 'db xi';
  const hasFront = Boolean(jersey?.frontImageUrl || referenceKit);
  const hasBack = Boolean(jersey?.backImageUrl || referenceKit);
  const chooseView = (side) => setView(side);
  return <div className="jersey-stage">
    <Canvas shadows dpr={[1, 1.65]} camera={{ position: [0, 0.06, 5.05], fov: 34 }} gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}>
      <color attach="background" args={['#17130e']} />
      <hemisphereLight args={['#fff2d5', '#312618', 1.5]} />
      <ambientLight intensity={0.42} />
      <directionalLight position={[-3.5, 4.8, 4.5]} intensity={3.2} castShadow shadow-mapSize={[1024, 1024]} />
      <directionalLight position={[3.8, 1.2, 3.5]} intensity={1.5} color="#fff1d6" />
      <pointLight position={[1.8, 1.5, -2.5]} intensity={28} color="#d5a341" distance={9} />
      <StudioBackdrop />
      <JerseyModel team={team} jersey={jersey} playerName={playerName} playerNumber={playerNumber} showIcon={showIcon} />
      <ShadowBlob />
      <OrbitControlRig controlsRef={controlsRef} />
      <CameraDirector view={view} resetKey={resetKey} controlsRef={controlsRef} />
    </Canvas>
    <span className="jersey-stage__hint">DRAG OR TOUCH TO ROTATE · SCROLL OR PINCH TO ZOOM</span>
    <span className="jersey-stage__stamp">MPL / FABRIC MODEL</span>
    <div className="jersey-stage__views" role="group" aria-label="Jersey camera controls">
      <button type="button" className={view === 'front' ? 'is-active' : ''} aria-pressed={view === 'front'} onClick={() => chooseView('front')}>FRONT</button>
      <button type="button" className={view === 'back' ? 'is-active' : ''} aria-pressed={view === 'back'} onClick={() => chooseView('back')}>BACK</button>
      <button type="button" onClick={() => { setView('front'); setResetKey((value) => value + 1); }}>RESET</button>
    </div>
    {(!hasFront || !hasBack) && <span className="jersey-stage__uploaded jersey-stage__uploaded--placeholder">{!hasFront && !hasBack ? 'TEAM KIT · OFFICIAL ARTWORK NEEDED' : `TEAM KIT · ${!hasFront ? 'FRONT' : 'BACK'} ARTWORK NEEDED`}</span>}
    {hasFront && hasBack && <span className="jersey-stage__uploaded">{referenceKit && !jersey?.frontImageUrl ? 'DB XI REFERENCE KIT' : 'OFFICIAL TEAM ARTWORK'}</span>}
  </div>;
}

import { useRef, useMemo, useEffect, useState, useCallback, memo } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { audioEngine } from '../lib/audioEngine';
import StationInfoModal from './StationInfoModal';
import type { Station } from '../types';

const CONTINENT_COLORS: Record<string, string> = {
  'N. America': '#6BB8E0',
  'S. America': '#E87878',
  'Europe': '#7AAFCF',
  'Africa': '#7CB342',
  'Asia': '#E06B8E',
  'Oceania': '#B39DDB',
};

const COUNTRY_COORDS: Record<string, [number, number, number?]> = {
  AE: [24.4, 54.4, 1.5], AR: [-34.6, -58.4, 4], AT: [47.5, 14.5, 1.2],
  AU: [-25.3, 133.8, 8], BE: [50.5, 4.5, 1], BR: [-14.2, -51.9, 8],
  BY: [53.7, 27.9, 2], CA: [56.1, -106.3, 10], CH: [46.8, 8.2, 1],
  CL: [-35.7, -71.5, 5], CN: [35.9, 104.2, 8], CO: [4.6, -74.1, 3],
  CZ: [49.8, 15.5, 1.5], DE: [51.2, 10.4, 2], DK: [56.2, 9.5, 1],
  EG: [26.8, 30.8, 3], ES: [40.4, -3.7, 2.5], FI: [61.9, 25.7, 3],
  FR: [46.2, 2.2, 3], GB: [54.5, -2.5, 2], GR: [39.1, 21.8, 2],
  HU: [47.2, 19.5, 1.3], ID: [-2.5, 118, 7], IE: [53.4, -8.2, 1],
  IN: [22.9, 78.9, 5], IT: [42.8, 12.8, 2], JP: [36.2, 138.3, 3],
  KR: [36.5, 127.8, 1.5], MX: [23.6, -102.5, 5], MY: [4.2, 102, 2],
  NG: [9.1, 8.7, 3], NL: [52.1, 5.3, 1], NO: [60.5, 8.5, 4],
  NZ: [-40.9, 174.9, 2], PE: [-9.2, -75, 4], PH: [12.9, 121.8, 3],
  PL: [52, 19.1, 2], PT: [39.4, -8.2, 1.5], RO: [45.9, 24.9, 2],
  RS: [44, 20.8, 1.5], RU: [61.5, 96, 14], SA: [23.9, 45.1, 4],
  SE: [60.1, 18.6, 4], SG: [1.35, 103.8, 0.4], SK: [48.7, 19.7, 1],
  TR: [39, 35.2, 4], UA: [48.4, 31.2, 3], UG: [1.4, 32.3, 2],
  US: [39.8, -98.6, 12], ZA: [-30.6, 22.9, 4],
};

function hashUnit(seed: string, salt: number): number {
  let hash = 2166136261 + salt;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 10000;
}

function getStationCoords(station: Station): { lat: number; lng: number } | null {
  const lat = Number(station.geo_lat);
  const lng = Number(station.geo_long);
  if (!isNaN(lat) && !isNaN(lng) && !(lat === 0 && lng === 0)) {
    return { lat, lng };
  }
  const code = station.countrycode?.toUpperCase();
  if (!code) return null;
  const fallback = COUNTRY_COORDS[code];
  if (!fallback) return null;
  const [baseLat, baseLng, spread = 2] = fallback;
  const seed = station.stationuuid || station.name || code;
  const latOffset = (hashUnit(seed, 17) - 0.5) * spread;
  const lngOffset = (hashUnit(seed, 41) - 0.5) * spread * 1.4;
  return {
    lat: clamp(baseLat + latOffset, -75, 75),
    lng: clamp(baseLng + lngOffset, -179, 179),
  };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function getContinent(lat: number, lng: number): string {
  if (lat > 15 && lng < -50 && lng > -170) return 'N. America';
  if (lat < 15 && lat > -60 && lng < -30 && lng > -90) return 'S. America';
  if (lat > 35 && lat < 72 && lng > -10 && lng < 45) return 'Europe';
  if (lat > -40 && lat < 38 && lng > -20 && lng < 55) return 'Africa';
  if (lat > 0 && lat < 75 && lng > 40 && lng < 180) return 'Asia';
  if (lat > -50 && lat < -10 && lng > 110 && lng < 180) return 'Oceania';
  return 'Other';
}

interface GlobeViewProps {
  stations: Station[];
  onStationClick?: (s: Station) => void;
}

interface PointDatum {
  lat: number;
  lng: number;
  station: Station;
  continent: string;
  baseColor: string;
}

const CLICK_RADIUS_DEG = 1.5;
const HOVER_RADIUS_DEG = 0.8;
const POINT_RADIUS = 0.42;
const MAX_POINTS = 1500;
const GRID_CELL_DEG = 3;

const GLOBE_TEXTURE_URL =
  'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg';

class SpatialGrid {
  cols: number;
  rows: number;
  cells: PointDatum[][][];
  cellSizeDeg: number;

  constructor(cellSizeDeg: number = 2) {
    this.cellSizeDeg = cellSizeDeg;
    this.cols = Math.ceil(360 / cellSizeDeg);
    this.rows = Math.ceil(180 / cellSizeDeg);
    this.cells = [];
    for (let r = 0; r < this.rows; r++) {
      this.cells.push([]);
      for (let c = 0; c < this.cols; c++) {
        this.cells[r][c] = [];
      }
    }
  }

  insert(p: PointDatum): void {
    const col = Math.max(0, Math.min(this.cols - 1, Math.floor((p.lng + 180) / this.cellSizeDeg)));
    const row = Math.max(0, Math.min(this.rows - 1, Math.floor((p.lat + 90) / this.cellSizeDeg)));
    this.cells[row][col].push(p);
  }

  findNearest(lat: number, lng: number, maxDeg: number): PointDatum | null {
    const cosLat = Math.cos(lat * Math.PI / 180);
    const cellRadius = Math.ceil(maxDeg / this.cellSizeDeg);
    const centerCol = Math.max(0, Math.min(this.cols - 1, Math.floor((lng + 180) / this.cellSizeDeg)));
    const centerRow = Math.max(0, Math.min(this.rows - 1, Math.floor((lat + 90) / this.cellSizeDeg)));

    let best: PointDatum | null = null;
    let bestDist = maxDeg * maxDeg;

    for (let dr = -cellRadius; dr <= cellRadius; dr++) {
      const r = centerRow + dr;
      if (r < 0 || r >= this.rows) continue;
      for (let dc = -cellRadius; dc <= cellRadius; dc++) {
        const c = centerCol + dc;
        if (c < 0 || c >= this.cols) continue;
        const cell = this.cells[r][c];
        for (let i = 0; i < cell.length; i++) {
          const p = cell[i];
          const dlat = p.lat - lat;
          const dlng = (p.lng - lng) * cosLat;
          const d2 = dlat * dlat + dlng * dlng;
          if (d2 < bestDist) {
            bestDist = d2;
            best = p;
          }
        }
      }
    }
    return best;
  }
}

function buildSubsampledPoints(stations: Station[]): PointDatum[] {
  const result: PointDatum[] = [];

  if (stations.length <= MAX_POINTS) {
    for (let i = 0; i < stations.length; i++) {
      const s = stations[i];
      const coords = getStationCoords(s);
      if (!coords) continue;
      const { lat, lng } = coords;
      const continent = getContinent(lat, lng);
      result.push({
        lat,
        lng,
        station: s,
        continent,
        baseColor: CONTINENT_COLORS[continent] || '#9d9a8f',
      });
    }
    return result;
  }

  const grid: Record<string, PointDatum> = {};
  for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    const coords = getStationCoords(s);
    if (!coords) continue;
    const { lat, lng } = coords;
    const continent = getContinent(lat, lng);
    const key = `${Math.floor((lat + 90) / GRID_CELL_DEG)}_${Math.floor((lng + 180) / GRID_CELL_DEG)}`;
    if (!grid[key]) {
      grid[key] = {
        lat,
        lng,
        station: s,
        continent,
        baseColor: CONTINENT_COLORS[continent] || '#9d9a8f',
      };
    }
  }
  return Object.values(grid);
}

/**
 * Convert lat/lng to Three.js cartesian — matches three-globe's polar2Cartesian exactly.
 * GLOBE_RADIUS is 100 by default in three-globe.
 */
const GLOBE_RADIUS = 100;

function latLngToVector3(lat: number, lng: number, relAltitude: number = 0): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (90 - lng) * (Math.PI / 180);
  const r = GLOBE_RADIUS * (1 + relAltitude);
  const phiSin = Math.sin(phi);
  return new THREE.Vector3(
    r * phiSin * Math.cos(theta),
    r * Math.cos(phi),
    r * phiSin * Math.sin(theta)
  );
}

const GlobeView = memo(function GlobeView({ stations, onStationClick }: GlobeViewProps) {
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<SpatialGrid | null>(null);
  const hoveredRef = useRef<Station | null>(null);
  const rafRef = useRef<number>(0);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const tooltipElRef = useRef<HTMLDivElement | null>(null);
  const activeUuidRef = useRef<string | null>(null);
  const pointsLayerRef = useRef<THREE.InstancedMesh | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const ndcRef = useRef(new THREE.Vector2());
  const hitVecRef = useRef(new THREE.Vector3());
  const glowLayerRef = useRef<THREE.InstancedMesh | null>(null);

  const [metadataStation, setMetadataStation] = useState<Station | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const activeStationUuid = useStore((s) => s.activeStationUuid);
  const playerStation = useStore((s) => s.player.currentStation);
  const setPlayer = useStore((s) => s.setPlayer);
  const addToast = useStore((s) => s.addToast);
  const setActiveStationUuid = useStore((s) => s.setActiveStationUuid);

  activeUuidRef.current = activeStationUuid;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        setDimensions({
          width: e.contentRect.width,
          height: e.contentRect.height,
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pointData = useMemo<PointDatum[]>(() => buildSubsampledPoints(stations), [stations]);

  useEffect(() => {
    gridRef.current = new SpatialGrid(2);
    for (let i = 0; i < pointData.length; i++) {
      gridRef.current.insert(pointData[i]);
    }
  }, [pointData]);


  const handlePlayStation = useCallback(
    async (station: Station) => {
      if (onStationClick) { onStationClick(station); return; }
      const url = station.url_resolved || station.url;
      if (!url) return;
      setActiveStationUuid(station.stationuuid);
      setPlayer({ currentStation: station, isPlaying: true });
      try {
        await audioEngine.play(url, station.stationuuid, station);
      } catch {
        setPlayer({ isPlaying: false });
        addToast('Failed to play station', 'error');
      }
    },
    [onStationClick, setActiveStationUuid, setPlayer, addToast]
  );

  const getGlobeHit = useCallback((e: React.MouseEvent) => {
    const globe = globeRef.current;
    if (!globe) return null;
    const camera = globe.camera();
    const renderer = globe.renderer();
    if (!camera || !renderer) return null;

    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    ndcRef.current.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    raycasterRef.current.setFromCamera(ndcRef.current, camera);

    const ray = raycasterRef.current.ray;
    const R = globe.getGlobeRadius();
    const a = ray.direction.dot(ray.direction);
    const b = 2 * ray.origin.dot(ray.direction);
    const c = ray.origin.dot(ray.origin) - R * R;
    const d = b * b - 4 * a * c;
    if (d < 0) return null;

    const t = (-b - Math.sqrt(d)) / (2 * a);
    if (t < 0) return null;

    hitVecRef.current.copy(ray.origin).addScaledVector(ray.direction, t);
    return globe.toGeoCoords({ x: hitVecRef.current.x, y: hitVecRef.current.y, z: hitVecRef.current.z });
  }, []);

  const handleGlobeClick = useCallback(
    (e: React.MouseEvent) => {
      const geo = getGlobeHit(e);
      if (!geo || typeof geo.lat !== 'number' || typeof geo.lng !== 'number') return;
      const grid = gridRef.current;
      if (!grid) return;
      const nearest = grid.findNearest(geo.lat, geo.lng, CLICK_RADIUS_DEG);
      if (nearest) {
        setMetadataStation(nearest.station);
      }
    },
    [getGlobeHit]
  );

  const ensureTooltipEl = useCallback(() => {
    if (tooltipElRef.current) return tooltipElRef.current;
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;pointer-events:none;z-index:100;display:none;background:var(--bg-elev,var(--bg));color:var(--ink);padding:8px 12px;border-radius:6px;box-shadow:var(--shadow-md);font-size:13px;border:1px solid var(--line,rgba(0,0,0,0.08));';
    document.body.appendChild(el);
    tooltipElRef.current = el;
    return el;
  }, []);

  const scheduleHover = useCallback(
    (e: React.MouseEvent) => {
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      if (dx * dx + dy * dy < 16 && hoveredRef.current) return;
      lastMouseRef.current.x = e.clientX;
      lastMouseRef.current.y = e.clientY;

      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const geo = getGlobeHit(e);
        const el = tooltipElRef.current || ensureTooltipEl();
        if (!geo || typeof geo.lat !== 'number' || typeof geo.lng !== 'number') {
          if (hoveredRef.current) {
            hoveredRef.current = null;
            el.style.display = 'none';
          }
          return;
        }
        const grid = gridRef.current;
        if (!grid) return;
        const nearest = grid.findNearest(geo.lat, geo.lng, HOVER_RADIUS_DEG);
        if (nearest) {
          if (hoveredRef.current?.stationuuid !== nearest.station.stationuuid) {
            hoveredRef.current = nearest.station;
            el.innerHTML = `<div style="font-weight:600;margin-bottom:2px">${nearest.station.name}</div><div style="color:var(--ink-mute,#666);font-size:11px">${nearest.station.country || ''} \u00b7 ${nearest.station.bitrate || '?'}kbps</div>`;
          }
          el.style.left = `${e.clientX + 14}px`;
          el.style.top = `${e.clientY - 10}px`;
          el.style.display = 'block';
        } else if (hoveredRef.current) {
          hoveredRef.current = null;
          el.style.display = 'none';
        }
      });
    },
    [getGlobeHit, ensureTooltipEl]
  );

  useEffect(() => {
    return () => {
      if (tooltipElRef.current) {
        tooltipElRef.current.remove();
        tooltipElRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!playerStation || !globeRef.current) return;
    const coords = getStationCoords(playerStation);
    if (coords) {
      globeRef.current.pointOfView({ lat: coords.lat, lng: coords.lng, altitude: 3.15 }, 900);
    }
  }, [playerStation]);

  const rings = useMemo(() => {
    if (!playerStation) return [];
    const coords = getStationCoords(playerStation);
    if (!coords) return [];

    // Determine continent color for this station
    const lat = coords.lat;
    const lng = coords.lng;
    const continent = getContinent(lat, lng);
    const hex = CONTINENT_COLORS[continent] || '#ff4d6d';

    // Convert hex → rgb components
    const c = new THREE.Color(hex);
    const r = Math.round(c.r * 255);
    const g = Math.round(c.g * 255);
    const b = Math.round(c.b * 255);

    return [
      {
        lat,
        lng,
        color: `rgba(${r},${g},${b},1)`,
        maxRadius: 6,
        speed: 3,
        repeatPeriod: 1200,
      },
      {
        lat,
        lng,
        color: `rgba(${r},${g},${b},0.75)`,
        maxRadius: 10,
        speed: 2,
        repeatPeriod: 1800,
      },
      {
        lat,
        lng,
        color: `rgba(${r},${g},${b},0.45)`,
        maxRadius: 15,
        speed: 1.5,
        repeatPeriod: 2500,
      },
    ];
  }, [playerStation]);

  const globeMaterial = useMemo(() => {
    const mat = new THREE.MeshPhongMaterial();
    mat.color = new THREE.Color('#ffffff');
    mat.shininess = 8;
    mat.specular = new THREE.Color('#333333');
    return mat;
  }, []);

  /**
   * Build two layers:
   *  1. Main spheres — true continent colors, subtle shine
   *  2. Surround glow — slightly larger, additive blend, same color
   */
  const rebuildPointsLayers = useCallback(() => {
    try {
      const globe = globeRef.current;
      if (!globe) return;
      const scene = globe.scene();
      if (!scene) return;

      // Remove old layers
      [pointsLayerRef.current, glowLayerRef.current].forEach((m) => {
        if (m) {
          scene.remove(m);
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
      pointsLayerRef.current = null;
      glowLayerRef.current = null;

      const data = pointData;
      if (data.length === 0) return;

      const count = data.length;
      const REL_ALT = 0.005;

      const dummy = new THREE.Object3D();
      const tmpCol = new THREE.Color();

      const sphereGeo = new THREE.SphereGeometry(1, 10, 8);

      // --- Main sphere: per-instance color, slight glossy shine ---
      const mat = new THREE.MeshPhongMaterial({
        shininess: 50,
        specular: 0x555555,
        transparent: true,
        opacity: 1,
      });
      const mesh = new THREE.InstancedMesh(sphereGeo, mat, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;

      // --- Surround glow: rim/backlight effect ---
      // A slightly larger BackSide sphere + additive blending =
      // light wraps around the edges like a rim light from behind.
      const glowMat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0.5,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glowMesh = new THREE.InstancedMesh(
        new THREE.SphereGeometry(1, 8, 6),
        glowMat,
        count
      );
      glowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      glowMesh.frustumCulled = false;

      for (let i = 0; i < count; i++) {
        const p = data[i];
        const isActive = p.station.stationuuid === activeUuidRef.current;
        const colorStr = isActive ? '#ff4d6d' : p.baseColor;
        const scale = isActive ? POINT_RADIUS * 2.2 : POINT_RADIUS * 1.4;
        // Glow sphere is only ~1.35x — just slightly larger so
        // only the back-facing edges peek around the main sphere,
        // creating a rim/backlight rim effect.
        const glowScale = isActive ? scale * 1.6 : scale * 1.35;

        const pos = latLngToVector3(p.lat, p.lng, REL_ALT);

        // Main sphere
        dummy.position.copy(pos);
        dummy.scale.setScalar(scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        mesh.setColorAt(i, tmpCol.set(colorStr));

        // Glow rim — active gets a wider, brighter rim
        const glowColor = isActive
          ? tmpCol.clone().offsetHSL(0, -0.1, 0.25) // lighten for extra brightness
          : tmpCol.clone();
        dummy.scale.setScalar(glowScale);
        dummy.updateMatrix();
        glowMesh.setMatrixAt(i, dummy.matrix);
        glowMesh.setColorAt(i, glowColor);
      }

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      glowMesh.instanceMatrix.needsUpdate = true;
      if (glowMesh.instanceColor) glowMesh.instanceColor.needsUpdate = true;

      scene.add(glowMesh);
      scene.add(mesh);
      pointsLayerRef.current = mesh;
      glowLayerRef.current = glowMesh;
    } catch { /* cosmetic — ignore */ }
  }, [pointData, activeStationUuid]);

  // Rebuild points layers when data or active station changes
  useEffect(() => {
    // Small delay to ensure globe scene is ready
    const timer = setTimeout(rebuildPointsLayers, 100);
    return () => clearTimeout(timer);
  }, [rebuildPointsLayers]);

  const handleGlobeReady = useCallback(() => {
    const controls = globeRef.current?.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.2;
      controls.enableDamping = true;
      controls.dampingFactor = 0.15;
      controls.rotateSpeed = 0.4;
      controls.zoomSpeed = 0.4;
      controls.minDistance = 110;
      controls.maxDistance = 500;

      // Start zoomed out so the full globe is visible
      globeRef.current.pointOfView({ lat: 20, lng: 0, altitude: 3.5 });
    }

    const scene = globeRef.current?.scene();
    if (scene) {
      // --- Day/night terminator lighting ---
      const dirLight = scene.children.find(
        (c: THREE.Object3D) => c.type === 'DirectionalLight'
      ) as THREE.DirectionalLight | undefined;
      if (dirLight) {
        // Strong sun from upper-right: creates a clear terminator line
        dirLight.position.set(5, 3, 2);
        dirLight.intensity = 1.6;
        dirLight.color.set('#fff5e6'); // warm sunlight tint
      }

      // Very low ambient — dark side should be noticeably dark
      const ambient = scene.children.find(
        (c: THREE.Object3D) => c.type === 'AmbientLight'
      ) as THREE.AmbientLight | undefined;
      if (ambient) {
        ambient.intensity = 0.15;
        ambient.color.set('#4466aa'); // cool blue fill for shadow side
      }

      // Remove fill light if it exists — we want a strong contrast
      const childrenToRemove: THREE.Object3D[] = [];
      scene.children.forEach((c: THREE.Object3D) => {
        if (c.type === 'DirectionalLight' && c !== dirLight) {
          childrenToRemove.push(c);
        }
      });
      childrenToRemove.forEach((c) => scene.remove(c));

    }

    // Build circle points layers once the globe is ready
    rebuildPointsLayers();
  }, [rebuildPointsLayers]);

  return (
    <div ref={containerRef} className="globe-view" onClick={handleGlobeClick} onMouseMove={scheduleHover}>
      {dimensions.width > 0 && (
        <Globe
          ref={globeRef}
          width={dimensions.width}
          height={dimensions.height}
          globeImageUrl={GLOBE_TEXTURE_URL}
          bumpImageUrl={null}
          backgroundImageUrl={null}
          backgroundColor="#000010"
          globeMaterial={globeMaterial}
          showGraticules={false}
          /* Disable built-in triangle points — we render our own circle Points layers */
          pointsData={[]}
          ringsData={rings}
          ringColor="color"
          ringAltitude={0.015}
          ringMaxRadius="maxRadius"
          ringPropagationSpeed="speed"
          ringRepeatPeriod="repeatPeriod"
          ringResolution={16}

          atmosphereColor="#9ec5e8"
          atmosphereAltitude={0.16}
          animateIn={false}
          onGlobeReady={handleGlobeReady}
        />
      )}
      <div className="globe-legend" aria-label="Station colors by region">
        {Object.entries(CONTINENT_COLORS).map(([continent, color]) => (
          <span key={continent} className="globe-legend__item">
            <span className="globe-legend__dot" style={{ background: color }} />
            {continent}
          </span>
        ))}
      </div>
      {pointData.length === 0 && (
        <div className="globe-empty">
          <span className="globe-empty__title">No mapped stations yet</span>
          <span className="globe-empty__copy">Station points appear here after sync or filtering.</span>
        </div>
      )}
      {metadataStation && (
        <StationInfoModal
          station={metadataStation}
          onClose={() => setMetadataStation(null)}
          onPlay={handlePlayStation}
        />
      )}
    </div>
  );
});

export default GlobeView;

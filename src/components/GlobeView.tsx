import { useRef, useMemo, useEffect, useState, useCallback, memo } from 'react';
import Globe from 'react-globe.gl';
import * as THREE from 'three';
import { useStore } from '../store/store';
import { audioEngine } from '../lib/audioEngine';
import { countryCodeToFlag } from '../lib/utils';
import type { Station } from '../types';

const CONTINENT_COLORS: Record<string, string> = {
  'N. America': '#EDA100',
  'S. America': '#E0683C',
  'Europe': '#6396D6',
  'Africa': '#6EA100',
  'Asia': '#C8553D',
  'Oceania': '#8E7CC3',
};

const COUNTRY_COORDS: Record<string, [number, number, number?]> = {
  AE: [24.4, 54.4, 1.5],
  AR: [-34.6, -58.4, 4],
  AT: [47.5, 14.5, 1.2],
  AU: [-25.3, 133.8, 8],
  BE: [50.5, 4.5, 1],
  BR: [-14.2, -51.9, 8],
  BY: [53.7, 27.9, 2],
  CA: [56.1, -106.3, 10],
  CH: [46.8, 8.2, 1],
  CL: [-35.7, -71.5, 5],
  CN: [35.9, 104.2, 8],
  CO: [4.6, -74.1, 3],
  CZ: [49.8, 15.5, 1.5],
  DE: [51.2, 10.4, 2],
  DK: [56.2, 9.5, 1],
  EG: [26.8, 30.8, 3],
  ES: [40.4, -3.7, 2.5],
  FI: [61.9, 25.7, 3],
  FR: [46.2, 2.2, 3],
  GB: [54.5, -2.5, 2],
  GR: [39.1, 21.8, 2],
  HU: [47.2, 19.5, 1.3],
  ID: [-2.5, 118, 7],
  IE: [53.4, -8.2, 1],
  IN: [22.9, 78.9, 5],
  IT: [42.8, 12.8, 2],
  JP: [36.2, 138.3, 3],
  KR: [36.5, 127.8, 1.5],
  MX: [23.6, -102.5, 5],
  MY: [4.2, 102, 2],
  NG: [9.1, 8.7, 3],
  NL: [52.1, 5.3, 1],
  NO: [60.5, 8.5, 4],
  NZ: [-40.9, 174.9, 2],
  PE: [-9.2, -75, 4],
  PH: [12.9, 121.8, 3],
  PL: [52, 19.1, 2],
  PT: [39.4, -8.2, 1.5],
  RO: [45.9, 24.9, 2],
  RS: [44, 20.8, 1.5],
  RU: [61.5, 96, 14],
  SA: [23.9, 45.1, 4],
  SE: [60.1, 18.6, 4],
  SG: [1.35, 103.8, 0.4],
  SK: [48.7, 19.7, 1],
  TR: [39, 35.2, 4],
  UA: [48.4, 31.2, 3],
  UG: [1.4, 32.3, 2],
  US: [39.8, -98.6, 12],
  ZA: [-30.6, 22.9, 4],
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
    lat: Math.max(-75, Math.min(75, baseLat + latOffset)),
    lng: Math.max(-179, Math.min(179, baseLng + lngOffset)),
  };
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
const POINT_RADIUS = 0.2;

function findNearest(
  data: PointDatum[],
  lat: number,
  lng: number,
  maxDeg: number
): PointDatum | null {
  const cosLat = Math.cos(lat * Math.PI / 180);
  let best: PointDatum | null = null;
  let bestDist = maxDeg * maxDeg;
  for (let i = 0; i < data.length; i++) {
    const p = data[i];
    const dlat = p.lat - lat;
    const dlng = (p.lng - lng) * cosLat;
    const d2 = dlat * dlat + dlng * dlng;
    if (d2 < bestDist) {
      bestDist = d2;
      best = p;
    }
  }
  return best;
}

const GlobeView = memo(function GlobeView({ stations }: GlobeViewProps) {
  const globeRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pointDataRef = useRef<PointDatum[]>([]);
  const hoveredRef = useRef<Station | null>(null);
  const rafRef = useRef<number>(0);

  const [tooltip, setTooltip] = useState<{ x: number; y: number; station: Station } | null>(null);
  const [metadataStation, setMetadataStation] = useState<Station | null>(null);
  const [countries, setCountries] = useState<any[]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const activeStationUuid = useStore((s) => s.activeStationUuid);
  const playerStation = useStore((s) => s.player.currentStation);
  const setPlayer = useStore((s) => s.setPlayer);
  const addToast = useStore((s) => s.addToast);
  const setActiveStationUuid = useStore((s) => s.setActiveStationUuid);

  useEffect(() => {
    fetch(
      'https://raw.githubusercontent.com/vasturiano/three-globe/master/example/country-polygons/ne_110m_admin_0_countries.geojson'
    )
      .then((r) => r.json())
      .then((d) => {
        if (d?.features) setCountries(d.features);
      })
      .catch(() => {});
  }, []);

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

  const pointData = useMemo<PointDatum[]>(() => {
    return stations
      .map((s) => {
        const coords = getStationCoords(s);
        if (!coords) return null;
        const { lat, lng } = coords;
        const continent = getContinent(lat, lng);
        return {
          lat,
          lng,
          station: s,
          continent,
          baseColor: CONTINENT_COLORS[continent] || '#9d9a8f',
        };
      })
      .filter(Boolean) as PointDatum[];
  }, [stations]);

  useEffect(() => {
    pointDataRef.current = pointData;
  }, [pointData]);

  const pointColor = useCallback(
    (point: object) => {
      const p = point as PointDatum;
      return p.station.stationuuid === activeStationUuid ? '#ff4d6d' : p.baseColor;
    },
    [activeStationUuid]
  );

  const handlePlayStation = useCallback(
    async (station: Station) => {
      const url = station.url_resolved || station.url;
      if (!url) return;
      setActiveStationUuid(station.stationuuid);
      setPlayer({ currentStation: station, isPlaying: true });
      try {
        await audioEngine.play(url, station.stationuuid);
      } catch {
        setPlayer({ isPlaying: false });
        addToast('Failed to play station', 'error');
      }
    },
    [setActiveStationUuid, setPlayer, addToast]
  );

  const getGlobeHit = useCallback((e: React.MouseEvent) => {
    const globe = globeRef.current;
    if (!globe) return null;
    const camera = globe.camera();
    const renderer = globe.renderer();
    if (!camera || !renderer) return null;

    const canvas = renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);

    const ray = raycaster.ray;
    const R = globe.getGlobeRadius();
    const a = ray.direction.dot(ray.direction);
    const b = 2 * ray.origin.dot(ray.direction);
    const c = ray.origin.dot(ray.origin) - R * R;
    const d = b * b - 4 * a * c;
    if (d < 0) return null;

    const t = (-b - Math.sqrt(d)) / (2 * a);
    if (t < 0) return null;

    const hit = ray.origin.clone().add(ray.direction.clone().multiplyScalar(t));
    return globe.toGeoCoords({ x: hit.x, y: hit.y, z: hit.z });
  }, []);

  const handleGlobeClick = useCallback(
    (e: React.MouseEvent) => {
      const geo = getGlobeHit(e);
      if (!geo || typeof geo.lat !== 'number' || typeof geo.lng !== 'number') return;
      const nearest = findNearest(pointDataRef.current, geo.lat, geo.lng, CLICK_RADIUS_DEG);
      if (nearest) {
        setMetadataStation(nearest.station);
      }
    },
    [getGlobeHit]
  );

  const scheduleHover = useCallback(
    (e: React.MouseEvent) => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const geo = getGlobeHit(e);
        if (!geo || typeof geo.lat !== 'number' || typeof geo.lng !== 'number') {
          if (hoveredRef.current) {
            hoveredRef.current = null;
            setTooltip(null);
          }
          return;
        }
        const nearest = findNearest(pointDataRef.current, geo.lat, geo.lng, HOVER_RADIUS_DEG);
        if (nearest) {
          if (hoveredRef.current?.stationuuid !== nearest.station.stationuuid) {
            hoveredRef.current = nearest.station;
            setTooltip({ x: e.clientX, y: e.clientY, station: nearest.station });
          } else {
            setTooltip((prev) =>
              prev ? { ...prev, x: e.clientX, y: e.clientY } : prev
            );
          }
        } else if (hoveredRef.current) {
          hoveredRef.current = null;
          setTooltip(null);
        } else {
          setTooltip(null);
        }
      });
    },
    [getGlobeHit]
  );

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
    return [
      {
        lat: coords.lat,
        lng: coords.lng,
        color: 'rgba(255,77,109,0.85)',
        maxRadius: 9,
        speed: 2,
        repeatPeriod: 700,
      },
    ];
  }, [playerStation]);

  const activeMarker = useMemo(() => {
    if (!playerStation) return null;
    const coords = getStationCoords(playerStation);
    return coords ? { ...coords } : null;
  }, [playerStation]);

  const activeHtmlElement = useCallback(() => {
    const el = document.createElement('div');
    el.className = 'globe-active-pulse';
    return el;
  }, []);

  const globeMaterial = useMemo(() => {
    const mat = new THREE.MeshPhongMaterial();
    mat.color = new THREE.Color('#f5efe4');
    mat.shininess = 8;
    mat.specular = new THREE.Color('#444444');
    return mat;
  }, []);

  const polygonCapColor = useCallback(() => 'rgba(0,0,0,0)', []);
  const polygonSideColor = useCallback(() => 'rgba(0,0,0,0)', []);
  const polygonStrokeColor = useCallback(() => 'rgba(0,0,0,0.25)', []);

  const handleGlobeReady = useCallback(() => {
    const controls = globeRef.current?.controls();
    if (controls) {
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.25;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.6;
      controls.zoomSpeed = 0.6;
      controls.minDistance = 30;
      controls.maxDistance = 500;
    }

    const scene = globeRef.current?.scene();
    if (scene) {
      const dirLight = scene.children.find(
        (c: THREE.Object3D) => c.type === 'DirectionalLight'
      ) as THREE.DirectionalLight | undefined;
      if (dirLight) {
        dirLight.position.set(1, 1.5, 1);
        dirLight.intensity = 1.5;
      }

      const ambient = scene.children.find(
        (c: THREE.Object3D) => c.type === 'AmbientLight'
      ) as THREE.AmbientLight | undefined;
      if (ambient) {
        ambient.intensity = 0.9;
      }

      const hasFill = scene.children.some(
        (c: THREE.Object3D) => c.type === 'DirectionalLight' && c !== dirLight
      );
      if (!hasFill) {
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3);
        fillLight.position.set(-1, -0.5, -1);
        scene.add(fillLight);
      }
    }

    const globeEl = globeRef.current;
    if (globeEl) {
      const allMeshes: THREE.Mesh[] = [];
      globeEl.scene()?.traverse?.((c: THREE.Object3D) => {
        if (c.type === 'Mesh') allMeshes.push(c as THREE.Mesh);
      });
      if (allMeshes.length > 0) {
        for (const mesh of allMeshes) {
          if (mesh.material && !Array.isArray(mesh.material)) {
            const mat = mesh.material as THREE.MeshPhongMaterial;
            if (mat.color && mat.color.getHex() === 0xffffff) {
              mat.color.set('#f5efe4');
              mat.shininess = 8;
              mat.specular = new THREE.Color('#444444');
              mat.needsUpdate = true;
            }
          }
        }
      }
    }
  }, []);

  return (
    <div ref={containerRef} className="globe-view" onClick={handleGlobeClick} onMouseMove={scheduleHover}>
      {dimensions.width > 0 && (
        <Globe
          ref={globeRef}
          width={dimensions.width}
          height={dimensions.height}
          globeImageUrl={null}
          bumpImageUrl={null}
          backgroundImageUrl={null}
          backgroundColor="rgba(0,0,0,0)"
          globeMaterial={globeMaterial}
          showGraticules={true}
          polygonsData={countries}
          polygonCapColor={polygonCapColor}
          polygonSideColor={polygonSideColor}
          polygonStrokeColor={polygonStrokeColor}
          pointsData={pointData}
          pointLat="lat"
          pointLng="lng"
          pointAltitude={0.012}
          pointRadius={POINT_RADIUS}
          pointResolution={4}
          pointColor={pointColor}
          pointsMerge={true}
          ringsData={rings}
          ringColor="color"
          ringAltitude={0.018}
          ringMaxRadius="maxRadius"
          ringPropagationSpeed="speed"
          ringRepeatPeriod="repeatPeriod"
          ringResolution={96}
          htmlElementsData={activeMarker ? [activeMarker] : []}
          htmlLat="lat"
          htmlLng="lng"
          htmlAltitude={0.035}
          htmlElement={activeHtmlElement}
          atmosphereColor="#c8beaa"
          atmosphereAltitude={0.12}
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
      {playerStation && (
        <div className="globe-now">
          <span className="globe-now__flag">
            {countryCodeToFlag(playerStation.countrycode || '') || '📻'}
          </span>
          <span className="globe-now__body">
            <span className="globe-now__label">Now playing</span>
            <span className="globe-now__name">{playerStation.name}</span>
          </span>
        </div>
      )}
      {tooltip && (
        <div
          style={{
            position: 'absolute',
            left: tooltip.x + 14,
            top: tooltip.y - 10,
            pointerEvents: 'none',
            zIndex: 100,
            background: 'white',
            padding: '8px 12px',
            borderRadius: 6,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            fontFamily: 'sans-serif',
            fontSize: 13,
            color: '#333',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 2 }}>{tooltip.station.name}</div>
          <div style={{ color: '#666', fontSize: 11 }}>
            {tooltip.station.country || ''} · {tooltip.station.bitrate || '?'}kbps
          </div>
        </div>
      )}
      {metadataStation && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
          onClick={(e) => {
            e.stopPropagation();
            setMetadataStation(null);
          }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-[90%] max-w-[420px] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 pt-5 pb-3 border-b border-gray-100">
              <h2 className="text-lg font-bold text-gray-900 truncate pr-2">{metadataStation.name}</h2>
              <button
                onClick={() => setMetadataStation(null)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="px-6 py-4 space-y-2.5 text-sm">
              {metadataStation.country && (
                <div className="flex">
                  <span className="text-gray-400 w-24 shrink-0">Country</span>
                  <span className="text-gray-800">{metadataStation.country}</span>
                </div>
              )}
              {metadataStation.state && (
                <div className="flex">
                  <span className="text-gray-400 w-24 shrink-0">State</span>
                  <span className="text-gray-800">{metadataStation.state}</span>
                </div>
              )}
              {metadataStation.language && (
                <div className="flex">
                  <span className="text-gray-400 w-24 shrink-0">Language</span>
                  <span className="text-gray-800">{metadataStation.language}</span>
                </div>
              )}
              <div className="flex">
                <span className="text-gray-400 w-24 shrink-0">Codec</span>
                <span className="text-gray-800">{metadataStation.codec || '?'}</span>
              </div>
              <div className="flex">
                <span className="text-gray-400 w-24 shrink-0">Bitrate</span>
                <span className="text-gray-800">{metadataStation.bitrate ? `${metadataStation.bitrate} kbps` : '?'}</span>
              </div>
              {metadataStation.tags && (
                <div className="flex">
                  <span className="text-gray-400 w-24 shrink-0">Tags</span>
                  <span className="text-gray-800">{metadataStation.tags}</span>
                </div>
              )}
              {metadataStation.homepage && (
                <div className="flex">
                  <span className="text-gray-400 w-24 shrink-0">Homepage</span>
                  <a href={metadataStation.homepage} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 truncate">{metadataStation.homepage}</a>
                </div>
              )}
              {metadataStation.votes != null && (
                <div className="flex">
                  <span className="text-gray-400 w-24 shrink-0">Votes</span>
                  <span className="text-gray-800">{metadataStation.votes}</span>
                </div>
              )}
            </div>

            <div className="px-6 pb-5 pt-2">
              <button
                onClick={() => {
                  handlePlayStation(metadataStation);
                  setMetadataStation(null);
                }}
                className="w-full py-2.5 rounded-lg bg-gray-900 text-white font-medium text-sm hover:bg-gray-800 transition-colors cursor-pointer"
              >
                Play Station
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default GlobeView;

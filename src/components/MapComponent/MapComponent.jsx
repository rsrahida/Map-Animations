import { useEffect, useRef, useState } from "react";
import Map from "@arcgis/core/Map";
import SceneView from "@arcgis/core/views/SceneView";
import ImageryTileLayer from "@arcgis/core/layers/ImageryTileLayer";
import WebTileLayer from "@arcgis/core/layers/WebTileLayer";
import esriConfig from "@arcgis/core/config";
import styles from "./MapComponent.module.css";

esriConfig.apiKey = import.meta.env.VITE_ARCGIS_API_KEY;

function MapComponent() {
  const mapDiv = useRef(null);
  const viewRef = useRef(null);
  const layersRef = useRef({});
  const framesRef = useRef([]);
  const frameIndexRef = useRef(0);
  const intervalRef = useRef(null);

  const [activeLayers, setActiveLayers] = useState({
    wind: false,
    rain: false,
    ocean: false,
  });

  const [currentTime, setCurrentTime] = useState(null);

  useEffect(() => {
    if (!mapDiv.current) return;

    let view;

    async function init() {
      const windLayer = new ImageryTileLayer({
        url: "https://tiledimageservices.arcgis.com/P3ePLMYs2RVChkJx/arcgis/rest/services/Global_Average_Wind_Speeds_Month_Altitude/ImageServer",
        renderer: {
          type: "flow",
          trailLength: 30,
          maxPathLength: 60,
          flowSpeed: 2,
          trailWidth: 2,
          color: "white",
        },
        visible: activeLayers.wind,
      });

      const rainLayer = new WebTileLayer({
        urlTemplate:
          "https://tilecache.rainviewer.com/v2/radar/nowcast/256/{level}/{col}/{row}/2/1_1.png",
        visible: activeLayers.rain,
        opacity: 0.75,
        maxScale: 4622324,
      });

      const oceanLayer = new ImageryTileLayer({
        url: "https://tiledimageservices.arcgis.com/jIL9msH9OI208GCb/arcgis/rest/services/Spilhaus_UV_ocean_currents/ImageServer",
        renderer: {
          type: "flow",
          density: 1,
          maxPathLength: 10,
          trailWidth: "2px",
          color: "cyan",
        },
        visible: activeLayers.ocean,
      });

      layersRef.current = { windLayer, rainLayer, oceanLayer };

      const map = new Map({
        basemap: "satellite",
        ground: "world-elevation",
        layers: [oceanLayer, rainLayer, windLayer],
      });

      view = new SceneView({
        container: mapDiv.current,
        map: map,
        camera: {
          position: { longitude: 49.87, latitude: 20, z: 15000000 },
          tilt: 0,
        },
        viewingMode: "global",
      });

      viewRef.current = view;

      await loadFrames();
      startAnimation();
    }

    init();

    return () => {
      if (view) view.destroy();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function loadFrames() {
    try {
      const res = await fetch(
        "https://api.rainviewer.com/public/weather-maps.json",
      );
      const data = await res.json();
      framesRef.current = data.radar?.past || [];
    } catch (err) {
      console.error("RainViewer kadrları alınmadı:", err);
    }
  }

  function startAnimation() {
    if (intervalRef.current) clearInterval(intervalRef.current);

    intervalRef.current = setInterval(() => {
      const frames = framesRef.current;
      const { rainLayer } = layersRef.current;
      if (!rainLayer?.visible || frames.length === 0) return;

      const idx = frameIndexRef.current % frames.length;
      const frame = frames[idx];
      rainLayer.urlTemplate = `https://tilecache.rainviewer.com${frame.path}/256/{level}/{col}/{row}/2/1_1.png`;
      frameIndexRef.current = idx + 1;
      setCurrentTime(new Date(frame.time * 1000).toLocaleTimeString());
    }, 1000);
  }

  const toggleLayer = (key) => {
    setActiveLayers((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      const layerMap = {
        wind: layersRef.current.windLayer,
        rain: layersRef.current.rainLayer,
        ocean: layersRef.current.oceanLayer,
      };
      if (layerMap[key]) layerMap[key].visible = updated[key];
      return updated;
    });
  };

  const layers = [
    { key: "wind", label: "Külək", icon: "💨" },
    { key: "rain", label: "Yağış radarı", icon: "🌧" },
    { key: "ocean", label: "Dəniz axınları", icon: "🌊" },
  ];

  return (
    <div className={styles.mapWrapper}>
      <div className={styles.hud}>
        <div className={styles.toolbar}>
          {layers.map(({ key, label, icon }) => {
            const isActive = activeLayers[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleLayer(key)}
                aria-pressed={isActive}
                className={`${styles.segment} ${styles[key]} ${
                  isActive ? styles.active : ""
                }`}
              >
                <span className={styles.icon}>{icon}</span>
                <span className={styles.labelText}>{label}</span>
                <span className={styles.dot} />
              </button>
            );
          })}
        </div>

        {currentTime && (
          <div className={styles.radarChip}>
            <span className={styles.pulse} />
            <span className={styles.radarLabel}>Radar</span>
            <span>{currentTime}</span>
          </div>
        )}
      </div>

      <div ref={mapDiv} className={styles.mapContainer}></div>
    </div>
  );
}

export default MapComponent;

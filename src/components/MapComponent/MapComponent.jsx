import { useEffect, useRef, useState } from "react";
import Map from "@arcgis/core/Map";
import SceneView from "@arcgis/core/views/SceneView";
import ImageryTileLayer from "@arcgis/core/layers/ImageryTileLayer";
import WebTileLayer from "@arcgis/core/layers/WebTileLayer";
import esriConfig from "@arcgis/core/config";
import styles from "./MapComponent.module.css";

esriConfig.apiKey = import.meta.env.VITE_ARCGIS_API_KEY;

const GIBS_LAYER_ID = "VIIRS_SNPP_CorrectedReflectance_TrueColor";
const GIBS_MATRIX_SET = "GoogleMapsCompatible_Level9";
const CLOUD_HISTORY_DAYS = 7;

function buildCloudFrames() {
  const frames = [];
  for (let i = CLOUD_HISTORY_DAYS; i >= 0; i -= 1) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    frames.push(d.toISOString().slice(0, 10));
  }
  return frames;
}

function MapComponent() {
  const mapDiv = useRef(null);
  const viewRef = useRef(null);
  const layersRef = useRef({});
  const framesRef = useRef(buildCloudFrames());
  const frameIndexRef = useRef(framesRef.current.length - 1);
  const intervalRef = useRef(null);
  const dailyRefreshRef = useRef(null);

  const [activeLayers, setActiveLayers] = useState({
    wind: false,
    clouds: false,
    ocean: false,
  });

  const [locating, setLocating] = useState(false);

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

      const cloudLayer = new WebTileLayer({
        urlTemplate: buildCloudTileUrl(
          framesRef.current[frameIndexRef.current],
        ),
        visible: activeLayers.clouds,
        opacity: 0.85,
        copyright: "NASA EOSDIS GIBS / VIIRS",
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

      layersRef.current = { windLayer, cloudLayer, oceanLayer };

      const map = new Map({
        basemap: "satellite",
        ground: "world-elevation",
        layers: [oceanLayer, cloudLayer, windLayer],
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

      startAnimation();

      dailyRefreshRef.current = setInterval(refreshFrameList, 60 * 60 * 1000);
    }

    init();

    return () => {
      if (view) view.destroy();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (dailyRefreshRef.current) clearInterval(dailyRefreshRef.current);
    };
  }, []);

  function buildCloudTileUrl(date) {
    return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${GIBS_LAYER_ID}/default/${date}/${GIBS_MATRIX_SET}/{level}/{row}/{col}.jpg`;
  }

  function refreshFrameList() {
    const newFrames = buildCloudFrames();
    const wasAtLatest = frameIndexRef.current === framesRef.current.length - 1;
    framesRef.current = newFrames;
    if (wasAtLatest) {
      frameIndexRef.current = newFrames.length - 1;
    }
  }

  function startAnimation() {
    if (intervalRef.current) clearInterval(intervalRef.current);

    const FRAME_DELAY = 1200;
    const LAST_FRAME_PAUSE = 3;

    let pauseTicks = 0;

    intervalRef.current = setInterval(() => {
      const frames = framesRef.current;
      const { cloudLayer } = layersRef.current;
      if (!cloudLayer?.visible || frames.length === 0) return;

      const idx = frameIndexRef.current % frames.length;
      const isLastFrame = idx === frames.length - 1;

      if (isLastFrame && pauseTicks > 0) {
        pauseTicks -= 1;
        if (pauseTicks === 0) frameIndexRef.current = 0;
        return;
      }

      cloudLayer.urlTemplate = buildCloudTileUrl(frames[idx]);
      cloudLayer.refresh();

      if (isLastFrame) {
        pauseTicks = LAST_FRAME_PAUSE;
      } else {
        frameIndexRef.current = idx + 1;
      }
    }, FRAME_DELAY);
  }

  const toggleLayer = (key) => {
    setActiveLayers((prev) => {
      const updated = { ...prev, [key]: !prev[key] };
      const layerMap = {
        wind: layersRef.current.windLayer,
        clouds: layersRef.current.cloudLayer,
        ocean: layersRef.current.oceanLayer,
      };
      if (layerMap[key]) layerMap[key].visible = updated[key];
      if (key === "clouds" && updated.clouds) {
        frameIndexRef.current = framesRef.current.length - 1;
      }

      return updated;
    });
  };

  const goToMyLocation = () => {
    if (!navigator.geolocation) {
      console.error("Bu brauzer geolokasiyanı dəstəkləmir.");
      return;
    }

    setLocating(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (viewRef.current) {
          viewRef.current.goTo({
            position: { longitude, latitude, z: 50000 },
            tilt: 0,
          });
        }
        setLocating(false);
      },
      (err) => {
        console.error("Mövqe alınmadı:", err);
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const layers = [
    { key: "wind", label: "Külək", icon: "💨" },
    { key: "clouds", label: "Bulud örtüyü", icon: "☁️" },
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

          <span className={styles.divider} />

          <button
            type="button"
            onClick={goToMyLocation}
            disabled={locating}
            aria-label="Mənim mövqeyim"
            className={`${styles.segment} ${styles.locate} ${
              locating ? styles.locating : ""
            }`}
          >
            <span className={styles.labelText}>
              {locating ? "Axtarılır..." : "Mövqeyim"}
            </span>
          </button>
        </div>
      </div>

      <div ref={mapDiv} className={styles.mapContainer}></div>
    </div>
  );
}

export default MapComponent;

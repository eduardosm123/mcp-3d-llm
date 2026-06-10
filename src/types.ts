export type Severity = "error" | "warning" | "info";

export interface Issue {
  id: string;
  severity: Severity;
  message: string;
  objects?: string[];
  suggestion: string;
}

export interface ViewAngles {
  name?: string;
  azimuth_deg: number;
  elevation_deg: number;
  distance_factor?: number;
}

export type ViewSpec =
  | "front"
  | "back"
  | "left"
  | "right"
  | "top"
  | "bottom"
  | "three-quarter"
  | ViewAngles;

export const NAMED_VIEWS: Record<string, { azimuth_deg: number; elevation_deg: number }> = {
  front: { azimuth_deg: 0, elevation_deg: 10 },
  back: { azimuth_deg: 180, elevation_deg: 10 },
  left: { azimuth_deg: -90, elevation_deg: 10 },
  right: { azimuth_deg: 90, elevation_deg: 10 },
  top: { azimuth_deg: 0, elevation_deg: 85 },
  bottom: { azimuth_deg: 0, elevation_deg: -85 },
  "three-quarter": { azimuth_deg: 35, elevation_deg: 25 },
};

export function resolveView(view: ViewSpec): Required<ViewAngles> {
  if (typeof view === "string") {
    const named = NAMED_VIEWS[view];
    return { name: view, ...named, distance_factor: 1.0 };
  }
  return {
    name: view.name ?? `az${view.azimuth_deg}_el${view.elevation_deg}`,
    azimuth_deg: view.azimuth_deg,
    elevation_deg: view.elevation_deg,
    distance_factor: view.distance_factor ?? 1.0,
  };
}

export interface RenderOptions {
  width: number;
  height: number;
  settle_frames: number;
  extra_wait_ms: number;
  timeout_ms: number;
  format: "jpeg" | "png";
}

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  width: 800,
  height: 600,
  settle_frames: 10,
  extra_wait_ms: 0,
  timeout_ms: 15000,
  format: "jpeg",
};

/** Engine detection result, from most capable to least. */
export type Engine =
  | "threejs" // window.__scene registered: deep introspection + auto-orbit available
  | "threejs-detected" // Three.js on page but __scene not registered
  | "webgl"
  | "canvas2d"
  | "none";

export interface CanvasInfo {
  type: string;
  ok: boolean;
  width: number;
  height: number;
}

export interface ProbeSnapshot {
  engine: Engine;
  deep: boolean;
  hasSetView: boolean;
  hasRedraw: boolean;
  rafTicked: boolean;
  canvases: CanvasInfo[];
  contextCreationErrors: string[];
  contextLost: boolean;
}

export interface PageLog {
  console_errors: string[];
  console_warnings: string[];
  page_errors: string[];
  failed_requests: string[];
}

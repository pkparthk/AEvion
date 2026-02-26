export interface GraphNode {
  id: string; 
  x: number; 
  y: number;
  type: "road" | "charger" | string;
}

export interface GraphEdge {
  src: string;
  dst: string;
  distance: number; 
  speed: number; 
  slope: number; 
  travel_time: number; 
  visual_weight: number;
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface PerNodeReport {
  node: string;
  type: "road" | "charger" | string;
  soc_before_kwh: number;
  charge_kwh: number;
  charge_time_min: number;
  soc_after_kwh: number;
  travel_time_to_next_min: number;
}

/** The "best" (or any candidate) route record from MILP */
export interface RouteResult {
  feasible: boolean;
  path: string[];
  charge_plan: Record<string, number>; // nodeId → kWh charged
  charge_kwh_total: number;
  total_charge_time_min: number;
  travel_time_min: number;
  per_node_report: PerNodeReport[];
  lstm_corrected: boolean;
  // enriched by backend before returning:
  total_distance_m: number;
  initial_soc_kwh: number;
  final_soc_kwh: number;
}

/** Full /route response */
export interface RouteResponse {
  best: RouteResult | null;
  all: RouteResult[];
  error: string | null;
  error_reason?: string;
  reachable_nodes: string[];
}

export interface RouteRequest {
  startNode: string;
  endNode: string;
  initialSOC_percent: number;
  mode?: "time" | "cost" | "safety";
}

export interface LSTMStatus {
  enabled: boolean;
  [key: string]: any;
}

export interface GraphViewProps {
  graphData: GraphResponse | null;
  routeResult: RouteResult | null;
  isLoading: boolean;
}

export interface InputFormProps {
  nodes: string[];
  onRouteRequest: (request: RouteRequest) => void;
  isLoading: boolean;
}

export interface StatsDisplayProps {
  routeResult: RouteResult | null;
  allCandidates: RouteResult[];
  isVisible: boolean;
}

//  API error 
export interface ApiError {
  message: string;
  status?: number;
  details?: any;
}

//  Application state
export interface AppState {
  graphData: GraphResponse | null;
  nodes: string[];
  routeResult: RouteResult | null;
  allCandidates: RouteResult[];
  isLoadingGraph: boolean;
  isLoadingRoute: boolean;
  error: string | null;
}
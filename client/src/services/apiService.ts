import axios, { AxiosResponse } from "axios";
import type {
  GraphResponse,
  RouteRequest,
  RouteResponse,
  LSTMStatus,
  ApiError,
} from "../types";

const API_BASE_URL =
  (import.meta.env.VITE_API_URL as string) || "http://localhost:8000";

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});


const handleApiError = (error: any): ApiError => {
  if (error.response) {
    return {
      message:
        error.response.data?.detail ||
        error.response.data?.message ||
        "API Error",
      status: error.response.status,
      details: error.response.data,
    };
  } else if (error.request) {
    return {
      message: `Unable to connect to AEVION backend at ${API_BASE_URL}. Please ensure the server is running and the URL is reachable.`,
      status: 0,
      details: null,
    };
  }
  return {
    message: error.message || "Unknown error",
    status: 0,
    details: null,
  };
};

class AevionApiService {  
  async getGraph(): Promise<GraphResponse> {
    try {
      console.log("🌐 Fetching city graph…");
      const res: AxiosResponse<GraphResponse> = await apiClient.get("/graph");
      console.log(
        `✅ Graph loaded: ${res.data.nodes.length} nodes, ${res.data.edges.length} edges`,
      );
      return res.data;
    } catch (err) {
      console.error("❌ Failed to fetch graph:", err);
      throw handleApiError(err);
    }
  }

  async getNodes(): Promise<string[]> {
    try {
      console.log("📍 Fetching node list…");
      const res: AxiosResponse<string[]> = await apiClient.get("/nodes");
      console.log(`✅ ${res.data.length} nodes received`);
      return res.data;
    } catch (err) {
      console.error("❌ Failed to fetch nodes:", err);
      throw handleApiError(err);
    }
  }

  async optimizeRoute(request: RouteRequest): Promise<RouteResponse> {
    const { startNode, endNode, initialSOC_percent, mode = "time" } = request;

    try {
      console.log(
        "🎯 Optimizing route:",
        startNode,
        "→",
        endNode,
        `(mode=${mode})`,
      );
      console.log("📊 Pipeline: KSP → Physics → LSTM → MILP");

      const res: AxiosResponse<RouteResponse> = await apiClient.get("/route", {
        params: { start: startNode, end: endNode, mode },
      });

      const data = res.data;

      if (data.error) {
        console.warn(
          "⚠️ Route error from backend:",
          data.error,
          data.error_reason,
        );
      } else if (data.best) {
        console.log("✅ Route found:", data.best.path.join(" → "));
        console.log(
          `   Distance: ${(data.best.total_distance_m / 1000).toFixed(2)} km`,
          `| Time: ${(data.best.travel_time_min + data.best.total_charge_time_min).toFixed(1)} min`,
          `| Charged: ${data.best.charge_kwh_total.toFixed(2)} kWh`,
        );
      }

      return data;
    } catch (err) {
      console.error("❌ Route optimization failed:", err);
      throw handleApiError(err);
    }
  }

  async getLstmStatus(): Promise<LSTMStatus> {
    try {
      const res: AxiosResponse<LSTMStatus> =
        await apiClient.get("/lstm/status");
      return res.data;
    } catch (err) {
      throw handleApiError(err);
    }
  }

  async toggleLstm(
    enabled: boolean,
  ): Promise<{ success: boolean; enabled: boolean; message: string }> {
    try {
      const res = await apiClient.post("/lstm/toggle", { enabled });
      return res.data;
    } catch (err) {
      throw handleApiError(err);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await apiClient.get("/graph", { timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}

// Singleton export
const aevionApi = new AevionApiService();
export const {
  getGraph,
  getNodes,
  optimizeRoute,
  getLstmStatus,
  toggleLstm,
  healthCheck,
} = aevionApi;
export default aevionApi;
export type { ApiError };

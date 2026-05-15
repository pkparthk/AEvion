import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Zap, Car, MapPin, Route, Cpu, Battery, Signal } from "lucide-react";
import GraphView from "./components/GraphView";
import InputForm from "./components/InputForm";
import StatsDisplay from "./components/StatsDisplay";
import Navbar from "./components/Navbar";
import apiService from "./services/apiService";
import type {
  GraphResponse,
  RouteRequest,
  RouteResponse,
  RouteResult,
} from "./types";
import "./index.css";

const App: React.FC = () => {
  const [graphData, setGraphData] = useState<GraphResponse | null>(null);
  const [nodesList, setNodesList] = useState<string[]>([]);
  const [routeResponse, setRouteResponse] = useState<RouteResponse | null>(
    null,
  );
  const [bestRoute, setBestRoute] = useState<RouteResult | null>(null);
  const [isLoadingGraph, setIsLoadingGraph] = useState<boolean>(false);
  const [isLoadingRoute, setIsLoadingRoute] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    loadGraphData();
  }, []);

  const loadGraphData = async (): Promise<void> => {
    try {
      setError(null);
      setWarning(null);
      setIsLoadingGraph(true);

      const [graph, nodes] = await Promise.all([
        apiService.getGraph(),
        apiService.getNodes(),
      ]);

      setGraphData(graph);
      setNodesList(nodes);

      console.log("✅ Graph data loaded successfully:", {
        nodes: graph.nodes.length,
        edges: graph.edges.length,
        nodesList: nodes.length,
      });
    } catch (error) {
      console.error("❌ Failed to load graph data:", error);
      setError(
        "Failed to load network data. Please check your backend connection.",
      );
    } finally {
      setIsLoadingGraph(false);
    }
  };

  const handleRouteRequest = async (request: RouteRequest): Promise<void> => {
    try {
      setError(null);
      setWarning(null);
      setIsLoadingRoute(true);
      setRouteResponse(null);
      setBestRoute(null);

      console.log("🎯 Starting route optimization:", request);

      const result = await apiService.optimizeRoute(request);

      setRouteResponse(result);

      if (result.error) {
        if (
          result.error === "battery_constraint" ||
          result.error === "unreachable"
        ) {
          setWarning(
            result.error_reason ||
              `Route warning: ${result.error}. Some nodes may be unreachable with current battery settings.`,
          );
        } else {
          setError(result.error_reason || `Route error: ${result.error}.`);
        }
      } else if (result.best) {
        setBestRoute(result.best);
        console.log("✅ Route optimization completed:", {
          path: result.best.path,
          distance_km: (result.best.total_distance_m / 1000).toFixed(2),
          time_min: (
            result.best.travel_time_min + result.best.total_charge_time_min
          ).toFixed(1),
          chargingStops: Object.keys(result.best.charge_plan).length,
        });
      }
    } catch (error) {
      console.error("❌ Route optimization failed:", error);
      setError("Failed to optimize route. Please try again.");
    } finally {
      setIsLoadingRoute(false);
    }
  };

  const handleRetryGraphLoad = (): void => {
    loadGraphData();
  };

  const handleNewRoute = (): void => {
    setRouteResponse(null);
    setBestRoute(null);
    setError(null);
    setWarning(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-dark-950 via-dark-900 to-dark-800 relative overflow-hidden">
      {/* Animated background particles */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute w-2 h-2 bg-electric-400 rounded-full opacity-20"
            animate={{
              x: [0, window.innerWidth],
              y: [
                Math.random() * window.innerHeight,
                Math.random() * window.innerHeight,
              ],
            }}
            transition={{
              duration: 20 + i * 2,
              repeat: Infinity,
              repeatType: "reverse",
              ease: "linear",
            }}
            style={{
              left: Math.random() * window.innerWidth,
              top: Math.random() * window.innerHeight,
            }}
          />
        ))}
      </div>

      <Navbar />
      <div id="home" />

      <div className="max-w-7xl mx-auto px-4 py-8 relative z-10 pt-24">
        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="mb-6"
          >
            <div className="glass-card-dark border border-red-500/30 bg-red-500/10 rounded-xl p-6">
              <div className="flex items-center">
                <motion.span
                  className="text-red-400 text-2xl mr-4"
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 0.5, repeat: 3 }}
                >
                  ⚠️
                </motion.span>
                <div className="flex-1">
                  <div className="font-semibold text-red-300 text-lg">
                    System Error
                  </div>
                  <div className="text-red-200 mt-1">{error}</div>
                </div>
                <motion.button
                  onClick={handleRetryGraphLoad}
                  className="btn-glass bg-red-500/20 hover:bg-red-500/30 text-red-300"
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                >
                  Retry Connection
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
        
        {warning && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="mb-6"
          >
            <div className="glass-card-dark border border-yellow-500/30 bg-yellow-500/10 rounded-xl p-6">
              <div className="flex items-center">
                <motion.span
                  className="text-yellow-400 text-2xl mr-4"
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  ⚠️
                </motion.span>
                <div className="flex-1">
                  <div className="font-semibold text-yellow-300 text-lg">
                    Route Unreachable
                  </div>
                  <div className="text-yellow-100 mt-1">{warning}</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        <motion.div
          id="graph"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="mb-8"
        >
          <GraphView
            graphData={graphData}
            routeResult={bestRoute}
            isLoading={isLoadingGraph}
          />
        </motion.div>

        <motion.div
          id="controls"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
          className="mb-8"
        >
          <InputForm
            nodes={nodesList}
            onRouteRequest={handleRouteRequest}
            isLoading={isLoadingRoute}
          />
        </motion.div>

        <motion.div
          id="results"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.8, duration: 0.8 }}
        >
          <StatsDisplay
            routeResult={bestRoute}
            allCandidates={routeResponse?.all ?? []}
            isVisible={!!bestRoute && !isLoadingRoute}
          />
        </motion.div>

        {routeResponse && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 1, duration: 0.6 }}
            className="mt-8 text-center"
          >
            <motion.button
              onClick={handleNewRoute}
              className="btn-glass px-12 py-4 text-lg"
              whileHover={{
                scale: 1.05,
                boxShadow: "0 0 30px rgba(59, 130, 246, 0.6)",
              }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="flex items-center space-x-3">
                <Route size={24} />
                <span>Plan Another Route</span>
              </div>
            </motion.button>
          </motion.div>
        )}
      </div>

      <motion.div
        id="about"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2, duration: 0.8 }}
        className="relative z-10 mt-16"
      >
        <div className="glass-card-dark border-t border-white/10 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-4 py-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* About */}
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.4, duration: 0.6 }}
                className="glass-card rounded-xl p-6"
              >
                <h3 className="text-xl font-bold mb-4 text-electric-400 flex items-center">
                  <MapPin size={24} className="mr-3" />
                  About AEVION
                </h3>
                <p className="text-gray-300 leading-relaxed">
                  Revolutionary EV route optimization using cutting-edge machine
                  learning and mathematical programming to minimize energy
                  consumption while ensuring optimal charging strategies.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.6, duration: 0.6 }}
                className="glass-card rounded-xl p-6"
              >
                <h3 className="text-xl font-bold mb-4 text-eco-400 flex items-center">
                  <Cpu size={24} className="mr-3" />
                  Technology Stack
                </h3>
                <ul className="space-y-3 text-gray-300">
                  <motion.li
                    className="flex items-center"
                    whileHover={{ x: 5 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <span className="mr-3 text-electric-400">🔬</span>
                    Physics-based energy modeling
                  </motion.li>
                  <motion.li
                    className="flex items-center"
                    whileHover={{ x: 5 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <span className="mr-3 text-eco-400">🧠</span>
                    LSTM neural networks
                  </motion.li>
                  <motion.li
                    className="flex items-center"
                    whileHover={{ x: 5 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <span className="mr-3 text-electric-400">📊</span>
                    MILP optimization solver
                  </motion.li>
                  <motion.li
                    className="flex items-center"
                    whileHover={{ x: 5 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <span className="mr-3 text-eco-400">🗺️</span>
                    K-Shortest Paths (Yen's)
                  </motion.li>
                </ul>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 1.8, duration: 0.6 }}
                className="glass-card rounded-xl p-6"
              >
                <h3 className="text-xl font-bold mb-4 text-electric-400 flex items-center">
                  <Battery size={24} className="mr-3" />
                  Performance
                </h3>
                <ul className="space-y-3 text-gray-300">
                  <motion.li
                    className="flex items-center"
                    whileHover={{ x: 5 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <span className="mr-3 text-eco-400">⚡</span>
                    Real-time optimization
                  </motion.li>
                  <motion.li
                    className="flex items-center"
                    whileHover={{ x: 5 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <span className="mr-3 text-electric-400">🎯</span>
                    Multi-objective planning
                  </motion.li>
                  <motion.li
                    className="flex items-center"
                    whileHover={{ x: 5 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <span className="mr-3 text-eco-400">📈</span>
                    Scalable architecture
                  </motion.li>
                  <motion.li
                    className="flex items-center"
                    whileHover={{ x: 5 }}
                    transition={{ type: "spring", stiffness: 300 }}
                  >
                    <span className="mr-3 text-electric-400">🔋</span>
                    Battery-aware routing
                  </motion.li>
                </ul>
              </motion.div>
            </div>

            <motion.div
              className="border-t border-white/10 mt-8 pt-8 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2, duration: 0.6 }}
            >
              <p className="text-gray-400">
                &copy; 2025 AEVION - Advanced Electric Vehicle Intelligence
                Optimization Network
              </p>
              <motion.p
                className="text-sm text-gray-500 mt-2"
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                Powering the future of sustainable transportation
              </motion.p>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default App;

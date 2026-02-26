import React from "react";
import { motion } from "framer-motion";
import {
  BarChart3,
  Route,
  Zap,
  Clock,
  Battery,
  MapPin,
  TrendingUp,
  Target,
  CheckCircle,
  Activity,
} from "lucide-react";
import type { StatsDisplayProps, PerNodeReport } from "../types";

const StatsDisplay: React.FC<StatsDisplayProps> = ({
  routeResult,
  allCandidates,
  isVisible,
}) => {
  if (!isVisible || !routeResult) {
    return null;
  }

  const BATTERY_CAP_KWH = 100.0; // matches backend default
  const totalDistanceKm = routeResult.total_distance_m / 1000;
  const totalEnergyKwh =
    routeResult.initial_soc_kwh -
    routeResult.final_soc_kwh +
    routeResult.charge_kwh_total;
  const totalTimeMin =
    routeResult.travel_time_min + routeResult.total_charge_time_min;
  const finalSocPct = (routeResult.final_soc_kwh / BATTERY_CAP_KWH) * 100;
  const chargingStops: PerNodeReport[] = routeResult.per_node_report.filter(
    (n) => n.charge_kwh > 1e-6,
  );
  const numStops = chargingStops.length;

  // Helper function to format numbers
  const formatNumber = (num: number, decimals = 2): string => {
    return num.toFixed(decimals);
  };

  // Helper function to format time
  const formatTime = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  // Animation variants
  const containerVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  const statsConfig = [
    {
      title: "Total Distance",
      value: `${formatNumber(totalDistanceKm)} km`,
      icon: Route,
      color: "electric",
      bgColor: "electric-500/10",
      borderColor: "electric-500/30",
    },
    {
      title: "Energy Used",
      value: `${formatNumber(totalEnergyKwh)} kWh`,
      icon: Zap,
      color: "eco",
      bgColor: "eco-500/10",
      borderColor: "eco-500/30",
    },
    {
      title: "Total Time",
      value: formatTime(totalTimeMin),
      icon: Clock,
      color: "purple",
      bgColor: "purple-500/10",
      borderColor: "purple-500/30",
    },
    {
      title: "Charging Stops",
      value: numStops.toString(),
      icon: Battery,
      color: "yellow",
      bgColor: "yellow-500/10",
      borderColor: "yellow-500/30",
    },
  ];

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="max-w-5xl mx-auto"
    >
      <div className="glass-card-dark rounded-xl border border-electric-500/30 backdrop-blur-xl overflow-hidden">
        {/* Header */}
        <motion.div
          variants={itemVariants}
          className="glass-dark border-b border-white/10 p-6"
        >
          <div className="flex items-center mb-4">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="mr-4"
            >
              <BarChart3 size={32} className="text-electric-400" />
            </motion.div>
            <div>
              <h2 className="text-3xl font-bold text-white text-shadow-lg">
                <span className="gradient-text">Optimization Results</span>
              </h2>
              <p className="text-gray-300 mt-1">
                Route optimized using our
                <span className="text-electric-400 font-semibold mx-1">
                  Physics
                </span>
                +<span className="text-eco-400 font-semibold mx-1">LSTM</span>+
                <span className="text-purple-400 font-semibold mx-1">MILP</span>
                pipeline
              </p>
            </div>
          </div>
        </motion.div>

        <div className="p-6 space-y-8">
          {/* Quick Stats Grid */}
          <motion.div
            variants={itemVariants}
            className="grid grid-cols-2 md:grid-cols-4 gap-4"
          >
            {statsConfig.map((stat, index) => (
              <motion.div
                key={stat.title}
                variants={itemVariants}
                whileHover={{ scale: 1.05, y: -5 }}
                transition={{ type: "spring", stiffness: 300 }}
                className={`glass-card bg-${stat.bgColor} border-${stat.borderColor} p-6 rounded-xl`}
              >
                <div className="text-center">
                  <div className="flex items-center justify-center mb-3">
                    <stat.icon size={24} className={`text-${stat.color}-400`} />
                  </div>
                  <div className="text-sm font-semibold text-gray-300 mb-2">
                    {stat.title}
                  </div>
                  <motion.div
                    className={`text-2xl font-bold text-${stat.color}-400`}
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{
                      delay: 0.5 + index * 0.1,
                      type: "spring",
                      stiffness: 300,
                    }}
                  >
                    {stat.value}
                  </motion.div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Route Path */}
          <motion.div
            variants={itemVariants}
            className="glass-card bg-dark-800/20 border-white/10 rounded-xl p-6"
          >
            <div className="flex items-center mb-6">
              <Route size={24} className="text-electric-400 mr-3" />
              <h3 className="text-xl font-bold text-white">Optimal Path</h3>
            </div>

            <div className="space-y-4">
              <motion.div
                className="flex flex-wrap items-center gap-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8, duration: 0.6 }}
              >
                {routeResult.path.map((node, index) => (
                  <React.Fragment key={index}>
                    <motion.div
                      className="glass-card bg-electric-500/10 border-electric-400/30 px-4 py-2 rounded-lg font-mono text-white font-semibold"
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{
                        delay: 1 + index * 0.1,
                        type: "spring",
                        stiffness: 300,
                      }}
                      whileHover={{ scale: 1.1 }}
                    >
                      {node}
                    </motion.div>
                    {index < routeResult.path.length - 1 && (
                      <motion.div
                        className="text-electric-400 text-2xl"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 1.2 + index * 0.1 }}
                      >
                        →
                      </motion.div>
                    )}
                  </React.Fragment>
                ))}
              </motion.div>
            </div>
          </motion.div>

          {/* Charging Plan */}
          {chargingStops.length > 0 && (
            <motion.div
              variants={itemVariants}
              className="glass-card bg-eco-500/5 border-eco-500/20 rounded-xl p-6"
            >
              <div className="flex items-center mb-6">
                <Battery size={24} className="text-eco-400 mr-3" />
                <h3 className="text-xl font-bold text-white">
                  Charging Strategy
                </h3>
              </div>

              <div className="space-y-4">
                {chargingStops.map((stop: PerNodeReport, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.2 + index * 0.2 }}
                    whileHover={{ scale: 1.02, x: 5 }}
                    className="glass-card bg-dark-800/30 border-eco-400/20 p-4 rounded-lg"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-center space-x-4">
                        <motion.div
                          className="w-10 h-10 bg-gradient-to-r from-eco-500 to-eco-600 text-white rounded-full flex items-center justify-center text-sm font-bold"
                          whileHover={{ rotate: 360 }}
                          transition={{ duration: 0.5 }}
                        >
                          {index + 1}
                        </motion.div>
                        <div>
                          <div className="font-semibold text-white flex items-center">
                            <MapPin size={16} className="mr-2 text-eco-400" />
                            Node {stop.node}
                          </div>
                          <div className="text-sm text-gray-300">
                            SOC:{" "}
                            {formatNumber(
                              (stop.soc_before_kwh / BATTERY_CAP_KWH) * 100,
                              1,
                            )}
                            % →{" "}
                            {formatNumber(
                              (stop.soc_after_kwh / BATTERY_CAP_KWH) * 100,
                              1,
                            )}
                            %
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 sm:mt-0 text-right">
                        <div className="font-bold text-eco-400 text-lg">
                          {formatTime(stop.charge_time_min)}
                        </div>
                        <div className="text-sm text-gray-300">
                          +{formatNumber(stop.charge_kwh, 1)} kWh
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Energy Efficiency Metrics */}
          <motion.div
            variants={itemVariants}
            className="glass-card bg-purple-500/5 border-purple-500/20 rounded-xl p-6"
          >
            <div className="flex items-center mb-6">
              <TrendingUp size={24} className="text-purple-400 mr-3" />
              <h3 className="text-xl font-bold text-white">
                Performance Metrics
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                {
                  title: "Energy Efficiency",
                  value:
                    totalEnergyKwh > 0
                      ? `${formatNumber(totalDistanceKm / totalEnergyKwh, 2)} km/kWh`
                      : "N/A",
                  subtitle: "Distance per energy unit",
                  icon: Activity,
                  color: "electric-400",
                },
                {
                  title: "Average Speed",
                  value:
                    totalTimeMin > 0
                      ? `${formatNumber((totalDistanceKm / totalTimeMin) * 60, 1)} km/h`
                      : "N/A",
                  subtitle: "Including charging time",
                  icon: Target,
                  color: "eco-400",
                },
                {
                  title: "Final SOC",
                  value: `${formatNumber(finalSocPct, 1)}%`,
                  subtitle: "Battery at destination",
                  icon: Battery,
                  color: "purple-400",
                },
              ].map((metric, index) => (
                <motion.div
                  key={metric.title}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.5 + index * 0.1 }}
                  whileHover={{ scale: 1.05, y: -3 }}
                  className="glass-card bg-dark-800/30 border-white/10 p-5 rounded-lg text-center"
                >
                  <div className="flex items-center justify-center mb-3">
                    <metric.icon size={20} className={`text-${metric.color}`} />
                  </div>
                  <div className="text-sm font-semibold text-gray-300 mb-2">
                    {metric.title}
                  </div>
                  <div
                    className={`text-xl font-bold text-${metric.color} mb-1`}
                  >
                    {metric.value}
                  </div>
                  <div className="text-xs text-gray-400">{metric.subtitle}</div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Success Message */}
          <motion.div
            variants={itemVariants}
            className="glass-card bg-eco-500/10 border-eco-400/30 rounded-xl p-6"
          >
            <div className="flex items-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 1.8, type: "spring", stiffness: 300 }}
                className="mr-4"
              >
                <CheckCircle size={32} className="text-eco-400" />
              </motion.div>
              <div className="flex-1">
                <div className="font-bold text-eco-300 text-lg">
                  Optimization Complete!
                </div>
                <div className="text-gray-300 mt-1">
                  {numStops === 0
                    ? "🎯 Route requires no charging stops - your battery is sufficient!"
                    : `⚡ Optimized route with ${numStops} strategic charging stop${
                        numStops > 1 ? "s" : ""
                      }`}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
};

export default StatsDisplay;

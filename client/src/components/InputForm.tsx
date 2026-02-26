import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  MapPin,
  Battery,
  Brain,
  Target,
  Route,
  Zap,
  Navigation,
  AlertCircle,
  Settings,
} from "lucide-react";
import type { InputFormProps, RouteRequest } from "../types";

const InputForm: React.FC<InputFormProps> = ({
  nodes,
  onRouteRequest,
  isLoading,
}) => {
  const [startNode, setStartNode] = useState<string>("");
  const [endNode, setEndNode] = useState<string>("");
  const [initialSOC, setInitialSOC] = useState<number>(80);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (nodes && nodes.length >= 2 && !startNode && !endNode) {
      setStartNode(nodes[0]);
      setEndNode(nodes[1]);
    }
  }, [nodes, startNode, endNode]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!startNode) {
      newErrors.startNode = "Please select a start node";
    }

    if (!endNode) {
      newErrors.endNode = "Please select an end node";
    }

    if (startNode === endNode) {
      newErrors.endNode = "Start and end nodes must be different";
    }

    if (initialSOC < 10 || initialSOC > 100) {
      newErrors.initialSOC = "Initial SOC must be between 10% and 100%";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();

    if (validateForm()) {
      const request: RouteRequest = {
        startNode,
        endNode,
        initialSOC_percent: initialSOC,
      };

      onRouteRequest(request);
    }
  };

  const getBatteryColor = (soc: number) => {
    if (soc >= 70) return "text-eco-400";
    if (soc >= 40) return "text-yellow-400";
    return "text-red-400";
  };

  const optimizationSteps = [
    {
      step: "1",
      title: "K-Shortest Paths",
      description: "Generate route candidates using Yen's algorithm",
      icon: Route,
      colorClass: "text-electric-400",
      delay: 0.6,
    },
    {
      step: "2",
      title: "Physics + LSTM",
      description: "Predict energy consumption with neural networks",
      icon: Brain,
      colorClass: "text-eco-400",
      delay: 0.7,
    },
    {
      step: "3",
      title: "MILP Optimization",
      description: "Select optimal route using mathematical programming",
      icon: Target,
      colorClass: "text-purple-400",
      delay: 0.8,
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="max-w-5xl mx-auto"
    >
      <div className="glass-card-dark rounded-xl border border-electric-500/30 backdrop-blur-xl overflow-hidden">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="glass-dark border-b border-white/10 p-6"
        >
          <div className="flex items-center mb-3">
            <motion.div
              animate={{ rotate: [0, 360] }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="mr-4"
            >
              <Navigation size={32} className="text-electric-400" />
            </motion.div>
            <div>
              <h2 className="text-3xl font-bold text-white text-shadow-lg">
                <span className="gradient-text">AEVION</span> Route Optimizer
              </h2>
              <p className="text-gray-300 mt-1">
                AI-powered route planning with
                <span className="text-electric-400 font-semibold mx-1">
                  Physics
                </span>
                +<span className="text-eco-400 font-semibold mx-1">LSTM</span>+
                <span className="text-purple-400 font-semibold mx-1">MILP</span>
                optimization
              </p>
            </div>
          </div>
        </motion.div>

        <form onSubmit={handleSubmit} className="p-6 space-y-8">
          {/* Route Configuration */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="glass-card bg-electric-500/5 border-electric-500/20 rounded-xl p-6"
          >
            <div className="flex items-center mb-6">
              <MapPin size={24} className="text-electric-400 mr-3" />
              <h3 className="text-xl font-bold text-white">
                Route Configuration
              </h3>
            </div>

            <fieldset
              className="grid grid-cols-1 md:grid-cols-2 gap-6"
              aria-labelledby="route-config"
            >
              <legend id="route-config" className="sr-only">
                Route configuration
              </legend>

              <motion.div
                whileHover={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <label
                  htmlFor="start-node-select"
                  className="block text-sm font-semibold text-electric-300 mb-3"
                >
                  Origin Point
                </label>
                <div className="relative">
                  <select
                    id="start-node-select"
                    aria-label="Origin point"
                    value={startNode}
                    onChange={(e) => setStartNode(e.target.value)}
                    aria-invalid={errors.startNode ? "true" : "false"}
                    className={`input-glass w-full appearance-none ${
                      errors.startNode
                        ? "border-red-500 bg-red-500/10"
                        : "focus:ring-2 focus:ring-electric-400"
                    }`}
                  >
                    <option value="" disabled hidden>
                      Select starting node...
                    </option>
                    {nodes?.map((node) => (
                      <option
                        key={node}
                        value={node}
                        className="bg-dark-800 text-white"
                      >
                        {node}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <Settings size={16} className="text-gray-400" />
                  </div>
                </div>
                {errors.startNode && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 text-sm text-red-300 flex items-center"
                    role="alert"
                  >
                    <AlertCircle size={16} className="mr-2" />
                    {errors.startNode}
                  </motion.p>
                )}
              </motion.div>

              <motion.div
                whileHover={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <label
                  htmlFor="end-node-select"
                  className="block text-sm font-semibold text-eco-300 mb-3"
                >
                  Destination Point
                </label>
                <div className="relative">
                  <select
                    id="end-node-select"
                    aria-label="Destination point"
                    value={endNode}
                    onChange={(e) => setEndNode(e.target.value)}
                    aria-invalid={errors.endNode ? "true" : "false"}
                    className={`input-glass w-full appearance-none ${
                      errors.endNode
                        ? "border-red-500 bg-red-500/10"
                        : "focus:ring-2 focus:ring-eco-400"
                    }`}
                  >
                    <option value="" disabled hidden>
                      Select destination node...
                    </option>
                    {nodes?.map((node) => (
                      <option
                        key={node}
                        value={node}
                        className="bg-dark-800 text-white"
                      >
                        {node}
                      </option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                    <Target size={16} className="text-gray-400" />
                  </div>
                </div>
                {errors.endNode && (
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-2 text-sm text-red-300 flex items-center"
                    role="alert"
                  >
                    <AlertCircle size={16} className="mr-2" />
                    {errors.endNode}
                  </motion.p>
                )}
              </motion.div>
            </fieldset>
          </motion.div>

          {/* Battery Configuration */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="glass-card bg-eco-500/5 border-eco-500/20 rounded-xl p-6"
          >
            <div className="flex items-center mb-6">
              <Battery size={24} className="text-eco-400 mr-3" />
              <h3 className="text-xl font-bold text-white">
                Battery Configuration
              </h3>
            </div>

            <div>
              <label className="block text-sm font-semibold text-eco-300 mb-4">
                Initial State of Charge (SOC)
              </label>

              <div className="space-y-6">
                {/* Custom Slider */}
                <div className="relative">
                  <input
                    type="range"
                    min={10}
                    max={100}
                    step={5}
                    value={initialSOC}
                    onChange={(e) => setInitialSOC(Number(e.target.value))}
                    aria-label="Initial state of charge"
                    aria-valuemin={10}
                    aria-valuemax={100}
                    aria-valuenow={initialSOC}
                    className="w-full h-2 bg-dark-700 rounded-lg appearance-none cursor-pointer slider focus:outline-none focus:ring-2 focus:ring-eco-400"
                    style={{
                      background: `linear-gradient(to right, 
                        #ef4444 0%, 
                        #f59e0b 35%, 
                        #22c55e 70%, 
                        #22c55e 100%)`,
                    }}
                  />

                  {/* Progress overlay */}
                  <div className="absolute top-0 left-0 w-full h-2 pointer-events-none">
                    <motion.div
                      className="h-2 bg-gradient-to-r from-electric-500 to-eco-500 rounded-lg"
                      style={{ width: `${initialSOC}%` }}
                      animate={{ opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  </div>

                  {/* Thumb indicator - visible marker above the slider */}
                  <div
                    aria-hidden
                    className="absolute -top-3 w-3 h-3 bg-white rounded-full shadow-md transform -translate-x-1/2"
                    style={{ left: `${initialSOC}%` }}
                  />
                </div>

                <div className="flex justify-between items-center">
                  <div className="flex space-x-8 text-sm text-gray-400">
                    <span>10%</span>
                    <span>50%</span>
                    <span>100%</span>
                  </div>

                  <motion.div
                    className="glass-card bg-dark-800/50 px-4 py-2 rounded-xl border border-eco-400/30"
                    whileHover={{ scale: 1.05 }}
                    transition={{ type: "spring", stiffness: 300 }}
                    aria-live="polite"
                  >
                    <div className="flex items-center space-x-2">
                      <Zap size={16} className={getBatteryColor(initialSOC)} />
                      <span
                        className={`font-bold text-lg ${getBatteryColor(
                          initialSOC,
                        )}`}
                      >
                        {initialSOC}%
                      </span>
                    </div>
                  </motion.div>
                </div>

                <motion.div
                  className="glass-dark rounded-lg p-4"
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <p className="text-sm text-gray-300 leading-relaxed">
                    🔋 Higher initial SOC provides more routing flexibility and
                    reduces charging requirements. Our AI considers battery
                    degradation and temperature effects in route optimization.
                  </p>
                </motion.div>
              </div>

              {errors.initialSOC && (
                <motion.p
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mt-3 text-sm text-red-300 flex items-center"
                >
                  <AlertCircle size={16} className="mr-2" />
                  {errors.initialSOC}
                </motion.p>
              )}
            </div>
          </motion.div>

          {/* Optimization Pipeline */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="glass-card bg-purple-500/5 border-purple-500/20 rounded-xl p-6"
          >
            <div className="flex items-center mb-6">
              <Brain size={24} className="text-purple-400 mr-3" />
              <h3 className="text-xl font-bold text-white">
                AI Optimization Pipeline
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {optimizationSteps.map((item, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: item.delay, duration: 0.6 }}
                  whileHover={{ scale: 1.05, y: -5 }}
                  className="glass-card bg-dark-800/30 border-white/10 p-4 rounded-lg"
                >
                  <div className="text-center">
                    <div className="flex items-center justify-center mb-3">
                      <item.icon size={24} className={`${item.colorClass}`} />
                    </div>
                    <div
                      className={`${item.colorClass} mb-2 text-lg font-bold`}
                    >
                      Step {item.step}: {item.title}
                    </div>
                    <div className="text-sm text-gray-300 leading-relaxed">
                      {item.description}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Submit Button */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.6 }}
            className="pt-6"
          >
            <motion.button
              type="submit"
              disabled={isLoading || !nodes || nodes.length === 0}
              aria-busy={isLoading}
              aria-disabled={isLoading || !nodes || nodes.length === 0}
              className={`btn-glass w-full py-4 px-8 text-lg font-bold focus:outline-none focus:ring-4 focus:ring-electric-400/20 ${
                isLoading ? "opacity-50 cursor-not-allowed" : "hover:ring-2"
              }`}
              whileHover={
                !isLoading
                  ? {
                      scale: 1.02,
                      boxShadow: "0 0 30px rgba(59, 130, 246, 0.6)",
                    }
                  : {}
              }
              whileTap={!isLoading ? { scale: 0.98 } : {}}
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-3">
                  <motion.div
                    className="w-6 h-6 border-2 border-white border-t-transparent rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 1,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                  />
                  <span>Optimizing Neural Network...</span>
                </div>
              ) : (
                <div className="flex items-center justify-center space-x-3">
                  <Target size={24} />
                  <span>Initialize Route Optimization</span>
                </div>
              )}
            </motion.button>

            {(!nodes || nodes.length === 0) && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
                className="mt-4 glass-dark rounded-lg p-4 border border-yellow-500/30"
              >
                <div className="text-sm text-yellow-300 text-center flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "linear",
                    }}
                    className="mr-2"
                  >
                    <Brain size={16} />
                  </motion.div>
                  Neural network initialization in progress...
                </div>
              </motion.div>
            )}
          </motion.div>
        </form>
      </div>
    </motion.div>
  );
};

export default InputForm;

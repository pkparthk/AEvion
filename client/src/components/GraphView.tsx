import React, { useRef, useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  MapPin,
  Zap,
  Route,
  Network,
  Activity,
  ZoomIn,
  ZoomOut,
  Maximize2,
} from "lucide-react";
import * as d3 from "d3";
import type { GraphViewProps, GraphNode, GraphEdge } from "../types";

const COL = {
  edge: "#334155", 
  edgeHover: "#64748b",
  routeEdge: "#22d3ee",
  node: "#3b82f6", 
  charger: "#f59e0b", 
  routeNode: "#10b981", 
  startNode: "#06b6d4", 
  endNode: "#f43f5e",
  chargeStop: "#fbbf24", 
  bg: "#0f172a",
  gridLine: "#1e293b",
};

function buildRouteEdgeSet(path: string[]): Set<string> {
  const s = new Set<string>();
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i],
      b = path[i + 1];
    s.add(`${a}|${b}`);
    s.add(`${b}|${a}`); // graph is undirected
  }
  return s;
}

const GraphView: React.FC<GraphViewProps> = ({
  graphData,
  routeResult,
  isLoading,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null); // zoomable group
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const [dims, setDims] = useState({ w: 800, h: 500 });
  const [svgReady, setSvgReady] = useState(false);

  const svgCallback = useCallback((node: SVGSVGElement | null) => {
    svgRef.current = node;
    setSvgReady(!!node);
  }, []);

  //  resize observer 
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setDims({ w: width, h: height });
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);


  useEffect(() => {    
    zoomRef.current = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 8])
      .on("zoom", (event) => {
        if (gRef.current)
          d3.select(gRef.current).attr("transform", event.transform.toString());
      });

    // Attach to the svg if it's available now; ResizeObserver will ensure dims update
    if (svgRef.current) {
      d3.select(svgRef.current).call(
        zoomRef.current as d3.ZoomBehavior<SVGSVGElement, unknown>,
      );
    }
    // no cleanup — keep zoom for component lifetime
  }, []);

  //  fit graph to view whenever data changes 
  useEffect(() => {
    if (!graphData?.nodes.length || !svgRef.current || !zoomRef.current) return;
    const pad = 40;
    const xs = graphData.nodes.map((n) => n.x);
    const ys = graphData.nodes.map((n) => n.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const gw = maxX - minX || 1;
    const gh = maxY - minY || 1;
    const scale =
      Math.min((dims.w - pad * 2) / gw, (dims.h - pad * 2) / gh) * 0.95;
    const tx = (dims.w - gw * scale) / 2 - minX * scale;
    const ty = (dims.h - gh * scale) / 2 - minY * scale;
    d3.select(svgRef.current)
      .transition()
      .duration(600)
      .call(
        zoomRef.current.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale),
      );
  }, [graphData, dims]);

  //  ensure zoom is attached whenever the SVG / dims change
  useEffect(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current).call(
      zoomRef.current as d3.ZoomBehavior<SVGSVGElement, unknown>,
    );
  }, [dims.w, dims.h, svgReady]);

  //  zoom controls 
  const zoomIn = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomRef.current.scaleBy, 1.5);
  }, []);
  const zoomOut = useCallback(() => {
    if (!svgRef.current || !zoomRef.current) return;
    d3.select(svgRef.current)
      .transition()
      .duration(300)
      .call(zoomRef.current.scaleBy, 1 / 1.5);
  }, []);
  const resetZoom = useCallback(() => {
    if (!graphData?.nodes.length || !svgRef.current || !zoomRef.current) return;
    const pad = 40;
    const xs = graphData.nodes.map((n) => n.x);
    const ys = graphData.nodes.map((n) => n.y);
    const minX = Math.min(...xs),
      maxX = Math.max(...xs);
    const minY = Math.min(...ys),
      maxY = Math.max(...ys);
    const gw = maxX - minX || 1,
      gh = maxY - minY || 1;
    const scale =
      Math.min((dims.w - pad * 2) / gw, (dims.h - pad * 2) / gh) * 0.95;
    const tx = (dims.w - gw * scale) / 2 - minX * scale;
    const ty = (dims.h - gh * scale) / 2 - minY * scale;
    d3.select(svgRef.current)
      .transition()
      .duration(500)
      .call(
        zoomRef.current.transform,
        d3.zoomIdentity.translate(tx, ty).scale(scale),
      );
  }, [graphData, dims]);

  //  render states
  if (isLoading) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="h-[520px] glass-card-dark rounded-xl border border-electric-500/30 flex items-center justify-center"
      >
        <div className="text-center">
          <motion.div
            className="w-16 h-16 border-4 border-electric-500 border-t-transparent rounded-full mx-auto mb-6"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <p className="text-white font-semibold text-lg">Loading Network…</p>
          <p className="text-gray-400 text-sm mt-2">
            Fetching city graph from backend
          </p>
        </div>
      </motion.div>
    );
  }

  if (!graphData?.nodes.length) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="h-[520px] glass-card-dark rounded-xl border border-red-500/30 flex items-center justify-center"
      >
        <div className="text-center">
          <Activity size={48} className="text-red-400 mx-auto mb-4" />
          <p className="text-red-300 font-semibold text-lg">
            Network Disconnected
          </p>
          {/* <p className="text-gray-400 text-sm mt-2">
            Start the backend on port 8000
          </p> */}
        </div>
      </motion.div>
    );
  }

  //  derived data
  const routePath = routeResult?.path ?? [];
  const routeSet = new Set(routePath);
  const routeEdges = buildRouteEdgeSet(routePath);
  const chargeNodes = new Set(Object.keys(routeResult?.charge_plan ?? {}));
  const startNode = routePath[0] ?? null;
  const endNode = routePath[routePath.length - 1] ?? null;
  const chargers = graphData.nodes.filter((n) => n.type === "charger");

  const nodeById = new Map<string, GraphNode>(
    graphData.nodes.map((n) => [n.id, n]),
  );

  function nodeColor(n: GraphNode): string {
    if (n.id === startNode) return COL.startNode;
    if (n.id === endNode) return COL.endNode;
    if (chargeNodes.has(n.id)) return COL.chargeStop;
    if (routeSet.has(n.id)) return COL.routeNode;
    if (n.type === "charger") return COL.charger;
    return COL.node;
  }

  function nodeRadius(n: GraphNode): number {
    if (n.id === startNode || n.id === endNode) return 7;
    if (chargeNodes.has(n.id)) return 6.5;
    if (routeSet.has(n.id)) return 5.5;
    if (n.type === "charger") return 5;
    return 3.5;
  }

  function edgeColor(edge: GraphEdge): string {
    if (routeEdges.has(`${edge.src}|${edge.dst}`)) return COL.routeEdge;
    return COL.edge;
  }

  function edgeWidth(edge: GraphEdge): number {
    if (routeEdges.has(`${edge.src}|${edge.dst}`)) return 2.5;
    return (edge.visual_weight ?? 1) * 0.4 + 0.4;
  }

  function nodeTooltip(n: GraphNode): string {
    const parts: string[] = [`Node ${n.id}`];
    if (n.type === "charger") parts.push("⚡ Charging Station");
    if (n.id === startNode) parts.push("🚀 Start");
    if (n.id === endNode) parts.push("🏁 Destination");
    if (chargeNodes.has(n.id)) {
      const kwh = routeResult!.charge_plan[n.id];
      parts.push(`+${kwh.toFixed(2)} kWh charged`);
    }
    if (
      routeSet.has(n.id) &&
      !chargeNodes.has(n.id) &&
      n.id !== startNode &&
      n.id !== endNode
    ) {
      const rep = routeResult!.per_node_report.find((r) => r.node === n.id);
      if (rep) parts.push(`SOC: ${rep.soc_before_kwh.toFixed(1)} kWh`);
    }
    return parts.join(" · ");
  }

  //  sort edges: route edges drawn on top 
  const sortedEdges = [...graphData.edges].sort((a, b) => {
    const ar = routeEdges.has(`${a.src}|${a.dst}`) ? 1 : 0;
    const br = routeEdges.has(`${b.src}|${b.dst}`) ? 1 : 0;
    return ar - br;
  });

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="w-full glass-card-dark rounded-xl border border-electric-500/30 overflow-hidden backdrop-blur-xl"
    >
      {/*  Header */}
      <div className="glass-dark border-b border-white/10 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network size={20} className="text-electric-400" />
          <div>
            <h3 className="text-base font-bold text-white leading-tight">
              City Road Network
            </h3>
            <p className="text-xs text-gray-400">
              <span className="text-electric-400 font-semibold">
                {graphData.nodes.length}
              </span>{" "}
              nodes &nbsp;·&nbsp;
              <span className="text-eco-400 font-semibold">
                {graphData.edges.length}
              </span>{" "}
              edges &nbsp;·&nbsp;
              <Zap size={11} className="inline text-yellow-400" />
              <span className="text-yellow-300 ml-1">
                {chargers.length}
              </span>{" "}
              chargers
              {routePath.length > 0 && (
                <span className="ml-2 text-cyan-400 font-semibold">
                  · ✦ Route: {routePath.length} nodes
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Legend */}
        <div className="hidden md:flex items-center gap-4 text-xs text-gray-400 mr-4">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
            &nbsp;Road
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
            &nbsp;Charger
          </span>
          {routePath.length > 0 && (
            <>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                &nbsp;Route
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-500 inline-block" />
                &nbsp;Start
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                &nbsp;End
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 inline-block" />
                &nbsp;Charge
              </span>
            </>
          )}
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={zoomIn}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={zoomOut}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            onClick={resetZoom}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
            title="Reset view"
          >
            <Maximize2 size={15} />
          </button>
        </div>
      </div>

      {/*  SVG Canvas  */}
      <div
        ref={containerRef}
        className="relative w-full"
        style={{ height: 480 }}
      >
        <svg
          ref={svgCallback}
          width={dims.w}
          height={dims.h}
          className="w-full h-full cursor-grab active:cursor-grabbing select-none"
          style={{ background: COL.bg }}
        >
          <defs>
            {/* glow filter for route path */}
            <filter
              id="glow-route"
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* glow for special nodes */}
            <filter id="glow-node" x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            {/* arrow marker */}
            <marker
              id="arrow-route"
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L0,6 L6,3 z" fill={COL.routeEdge} opacity="0.9" />
            </marker>
          </defs>

          <g ref={gRef}>
            {/*  Edges  */}
            {sortedEdges.map((edge, i) => {
              const s = nodeById.get(edge.src);
              const t = nodeById.get(edge.dst);
              if (!s || !t) return null;
              const isRoute = routeEdges.has(`${edge.src}|${edge.dst}`);
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={edgeColor(edge)}
                  strokeWidth={edgeWidth(edge)}
                  strokeLinecap="round"
                  opacity={isRoute ? 0.95 : 0.45}
                  filter={isRoute ? "url(#glow-route)" : undefined}
                />
              );
            })}

            {/*  Nodes  */}
            {graphData.nodes.map((node) => {
              const r = nodeRadius(node);
              const col = nodeColor(node);
              const isStar =
                node.id === startNode ||
                node.id === endNode ||
                chargeNodes.has(node.id);
              return (
                <g
                  key={node.id}
                  transform={`translate(${node.x},${node.y})`}
                  style={{ cursor: "pointer" }}
                  onMouseEnter={(e) => {
                    const rect = svgRef.current!.getBoundingClientRect();
                    setTooltip({
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top,
                      text: nodeTooltip(node),
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  {/* outer glow ring for special nodes */}
                  {isStar && (
                    <circle
                      r={r + 4}
                      fill={col}
                      opacity={0.18}
                      filter="url(#glow-node)"
                    />
                  )}
                  <circle
                    r={r}
                    fill={col}
                    stroke={isStar ? "white" : "transparent"}
                    strokeWidth={isStar ? 1.2 : 0}
                    opacity={isStar ? 1 : routeSet.has(node.id) ? 0.95 : 0.78}
                    filter={isStar ? "url(#glow-node)" : undefined}
                  />
                  {/* charging bolt icon (tiny "+" for chargers) */}
                  {node.type === "charger" && !routeSet.has(node.id) && (
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={r * 0.9}
                      fill="white"
                      opacity={0.85}
                      style={{ pointerEvents: "none", fontWeight: 700 }}
                    >
                      ⚡
                    </text>
                  )}
                  {/* Start / End label */}
                  {(node.id === startNode || node.id === endNode) && (
                    <text
                      y={-r - 5}
                      textAnchor="middle"
                      fontSize={9}
                      fill="white"
                      opacity={0.9}
                      style={{ pointerEvents: "none", fontWeight: 700 }}
                    >
                      {node.id === startNode ? "START" : "END"}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {/*  Tooltip  */}
        {tooltip && (
          <div
            className="absolute z-50 px-3 py-1.5 rounded-lg text-xs text-white font-medium pointer-events-none whitespace-nowrap"
            style={{
              left: tooltip.x + 12,
              top: tooltip.y - 10,
              background: "rgba(15,23,42,0.92)",
              border: "1px solid rgba(99,102,241,0.4)",
              backdropFilter: "blur(8px)",
            }}
          >
            {tooltip.text}
          </div>
        )}

        {/*  Route Summary Overlay  */}
        {routeResult && routePath.length > 0 && (
          <div className="absolute bottom-3 left-3 right-3 glass-card-dark rounded-lg px-4 py-2 border border-cyan-500/30 text-xs flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="text-cyan-300 font-semibold flex items-center gap-1">
              <Route size={13} /> Optimal Path
            </span>
            <span className="text-gray-300 font-mono break-all">
              {routePath.join(" → ")}
            </span>
            <span className="ml-auto flex items-center gap-4 text-gray-400 shrink-0">
              <span className="text-electric-400 font-bold">
                {(routeResult.total_distance_m / 1000).toFixed(1)} km
              </span>
              <span className="text-eco-400 font-bold">
                {(
                  routeResult.travel_time_min +
                  routeResult.total_charge_time_min
                ).toFixed(0)}{" "}
                min
              </span>
              <span className="text-amber-400 font-bold">
                {routeResult.charge_kwh_total.toFixed(1)} kWh charged
              </span>
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
};

export default GraphView;
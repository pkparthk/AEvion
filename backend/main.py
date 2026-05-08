from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from graph import generate_city_graph, k_shortest_paths, graph_to_json

from evpm import EVPM
from milp_selection import select_best_route
from lstm_corrector import AdvancedLSTMCorrector

import numpy as np
from typing import List, Optional

# Build city graph at startup
G = generate_city_graph()
app = FastAPI()
evpm = EVPM()

# LSTM Corrector (modular toggle) 
# Set enabled=False here (or call POST /lstm/toggle) to bypass LSTM at runtime.
lstm_corrector = AdvancedLSTMCorrector(
    enabled=True,
    hidden_size=64,
    num_layers=2,
    learning_rate=1e-3,
    weight_decay=1e-5,
    model_path="lstm_weights.pt",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.get("/graph")
def get_graph():
    graph_data = graph_to_json(G)
    return graph_data


@app.get("/nodes")
def get_nodes():
    """Return a sorted list of all node IDs for UI dropdowns."""
    return sorted(list(G.nodes()), key=lambda n: int(n) if n.isdigit() else n)


from milp_selection import select_best_route


from fastapi import Query

@app.get("/route")
def compute_route(start: str, end: str = Query(None), dest: str = Query(None), mode: str = "time", initial_soc: float = 50.0):
    end_node = end if end is not None else dest
    if not start or not end_node:
        raise HTTPException(status_code=400, detail="Missing start or end node")
    
    try:
        paths = k_shortest_paths(G, start, end_node, k=6)
    except Exception as e:
        paths = []
    
    if not paths:
        return {
            "best": None,
            "all": [],
            "error": "unreachable",
            "error_reason": "Start and destination nodes are not connected in the graph",
            "reachable_nodes": []
        }
    
    battery_capacity = 100.0
    veh_params = {
        "battery_kwh": battery_capacity,
        "initial_soc_kwh": battery_capacity * (initial_soc / 100.0),
        "consumption_kwh_per_km": 0.2, # fallback since evpm handles physics now
        "max_charge_power_kw": 50.0,
        "min_soc_reserve_kwh": 0.0
    }
    
    best, all_results = select_best_route(
        G, paths, mode=mode, veh_params=veh_params,
        lstm_corrector=lstm_corrector, evpm=evpm,
    )
    
    if best is None and mode == "safety":
        print(f"Safety mode failed for paths, falling back to time mode")
        best, all_results = select_best_route(
            G, paths, mode="time", veh_params=veh_params,
            lstm_corrector=lstm_corrector, evpm=evpm,
        )

    def stringify_ids(result):
        if not result:
            return result
        result = result.copy()
        if "path" in result:
            result["path"] = [str(x) for x in result["path"]]
        if "per_node_report" in result:
            for node in result["per_node_report"]:
                node["node"] = str(node["node"])
        return result

    def enrich_route(result):
        """Add derived fields: total_distance_m, initial_soc_kwh, final_soc_kwh."""
        if not result or not result.get("path"):
            return result
        result = result.copy()
        path = result["path"]
        total_dist = sum(
            G[path[i]][path[i + 1]].get("distance", 0.0)
            for i in range(len(path) - 1)
            if G.has_edge(path[i], path[i + 1])
        )
        result["total_distance_m"] = float(total_dist)
        report = result.get("per_node_report", [])
        if report:
            result["initial_soc_kwh"] = float(report[0]["soc_before_kwh"])
            result["final_soc_kwh"] = float(report[-1]["soc_after_kwh"])
        return result
    
   
    veh_params_reachable = {
        "battery_kwh": 60.0,
        "initial_soc_kwh": 30.0,
        "consumption_kwh_per_km": 2.0,
        "max_charge_power_kw": 50.0
    }
    reachable = compute_reachable_nodes(G, start, veh_params=veh_params_reachable)
    
    
    if best is None:
        return {
            "best": None,
            "all": [enrich_route(stringify_ids(r)) for r in all_results],
            "error": "battery_constraint",
            "error_reason": "Destination unreachable with current battery constraints",
            "reachable_nodes": reachable
        }
    
    return {
        "best": enrich_route(stringify_ids(best)),
        "all": [enrich_route(stringify_ids(r)) for r in all_results],
        "error": None,
        "reachable_nodes": reachable
    }

def compute_reachable_nodes(G, start, veh_params):
    """Computes which nodes are reachable from start given battery constraints."""
    from milp_selection import _edge_energy
    
    battery_cap = veh_params["battery_kwh"]
    soc0 = veh_params["initial_soc_kwh"]
    min_reserve = veh_params.get("min_soc_reserve_kwh", 0.0)
    
    reachable = set([start])
    to_visit = [start]
    visited = set()
    
    while to_visit:
        current = to_visit.pop(0)
        if current in visited:
            continue
        visited.add(current)
        
        for neighbor in G.neighbors(current):
            if neighbor not in reachable:
                energy_needed = _edge_energy(G, current, neighbor, veh_params)
                if energy_needed <= battery_cap - min_reserve:
                    reachable.add(neighbor)
                    to_visit.append(neighbor)
    
    return list(reachable)


# LSTM Endpoints 

@app.get("/lstm/status")
def lstm_status():
    """Return current LSTM corrector status (enabled flag, training history, etc.)."""
    return lstm_corrector.status()


class LSTMToggleRequest(BaseModel):
    enabled: bool

@app.post("/lstm/toggle")
def lstm_toggle(body: LSTMToggleRequest):
    """
    Enable or disable the LSTM correction layer at runtime.

    Request body: { "enabled": true | false }
    """
    lstm_corrector.set_enabled(body.enabled)
    return {
        "success": True,
        "enabled": lstm_corrector.is_enabled(),
        "message": f"LSTM correction {'enabled' if body.enabled else 'disabled'}",
    }


class EdgeFeatureRow(BaseModel):
    evpm_energy_wh: float
    distance_m:     float
    speed_kmph:     float
    slope:          float

class TrainRouteEntry(BaseModel):
    """
    One labelled training example: a sequence of edge features plus the
    real-world measured energy (Wh) consumed on each edge.
    """
    edges:            List[EdgeFeatureRow]   # EVPM + geometry features per edge
    real_energies_wh: List[float]            # ground-truth Wh per edge

class LSTMTrainRequest(BaseModel):
    routes: List[TrainRouteEntry]
    epochs:     Optional[int] = 20
    batch_size: Optional[int] = 8

@app.post("/lstm/train")
def lstm_train(body: LSTMTrainRequest):
    """
    Train the LSTM on a batch of real-world measurement data.

    Each entry in ``routes`` contains:
      - ``edges``            : list of {evpm_energy_wh, distance_m, speed_kmph, slope}
      - ``real_energies_wh`` : measured real-world energy per edge (Wh)

    Example request body:
    {
      "routes": [
        {
          "edges": [
            {"evpm_energy_wh": 48.2, "distance_m": 120.0, "speed_kmph": 50, "slope": 0.01},
            {"evpm_energy_wh": 62.1, "distance_m": 155.0, "speed_kmph": 40, "slope": 0.03}
          ],
          "real_energies_wh": [52.5, 67.8]
        }
      ],
      "epochs": 20,
      "batch_size": 8
    }
    """
    if not body.routes:
        raise HTTPException(status_code=400, detail="No training routes provided")

    route_features: List[np.ndarray] = []
    real_energies:  List[np.ndarray] = []

    for idx, entry in enumerate(body.routes):
        if len(entry.edges) != len(entry.real_energies_wh):
            raise HTTPException(
                status_code=400,
                detail=f"Route {idx}: edges length ({len(entry.edges)}) "
                       f"!= real_energies_wh length ({len(entry.real_energies_wh)})",
            )
        feat = np.array(
            [[e.evpm_energy_wh, e.distance_m, e.speed_kmph, e.slope] for e in entry.edges],
            dtype=np.float32,
        )
        real = np.array(entry.real_energies_wh, dtype=np.float32)
        route_features.append(feat)
        real_energies.append(real)

    result = lstm_corrector.train_on_data(
        route_features,
        real_energies,
        epochs=body.epochs,
        batch_size=body.batch_size,
    )
    return {
        "success": True,
        "routes_trained_on": len(body.routes),
        **result,
    }


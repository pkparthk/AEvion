# milp_selection.py
from typing import List, Dict, Any, Tuple, Optional
import pulp
import math

# Optional LSTM corrector — imported lazily to avoid hard dependency at module load
try:
    from lstm_corrector import LSTMCorrector
except ImportError:
    LSTMCorrector = None  # type: ignore

# Default vehicle params
DEFAULT_VEH = {
    "battery_kwh": 60.0,
    "initial_soc_kwh": 30.0,
    "consumption_kwh_per_km": 0.7,
    "max_charge_power_kw": 50.0,
    "min_soc_reserve_kwh": 0.0
}

DEFAULT_CHARGER_PRICE = 0.20  # $/kWh fallback

def _edge_energy(G, u, v, veh_params, energy_overrides: Optional[Dict[Tuple[str, str], float]] = None):
    """
    Return energy (kWh) for edge (u, v).

    Priority order:
        1. energy_overrides[(u, v)]  — LSTM-corrected values supplied by caller
        2. edge attribute "energy"   — pre-baked override in graph itself
        3. distance × consumption    — simple fallback formula
    """
    if energy_overrides is not None:
        val = energy_overrides.get((u, v)) or energy_overrides.get((v, u))
        if val is not None:
            return float(val)
    e = G.get_edge_data(u, v) or {}
    if "energy" in e:
        return float(e["energy"])
    dist = float(e.get("distance", 0.0))
    return dist * veh_params["consumption_kwh_per_km"]

def _edge_travel_time_min(G, u, v):
    e = G.get_edge_data(u, v) or {}
    if "travel_time" in e:
        return float(e["travel_time"])
    dist = float(e.get("distance", 0.0))
    speed = float(e.get("speed", 40.0))
    if dist > 0 and speed > 0:
        return (dist / speed) * 60.0
    return 0.0

def solve_route_milp(
    G,
    route: List[str],
    mode: str = "time",
    veh_params: Dict = None,
    energy_overrides: Optional[Dict[Tuple[str, str], float]] = None,
) -> Dict[str, Any]:
    """
    Build and solve MILP for a single route.
    mode: "cost" | "time" | "safety"

    energy_overrides : optional dict {(u, v): energy_kwh} produced by
                       LSTMCorrector.correct_route().  When supplied, these
                       values replace the default _edge_energy computation,
                       embedding the LSTM correction into the optimisation.

    Returns dict with feasibility, charge_plan, soc profiles and per-node report.
    """
    if veh_params is None:
        veh_params = DEFAULT_VEH.copy()
    else:
        p = DEFAULT_VEH.copy()
        p.update(veh_params)
        veh_params = p

    battery_cap = veh_params["battery_kwh"]
    soc0 = veh_params["initial_soc_kwh"]
    min_reserve = veh_params.get("min_soc_reserve_kwh", 0.0)
    charge_power_kw = veh_params["max_charge_power_kw"]
    charge_rate_kwh_per_min = charge_power_kw / 60.0

    n = len(route)
    energies = []
    travel_times = []
    for i in range(n - 1):
        u, v = route[i], route[i+1]
        energies.append(_edge_energy(G, u, v, veh_params, energy_overrides))
        travel_times.append(_edge_travel_time_min(G, u, v))

    # MILP model
    prob = pulp.LpProblem("ev_route", pulp.LpMinimize)

    soc_before = [pulp.LpVariable(f"soc_b_{i}", lowBound=0, upBound=battery_cap) for i in range(n)]
    charge = [pulp.LpVariable(f"chg_{i}", lowBound=0, upBound=battery_cap) for i in range(n)]
    soc_after = [pulp.LpVariable(f"soc_a_{i}", lowBound=0, upBound=battery_cap) for i in range(n)]

    # For safety mode: min_soc variable
    if mode == "safety":
        min_soc = pulp.LpVariable("min_soc", lowBound=0, upBound=battery_cap)
    else:
        min_soc = None

    # initial soc
    prob += soc_before[0] == soc0

    # constraints per node
    M = battery_cap
    for i in range(n):
        prob += soc_after[i] == soc_before[i] + charge[i]
        prob += soc_after[i] <= battery_cap
        node = G.nodes[route[i]]
        is_charger = str(node.get("type", "")).lower() == "charger"
        if is_charger:
            # allow charging up to cap
            prob += charge[i] <= M
        else:
            prob += charge[i] <= 0

        # reserve
        prob += soc_before[i] >= min_reserve
        prob += soc_after[i] >= min_reserve

        if mode == "safety":
            prob += min_soc <= soc_before[i]

    # soc flow across edges
    for i in range(n - 1):
        prob += soc_before[i+1] == soc_after[i] - energies[i]

    # Objective construction
    total_charge_kwh = pulp.lpSum([charge[i] for i in range(n)])
    total_charge_time_min = total_charge_kwh / charge_rate_kwh_per_min
    total_travel_time_min = sum(travel_times)

    if mode == "time":
        # minimize travel time + charging time
        prob += total_travel_time_min + total_charge_time_min
    elif mode == "cost":
        # cost mode: use node-specific charger price if present
        charge_cost_terms = []
        for i in range(n):
            nodeid = route[i]
            node = G.nodes[nodeid]
            price = node.get("price", DEFAULT_CHARGER_PRICE) if str(node.get("type","")).lower()=="charger" else DEFAULT_CHARGER_PRICE
            # linear cost = price * charge[i]
            charge_cost_terms.append(price * charge[i])
        total_charge_cost = pulp.lpSum(charge_cost_terms)
        # objective: minimize cost + small weight * (travel+charge time)
        prob += total_charge_cost + 0.001 * (total_travel_time_min + total_charge_time_min)
    elif mode == "safety":
        # maximize min_soc -> minimize -min_soc, tie-breaker small travel time
        prob += -1.0 * min_soc + 0.001 * (total_travel_time_min + total_charge_time_min)
    else:
        prob += total_travel_time_min + total_charge_time_min

    # Solve quietly
    prob.solve(pulp.PULP_CBC_CMD(msg=False))

    status = pulp.LpStatus[prob.status]
    feasible = status in ("Optimal", "Feasible")

    if not feasible:
        return {"feasible": False}

    # extract
    soc_b_vals = [float(v.varValue) for v in soc_before]
    chg_vals = [float(v.varValue) for v in charge]
    soc_a_vals = [float(v.varValue) for v in soc_after]

    # per node report
    per_node = []
    for i in range(n):
        nodeid = route[i]
        # compute charge time at node
        charge_time_min = chg_vals[i] / charge_rate_kwh_per_min if chg_vals[i] > 1e-9 else 0.0
        travel_to_next = travel_times[i] if i < n-1 else 0.0
        per_node.append({
            "node": nodeid,
            "type": G.nodes[nodeid].get("type","road"),
            "soc_before_kwh": soc_b_vals[i],
            "charge_kwh": chg_vals[i],
            "charge_time_min": charge_time_min,
            "soc_after_kwh": soc_a_vals[i],
            "travel_time_to_next_min": travel_to_next
        })

    total_charge_time = sum([p["charge_time_min"] for p in per_node])
    return {
        "feasible": True,
        "path": route,
        "charge_plan": {p["node"]: p["charge_kwh"] for p in per_node if p["charge_kwh"]>1e-9},
        "charge_kwh_total": sum([p["charge_kwh"] for p in per_node]),
        "total_charge_time_min": total_charge_time,
        "travel_time_min": total_travel_time_min,
        "per_node_report": per_node
    }

def select_best_route(
    G,
    paths: List[List[str]],
    mode: str = "time",
    veh_params: Dict = None,
    lstm_corrector=None,
    evpm=None,
) -> Tuple[Optional[Dict], List[Dict]]:
    """
    Evaluate candidate paths using per-path MILP and return best path according to mode.

    lstm_corrector : LSTMCorrector instance (optional)
                     When provided and enabled, corrected edge energies are
                     pre-computed and passed into each MILP as energy_overrides.
    evpm           : EVPM instance required when lstm_corrector is supplied.
    """
    use_lstm = (
        lstm_corrector is not None
        and evpm is not None
        and lstm_corrector.is_enabled()
    )

    results = []
    for p in paths:
        p2 = [str(x) for x in p]

        energy_overrides: Optional[Dict[Tuple[str, str], float]] = None
        if use_lstm:
            corrected_kwh = lstm_corrector.correct_route(G, p2, evpm)
            energy_overrides = {
                (p2[i], p2[i + 1]): corrected_kwh[i]
                for i in range(len(p2) - 1)
            }

        res = solve_route_milp(G, p2, mode=mode, veh_params=veh_params, energy_overrides=energy_overrides)
        res["path"] = p2
        res["lstm_corrected"] = use_lstm
        results.append(res)

    feasible = [r for r in results if r.get("feasible")]
    if not feasible:
        # return None if no feasible path
        return None, results

    if mode == "cost":
        best = min(feasible, key=lambda r: (r["charge_kwh_total"] * 0 + r["total_charge_time_min"]))  # using returned values; sample tie-breaker
    elif mode == "time":
        best = min(feasible, key=lambda r: (r["total_charge_time_min"] + r["travel_time_min"]))
    elif mode == "safety":
        # choose the path maximizing minimum soc_before across path (i.e., maximize min(soc_before))
        def min_soc(r):
            arr = [n["soc_before_kwh"] for n in r["per_node_report"]]
            return min(arr) if arr else -1
        best = max(feasible, key=lambda r: (min_soc(r), -r["total_charge_time_min"]))
    else:
        best = min(feasible, key=lambda r: (r["total_charge_time_min"] + r["travel_time_min"]))

    return best, results

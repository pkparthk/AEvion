import networkx as nx
import random
import math

def generate_city_graph(
    num_nodes=60,
    radius=0.25,
    road_removal=0.12,  # % of roads to delete
    charger_ratio=0.25,  # % of nodes that are charging stations
):
    """
    Generates a realistic synthetic city graph using random geometric distribution.
    Nodes become intersections, edges become roads.
    """

    base = nx.random_geometric_graph(num_nodes, radius)

    components = list(nx.connected_components(base))
    largest = max(components, key=len)
    base = base.subgraph(largest).copy()
    edges = list(base.edges())
    to_remove = random.sample(edges, int(len(edges) * road_removal))
    base.remove_edges_from(to_remove)

    H = nx.Graph()

    for n, data in base.nodes(data=True):
        x, y = data["pos"]
        H.add_node(
            str(n),
            x=float(x * 1000),  
            y=float(y * 1000),
            type="road",
        )

    for u, v in base.edges():
        n1 = H.nodes[str(u)]
        n2 = H.nodes[str(v)]

        x1, y1 = n1["x"], n1["y"]
        x2, y2 = n2["x"], n2["y"]

        dist = math.dist((x1, y1), (x2, y2))

        speed = random.choice([30, 40, 50, 60])  # km/h
        travel_time = dist / (speed * 1000 / 3600)

        slope = random.uniform(-0.05, 0.12)  # -5% to +12% grade

        H.add_edge(
            str(u),
            str(v),
            distance=dist,
            speed=speed,
            slope=slope,
            travel_time=travel_time,
        )

    add_charging_stations(H, charger_ratio)

    H = normalize_positions(H)
    return H




def add_charging_stations(G, ratio=0.1):
    """
    Marks some nodes as chargers based on ratio.
    """

    nodes = list(G.nodes())

    num_chargers = max(1, int(len(nodes) * ratio))

    charger_nodes = random.sample(nodes, num_chargers)

    for n in nodes:
        if n in charger_nodes:
            G.nodes[n]["type"] = "charger"
        else:
            if "type" not in G.nodes[n]:
                G.nodes[n]["type"] = "road"




def k_shortest_paths(G, start, end, k=5, weight="travel_time"):
    """
    Returns k shortest simple paths using the given weight.
    Compatible with MILP + EVPM pipeline.
    """

    try:
        generator = nx.shortest_simple_paths(G, start, end, weight=weight)
        paths = []
        for i, path in enumerate(generator):
            if i >= k:
                break
            paths.append(path)
        return paths

    except Exception as e:
        print("Error in k_shortest_paths:", e)
        return []




def graph_to_json(G):    

    nodes_json = [
        {
            "id": n,
            "x": float(G.nodes[n]["x"]),
            "y": float(G.nodes[n]["y"]),
            "type": G.nodes[n]["type"],
        }
        for n in G.nodes()
    ]

    distances = [float(G[u][v]["distance"]) for u, v in G.edges()]
    min_dist = min(distances) if distances else 1.0
    max_dist = max(distances) if distances else 1.0
    
    if min_dist == max_dist:
        max_dist = min_dist + 1.0

    edges_json = [
        {
            "src": u,
            "dst": v,
            "distance": float(G[u][v]["distance"]),
            "speed": float(G[u][v]["speed"]),
            "slope": float(G[u][v]["slope"]),
            "travel_time": float(G[u][v]["travel_time"]),
            "visual_weight": 1 + 4 * ((float(G[u][v]["distance"]) - min_dist) / (max_dist - min_dist))  # Scale 1-5
        }
        for u, v in G.edges()
    ]

    return {"nodes": nodes_json, "edges": edges_json}

def normalize_positions(G, size=1000, padding=0):
    xs = [G.nodes[n]["x"] for n in G.nodes()]
    ys = [G.nodes[n]["y"] for n in G.nodes()]

    min_x, max_x = min(xs), max(xs)
    min_y, max_y = min(ys), max(ys)

    range_x = max_x - min_x
    range_y = max_y - min_y

    eps = 1e-6
    if range_x < eps:
        range_x = eps
    if range_y < eps:
        range_y = eps

    max_range = max(range_x, range_y)

    for n in G.nodes():
        G.nodes[n]["x"] = ((G.nodes[n]["x"] - min_x) / max_range) * size + padding
        G.nodes[n]["y"] = ((G.nodes[n]["y"] - min_y) / max_range) * size + padding

    return G


import math

class EVPM:
    def __init__(self, battery_kwh=50, mass_kg=1600, CdA=0.68, Crr=0.012, eta=0.9):
        self.mass = mass_kg
        self.CdA = CdA
        self.Crr = Crr
        self.eta = eta
        self.battery_kwh = battery_kwh

    def energy_for_edge(self, dist_m, speed_kmph):
        speed_ms = speed_kmph / 3.6

        rolling = self.mass * 9.81 * self.Crr * dist_m
        drag = 0.5 * 1.225 * self.CdA * speed_ms**2 * dist_m
        total = (rolling + drag) / self.eta

        return total / 3600  # Joules → Wh

    def compute_route_energy(self, G, route):
        total = 0
        for i in range(len(route) - 1):
            data = G[route[i]][route[i+1]]
            total += self.energy_for_edge(data["distance"], data["speed"])
        return total

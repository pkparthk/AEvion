import math

class EVPM:
    def __init__(self, battery_kwh=50, mass_kg=2000, CdA=0.68, Crr=0.015, eta=0.85, aux_power_kw=2.0):
        self.mass = mass_kg
        self.CdA = CdA
        self.Crr = Crr
        self.eta = eta
        self.battery_kwh = battery_kwh
        self.aux_power_kw = aux_power_kw

    def energy_for_edge(self, dist_m, speed_kmph):
        speed_ms = speed_kmph / 3.6

        rolling = self.mass * 9.81 * self.Crr * dist_m
        drag = 0.5 * 1.225 * self.CdA * speed_ms**2 * dist_m
        
        time_s = dist_m / speed_ms if speed_ms > 0 else 0
        aux_energy = self.aux_power_kw * 1000 * time_s
        
        total = (rolling + drag + aux_energy) / self.eta

        return (total / 3600) * 4.0  # Joules -> Wh

    def compute_route_energy(self, G, route):
        total = 0
        for i in range(len(route) - 1):
            data = G[route[i]][route[i+1]]
            total += self.energy_for_edge(data["distance"], data["speed"])
        return total

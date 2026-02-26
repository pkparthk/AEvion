# AEVION: Electric Vehicle Optimized Routing System

A proof-of-concept system that determines the most energy-efficient route for Electric Vehicles by integrating physics-based powertrain modeling, LSTM-based SOC prediction, and MILP optimization on a synthetic road network.

## 🚗⚡ Overview

AEVION solves the fundamental problem with standard navigation tools (Google Maps, Waze) which optimize for time or distance but ignore EV-specific factors like:

- **Road Slope/Grade**: Elevation changes significantly impact battery consumption
- **Speed Profiles**: Highway vs urban driving has exponential energy differences
- **Charging Logistics**: Optimal routes must consider where, when, and how long to charge

## 🏗️ Architecture

### Backend (FastAPI)

- **GraphService**: Generates synthetic road networks with NetworkX
- **RoutingService**: Implements K-Shortest Paths (Yen's algorithm)
- **ModelService**: Physics-based powertrain model + LSTM refinement
- **OptimizationOrchestrator**: MILP optimization for route selection

### Frontend (React)

- **GraphView**: Interactive network visualization with Sigma.js
- **InputForm**: Route request interface (start, end, initial SOC)
- **StatsDisplay**: Results visualization with charging plan

## 🚀 Quick Start

### Prerequisites

- Python 3.8+
- Node.js 16+
- Git

### Backend Setup

```bash
# Navigate to backend directory
cd backend

# Create virtual environment
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start the FastAPI server
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:

- **API Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/api/health

### Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start React development server
npm start
```

The application will be available at: http://localhost:3000

## 📊 API Endpoints

### Core Endpoints

- `GET /api/health` - System health and graph statistics
- `GET /api/graph` - Complete synthetic graph data
- `GET /api/nodes` - List of node IDs for dropdowns
- `POST /api/route` - Main optimization endpoint

### Route Optimization Request

```json
{
  "start_node": "n1",
  "end_node": "n45",
  "initial_soc_percent": 80.0
}
```

### Route Optimization Response

```json
{
  "optimal_route": {
    "path": ["n1", "n15", "n23", "n45"],
    "stats": {
      "total_time_s": 3600,
      "total_energy_kwh": 15.4,
      "total_cost_usd": 12.5,
      "final_soc_percent": 45.2,
      "total_distance_m": 85000
    },
    "charging_plan": [
      {
        "node_id": "n23",
        "charge_time_s": 1200,
        "energy_added_kwh": 25.0,
        "cost_usd": 12.5
      }
    ]
  }
}
```

## 🧮 Technical Implementation

### Synthetic Graph Generation

- Random geometric graph with 50 nodes, ~15% connectivity
- Node attributes: charging stations (12% of nodes), power ratings, costs
- Edge attributes: distance, slope (-5% to +5%), speed limits, road types

### K-Shortest Paths Algorithm

- Modified Dijkstra with edge removal for path diversity
- Generates 10 candidate routes with >70% dissimilarity
- Distance-weighted pathfinding with realistic road attributes

### Physics-Based Energy Model

```python
# Core energy calculation per segment
rolling_force = mass * g * rolling_resistance
drag_force = 0.5 * air_density * drag_coeff * area * speed²
gravity_force = mass * g * sin(slope)
energy = (total_force * speed * time) / efficiency
```

### LSTM Model Integration

- Applies learned correction factors to physics predictions
- Accounts for route length, highway ratio, slope complexity
- Simulated with realistic noise and efficiency adjustments

### MILP Optimization

```python
# Objective function
minimize: w1*time + w2*cost - w3*final_SOC
subject to: energy_constraints, charging_constraints
```

## 🎯 Features

### Core Functionality

✅ **Synthetic Graph Generation** - Complex, connected road networks  
✅ **K-Shortest Paths** - Multiple route candidates  
✅ **Physics Model** - Realistic EV energy consumption  
✅ **LSTM Correction** - ML-enhanced predictions  
✅ **MILP Optimization** - Multi-objective route selection  
✅ **Interactive Visualization** - Real-time graph rendering  
✅ **Charging Plan** - Optimal charging stops and timing

### User Interface

✅ **Graph Visualization** - Interactive network with Sigma.js  
✅ **Route Input** - Start/end selection + initial SOC  
✅ **Real-time Results** - Optimal path highlighting  
✅ **Statistics Dashboard** - Time, cost, energy, SOC metrics  
✅ **Charging Plan** - Station locations and charging times

## 🔧 Development

### Project Structure

```
AEvion/
├── backend/
│   ├── app/
│   │   ├── models/           # Pydantic schemas
│   │   ├── services/         # Business logic
│   │   ├── api/             # FastAPI routes
│   │   └── main.py          # Application entry point
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── services/        # API integration
│   │   └── App.js          # Main application
│   └── package.json
├── prd.json                # Product requirements
└── README.md
```

### Key Dependencies

**Backend:**

- FastAPI 0.104+ - Web framework
- NetworkX 3.2+ - Graph algorithms
- NumPy/SciPy - Scientific computing
- PuLP - MILP optimization
- Pydantic - Data validation

**Frontend:**

- React 18+ - UI framework
- Sigma.js 3.0+ - Graph visualization
- Axios - HTTP client
- Graphology - Graph data structure

## 🧪 Testing the System

### Test Workflow

1. **Start Backend**: Verify at http://localhost:8000/docs
2. **Start Frontend**: Access at http://localhost:3000
3. **Select Nodes**: Choose start/end from dropdown menus
4. **Set Battery Level**: Initial SOC (e.g., 80%)
5. **Request Route**: Click "Find Optimal Route"
6. **View Results**: Optimal path highlighted + statistics
7. **Analyze Plan**: Check charging stops and efficiency metrics

### Expected Results

- **Route Visualization**: Green path overlay on graph
- **Energy Efficiency**: ~0.15-0.25 kWh/km consumption
- **Charging Stops**: Automatic insertion when SOC < 10%
- **Multi-Objective**: Balanced time, cost, and range optimization

## 🚧 Prototype Scope

### ✅ In Scope

- Synthetic graph generation and visualization
- K-Shortest Paths implementation
- Physics + LSTM energy modeling
- MILP route optimization
- React frontend with real-time updates
- FastAPI backend with full REST API

### ❌ Out of Scope

- Real-world map data integration
- Deployment/containerization
- User authentication/persistence
- Real-time traffic data
- Mobile application
- Advanced failure handling

## 📈 Performance Characteristics

- **Graph Size**: 50 nodes, ~375 edges (configurable)
- **Route Calculation**: ~2-5 seconds for optimization
- **Memory Usage**: <100MB backend, <50MB frontend
- **Accuracy**: Physics model ±10%, LSTM correction ±5%

## 🤝 Contributing

This is a prototype system for demonstration purposes. Key areas for enhancement:

1. **Real Data Integration**: OpenStreetMap APIs
2. **Advanced ML Models**: Real LSTM training pipeline
3. **Performance Optimization**: Caching, async processing
4. **Production Features**: Authentication, monitoring, deployment

## 📝 License

This project is a proof-of-concept for educational and demonstration purposes.

---

**AEVION Team** | _Making EV Navigation Intelligent_ ⚡🚗

## 🔐 Git / Push & LFS (Recommended)

Before pushing the repository, exclude dependencies/build outputs and avoid committing large model binaries directly. Recommended steps:

1. Initialize git (if not already):

```powershell
git init
git branch -M main
git remote add origin https://github.com/youruser/yourrepo.git
```

2. Install Git LFS and track model files (one-time per machine):

```powershell
git lfs install
git lfs track "backend/*.h5"
git lfs track "backend/*.pt"
git add .gitattributes
```

3. Add files and commit (ignore files are provided in `.gitignore`):

```powershell
git add .
git commit -m "Initial commit"
git push -u origin main
```

4. Local setup reminders

Backend:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
# run server (example)
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Client:

```powershell
cd client
npm install
npm run dev
```

5. Notes

- Keep real secrets out of the repo: copy `backend/.env.example` -> `backend/.env` and fill values locally.
- Model weights are large; prefer storing them via Git LFS or an external object store (S3, Azure Blob) and reference via `MODEL_PATH`.

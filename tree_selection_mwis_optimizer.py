"""
=========================================================
MWIS Optimization for Forest Thinning
Maximum Weighted Independent Set solver to select trees to retain
=========================================================
"""
import geopandas as gpd
import pandas as pd
from shapely.geometry import Point
from ortools.linear_solver import pywraplp
import numpy as np

# ===================== USER PARAMETERS =====================
INPUT_FILE = "input/KisoHinoki_S2xGEDI_RF_Summer_memsave_candidates.geojson"
OUTPUT_DIR = "output/"
OUTPUT_PREFIX = "KisoHinoki_thinning_keep"
SPACING_M = 10  # Minimum spacing constraint for thinning (meters)

# ===================== LOAD DATA =====================
print(f"Loading data from: {INPUT_FILE}")

if INPUT_FILE.endswith(".geojson"):
    gdf = gpd.read_file(INPUT_FILE)
elif INPUT_FILE.endswith(".csv"):
    df = pd.read_csv(INPUT_FILE)
    # Create geometry from longitude/latitude columns
    if 'longitude' in df.columns and 'latitude' in df.columns:
        gdf = gpd.GeoDataFrame(
            df,
            geometry=[Point(xy) for xy in zip(df['longitude'], df['latitude'])],
            crs="EPSG:4326"
        )
    else:
        raise ValueError("CSV file must contain 'longitude' and 'latitude' columns.")
else:
    raise ValueError("File format must be CSV or GeoJSON.")

print(f"Loaded {len(gdf)} tree candidates")

# ===================== HAVERSINE DISTANCE CALCULATION =====================
# Convert coordinates to radians for Haversine distance
coords = np.radians(np.c_[gdf.geometry.y.values, gdf.geometry.x.values])
R = 6371000.0  # Earth radius in meters

def haversine_m(lat1, lon1, lat2, lon2):
    """Calculate distance between two points using Haversine formula"""
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = np.sin(dlat/2.0)**2 + np.cos(lat1)*np.cos(lat2)*np.sin(dlon/2.0)**2
    return 2 * R * np.arcsin(np.sqrt(a))

# ===================== BUILD SPATIAL CONFLICT GRAPH =====================
N = len(gdf)
neighbors = [[] for _ in range(N)]

print(f"Building spatial conflict graph (spacing < {SPACING_M}m)...")
print("This may take time for large datasets...")

for i in range(N):
    # Calculate distance from point i to all points j > i
    di = haversine_m(coords[i,0], coords[i,1], coords[i+1:, 0], coords[i+1:, 1])
    conflict_indices = np.where(di < SPACING_M)[0]
    for c in conflict_indices:
        neighbors[i].append(i + 1 + c)

total_conflicts = sum(len(n) for n in neighbors)
print(f"Conflict graph built: {total_conflicts} conflict pairs")

# ===================== DEFINE OPTIMIZATION WEIGHTS =====================
# Use 'W' column if available, otherwise use 'H_m' (tree height)
if 'W' in gdf.columns:
    W = gdf['W'].to_numpy(float)
    print("Using 'W' column as optimization weights")
elif 'H_m' in gdf.columns:
    W = gdf['H_m'].to_numpy(float)
    print("Using 'H_m' column as optimization weights")
else:
    raise ValueError("Data must contain either 'W' or 'H_m' column for optimization.")

# ===================== MWIS OPTIMIZATION (OR-Tools) =====================
print("\nSetting up optimization problem...")
solver = pywraplp.Solver.CreateSolver('CBC')
if not solver:
    raise Exception("Could not create CBC solver.")

# Decision variables: y[i] = 1 means keep tree i
y = [solver.BoolVar(f'y_{i}') for i in range(N)]

# Objective: maximize total weight of selected trees
solver.Maximize(solver.Sum(W[i] * y[i] for i in range(N)))

# Constraints: no two trees within SPACING_M can both be kept
for i in range(N):
    for j in neighbors[i]:
        solver.Add(y[i] + y[j] <= 1)

print(f"Optimization problem configured:")
print(f"  - Variables: {N}")
print(f"  - Constraints: {total_conflicts}")
print("\nSolving...")

status = solver.Solve()

if status == pywraplp.Solver.OPTIMAL:
    print("✓ Optimal solution found!")
    objective_value = solver.Objective().Value()
    print(f"  Objective value: {objective_value:.2f}")
else:
    print(f"⚠ Solver stopped with status: {status}")

# ===================== SAVE RESULTS =====================
keep_flags = [int(y[i].solution_value() > 0.5) for i in range(N)]
gdf["keep"] = keep_flags
gdf["remove"] = (gdf["keep"] == 0)

kept_count = gdf['keep'].sum()
removed_count = gdf['remove'].sum()

print(f"\nResults:")
print(f"  Trees to keep: {kept_count} ({kept_count/N*100:.1f}%)")
print(f"  Trees to remove: {removed_count} ({removed_count/N*100:.1f}%)")

# Export results
output_geojson = OUTPUT_DIR + OUTPUT_PREFIX + ".geojson"
output_csv = OUTPUT_DIR + OUTPUT_PREFIX + ".csv"

gdf.to_file(output_geojson, driver="GeoJSON")
gdf[['H','H_m','W','keep','remove','geometry']].to_csv(output_csv, index=False)

print(f"\n✓ Results saved to:")
print(f"  - {output_geojson}")
print(f"  - {output_csv}")

# 🌲 Forest Canopy Height Estimation and Thinning Optimization Workflow

> Objective: Identify optimal trees to retain in a forest stand using satellite-based canopy height estimation and mathematical optimization, minimizing future timber loss while maximizing forest value.
> 
> 
> This workflow integrates *Google Earth Engine (GEE)* for canopy extraction and *Python (OR-Tools)* for spatial optimization.
> 

---

## 📁 Project Structure

```
space/
├── canopy_height_extractor.js              # Step 1: Canopy height modeling and tree crown peak detection (GEE)
├── tree_selection_mwis_optimizer.py        # Step 2: Spatial optimization to select trees to retain (Python, MWIS)
├── tree_selection_visualization.js         # Step 3: Visualize thinning results on GEE map
├── README.md                               # Documentation (this file)
├── input/                                  # Input data directory
│   ├── KisoHinoki_S2xGEDI_RF_Summer_memsave_candidates.csv
│   └── KisoHinoki_S2xGEDI_RF_Summer_memsave_candidates.geojson
├── output/                                 # Output results directory
│   ├── KisoHinoki_thinning_keep.csv
│   └── KisoHinoki_thinning_keep.geojson
└── venv/                                   # Python virtual environment (optional)
```

---

## 🚀 Overview of Workflow

| Step | Script | Description | Execution Environment | Output |
| --- | --- | --- | --- | --- |
| **1** | `canopy_height_extractor.js` | Extract canopy height from Sentinel-2 and GEDI, detect dominant trees | Google Earth Engine Code Editor | GeoJSON / CSV of tree candidates (download to `input/`) |
| **2** | `tree_selection_mwis_optimizer.py` | Apply maximum weighted independent set optimization to select trees to retain | Local Python Environment | CSV / GeoJSON with `keep` / `remove` columns in `output/` |
| **3** | `tree_selection_visualization.js` | Visualize retained vs. removed trees on map | Google Earth Engine Code Editor | Interactive map visualization |

---

## 🔧 Prerequisites

### ✅ Google Earth Engine (for Steps 1 & 3)

**Execution Environment:** GEE Code Editor (https://code.earthengine.google.com)

- Sign up for Google Earth Engine access
- JavaScript code runs directly in the GEE Code Editor (browser-based)
- Upload capability under **Assets** (for Step 3)

**Note:** `.js` files are NOT executed locally. Copy and paste the code into the GEE Code Editor.

### ✅ Local Python Environment (for Step 2)

**Execution Environment:** Your local code editor (VS Code, PyCharm, etc.)

Install required libraries:

```bash
pip install geopandas shapely ortools pandas numpy
```

Or use a virtual environment:

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install geopandas shapely ortools pandas numpy
```

---

## 📜 Step-by-Step Usage

### **1️⃣ Canopy Height Extraction (GEE Code Editor)**

**Environment:** Google Earth Engine Code Editor (browser-based)

1. Open https://code.earthengine.google.com in your browser
2. Copy and paste the contents of `canopy_height_extractor.js` into the Code Editor
3. Modify parameters if needed:
   - `AOI`: Set your Area of Interest (coordinates)
   - `START` / `END`: Adjust date range
   - `OUT_PREFIX`: Change output filename prefix
4. Click **Run** to execute the script
5. The script will:
   - Retrieve Sentinel-2 imagery (summer season only)
   - Train regression model using GEDI canopy height (rh98)
   - Predict 10m canopy height raster
   - Extract tree crown peaks
6. Go to the **Tasks** tab and click **Run** on the export tasks
7. Download the exported files from Google Drive to your local `input/` directory

✅ **Output Columns**:

| H | W | H_m | longitude | latitude | crown_radius_m | spacing_m | source |

---

### **2️⃣ Thinning Optimization (Local Python Environment)**

**Environment:** Your local code editor (VS Code, PyCharm, terminal, etc.)

1. Ensure the candidate file is in the `input/` directory:
   - `input/KisoHinoki_S2xGEDI_RF_Summer_memsave_candidates.geojson`
2. Open `tree_selection_mwis_optimizer.py` in your editor
3. Modify parameters if needed:
   - `INPUT_FILE`: Path to your candidate file
   - `SPACING_M`: Minimum spacing constraint (default: 10m)
4. Run the script:

```bash
python tree_selection_mwis_optimizer.py
```

5. The script will:
   - Load candidate trees from `input/` directory
   - Build spatial conflict constraints (trees < spacing_m apart cannot both be kept)
   - Solve Maximum Weighted Independent Set (MWIS) optimization
   - Save results to `output/` directory

✅ **Output Columns**:

| H | H_m | W | keep | remove | geometry |

📂 **Output Files** (saved to `output/` directory):

```
output/KisoHinoki_thinning_keep.geojson
output/KisoHinoki_thinning_keep.csv
```

---

### **3️⃣ Visualization (GEE Code Editor)**

**Environment:** Google Earth Engine Code Editor (browser-based)

1. Upload the optimization result to GEE Assets:
   - Go to the **Assets** tab in GEE Code Editor
   - Click **NEW** → **Table Upload**
   - Upload `output/KisoHinoki_thinning_keep.geojson`
2. Copy and paste the contents of `tree_selection_visualization.js` into the Code Editor
3. Update the `ASSET_PATH` variable with your asset path:
   ```javascript
   var ASSET_PATH = 'projects/YOUR_PROJECT/assets/KisoHinoki_thinning_keep';
   ```
4. Click **Run** to visualize:
   - 🌳 **Green points** = Trees to retain
   - 🔴 **Red points** = Trees to remove (thinning targets)

---

## 📈 Optional Extensions

| Feature | Description |
| --- | --- |
| Slope constraint | Exclude trees on steep terrain (>35°) |
| Riparian buffer | Preserve trees near water bodies |
| Road proximity | Prefer trees closer to logging roads |
| Economic weighting | Replace W with estimated timber volume or monetary value |
| KML export | Generate GPS-compatible files for field operations |

---

## 📊 Example Applications

- **Sustainable forestry management**
- **Carbon stock maximization**
- **Timber value retention**
- **Automated thinning decision support**
- **Research in remote sensing + optimization**

---

## 🧠 Citation (If used in research)

```
Hattori, T. (2025). Forest Thinning Decision Optimization using Multispectral Remote Sensing and Maximum Weighted Independent Set Modeling.

```

---

## 🤝 Contact / Contributions

- Author: [Takumi Hattori]
- Feel free to open an issue or request enhancements (e.g., economic model, terrain constraints).
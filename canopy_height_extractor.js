/************************************************************
 * Sentinel-2 × GEDI Hybrid Canopy Height Estimation
 * Memory-optimized version for summer season at 10m resolution
 ************************************************************/

// ===================== USER PARAMETERS =====================
var AOI = ee.Geometry.Rectangle([137.597, 35.783, 137.665, 35.830]); // Akasawa Natural Recreation Forest
var TRAIN_BUFFER_KM = 15;              // Training region buffer (km)
var START = '2021-06-01';
var END   = '2023-08-31';
var SUMMER_START = 6, SUMMER_END = 8;  // Summer months: June-August

var OUT_PREFIX = 'KisoHinoki_S2xGEDI_RF_Summer_memsave';
var MIN_H_M = 5;                       // Minimum tree height threshold (meters)
var CROWN_RADIUS_M = 5;                // Crown radius for peak detection (meters)
var SPACING_M = 10;                    // Minimum spacing between trees (meters)

// Memory optimization parameters
var MAX_TRAIN_SAMPLES = 50000;         // Maximum training samples
var MAX_VALID_SAMPLES = 15000;         // Maximum validation samples
var MAX_PEAK_POINTS   = 80000;         // Maximum output peak points
var TILE_SCALE        = 2;             // Tile scale for sampling
var RF_TREES          = 200;           // Number of Random Forest trees

Map.centerObject(AOI, 12);
var TRAIN_REGION = AOI.buffer(TRAIN_BUFFER_KM * 1000);

// ===================== FOREST MASK (Hansen) =====================
var hansen = ee.Image('UMD/hansen/global_forest_change_2024_v1_12');
var forestMask = hansen.select('treecover2000').gt(10)
  .and(hansen.select('datamask').eq(1))
  .selfMask()
  .clip(AOI);

Map.addLayer(forestMask, {palette:['#88cc88']}, 'Forest mask (Hansen)');

// ===================== SENTINEL-2 (Summer only with SCL mask) =====================
var s2sr = ee.ImageCollection('COPERNICUS/S2_SR')
  .filterDate(START, END)
  .filterBounds(TRAIN_REGION)
  .filter(ee.Filter.calendarRange(SUMMER_START, SUMMER_END, 'month'))
  .map(function(img){
    var sel = img.select(['B2','B3','B4','B8','B11','B12','SCL']).clip(TRAIN_REGION);
    var scl = sel.select('SCL');
    // Mask out clouds, cloud shadows, and snow
    var mask = scl.neq(3).and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
    return sel.updateMask(mask);
  });

var s2med = s2sr.median().select(['B2','B3','B4','B8','B11','B12']);
var s2_for_feats = s2med;

// ===================== TERRAIN (Elevation and Slope) =====================
var srtm  = ee.Image('USGS/SRTMGL1_003').clip(TRAIN_REGION);
var elev  = srtm.rename('elev');
var slope = ee.Terrain.slope(srtm).rename('slope');

// ===================== SPECTRAL INDICES AND TEXTURE =====================
function addIndices(img) {
  var B2 = img.select('B2'),  B3 = img.select('B3'),
      B4 = img.select('B4'),  B8 = img.select('B8'),
      B11= img.select('B11'), B12= img.select('B12');

  var ndvi = B8.subtract(B4).divide(B8.add(B4)).rename('NDVI');
  var evi  = B8.subtract(B4).multiply(2.5)
               .divide(B8.add(B4.multiply(6)).subtract(B2.multiply(7.5)).add(1))
               .rename('EVI');
  var ndwi = B8.subtract(B11).divide(B8.add(B11)).rename('NDWI');
  var nbr  = B8.subtract(B12).divide(B8.add(B12)).rename('NBR');
  var msi  = B11.divide(B8).rename('MSI');

  // NIR local variance (30m radius)
  var varKernel = ee.Kernel.circle({radius: 30, units: 'meters', normalize: false});
  var nirVar = B8.reduceNeighborhood({
    reducer: ee.Reducer.variance(),
    kernel: varKernel,
    skipMasked: true
  }).rename('NIR_var');

  return img.addBands([ndvi, evi, ndwi, nbr, msi, nirVar]);
}

var featImg = addIndices(s2_for_feats)
  .addBands([elev, slope])
  .select(['B2','B3','B4','B8','B11','B12','NDVI','EVI','NDWI','NBR','MSI','NIR_var','elev','slope']);

// ===================== GEDI (Training label: rh98) =====================
var gediIC = ee.ImageCollection('LARSE/GEDI/GEDI02_A_002_MONTHLY')
  .filterDate(START, END)
  .filterBounds(TRAIN_REGION)
  .map(function(img){
    return img.updateMask(img.select('degrade_flag').eq(0)).select('rh98').clip(TRAIN_REGION);
  });

var gediMedian = gediIC.median();
Map.addLayer(gediMedian.clip(AOI), {min:0, max:50, palette:['#ffffff','#80c97e','#196c2c']}, 'GEDI rh98 median');

// ===================== SAMPLING (with sample size limits) =====================
var labelBand = 'rh98';
var featuresForSample = featImg.addBands(gediMedian.rename(labelBand))
                               .updateMask(gediMedian.mask());

var samplesRaw = featuresForSample.sample({
  region: TRAIN_REGION,
  scale: 25,
  numPixels: MAX_TRAIN_SAMPLES + MAX_VALID_SAMPLES,
  seed: 123,
  geometries: false,
  tileScale: TILE_SCALE
}).filter(ee.Filter.notNull([labelBand]));

// Split into training and validation sets
var withRand = samplesRaw.randomColumn('rand', 123);
var train = withRand.filter(ee.Filter.lt('rand', 0.77)).limit(MAX_TRAIN_SAMPLES);
var valid = withRand.filter(ee.Filter.gte('rand', 0.77)).limit(MAX_VALID_SAMPLES);
print('Training samples:', train.size(), 'Validation samples:', valid.size());

// ===================== RANDOM FOREST REGRESSION =====================
var predictors = ['B2','B3','B4','B8','B11','B12','NDVI','EVI','NDWI','NBR','MSI','NIR_var','elev','slope'];

var rf = ee.Classifier.smileRandomForest({
  numberOfTrees: RF_TREES,
  variablesPerSplit: 4,
  minLeafPopulation: 3,
  bagFraction: 0.632
}).setOutputMode('REGRESSION');

var rfTrained = rf.train({
  features: train,
  classProperty: labelBand,
  inputProperties: predictors
});

// Validation RMSE
var validPred = valid.classify(rfTrained, 'pred');
var residuals = validPred.map(function(f){
  var p = ee.Number(f.get('pred'));
  var y = ee.Number(f.get(labelBand));
  return f.set('sqerr', p.subtract(y).pow(2));
});
var rmse = ee.Number(residuals.aggregate_mean('sqerr')).sqrt();
print('Validation RMSE (m):', rmse);

// ===================== CANOPY HEIGHT PREDICTION (10m) =====================
var chPred = featImg.select(predictors).classify(rfTrained).rename('H');
chPred = chPred.updateMask(forestMask).updateMask(chPred.gte(MIN_H_M)).clip(AOI);

Map.addLayer(chPred, {min:0, max:40, palette:['#ffffff','#e1f3d8','#b8e6b0','#80c97e','#3b9f50','#196c2c']}, 'Predicted CH (10m, Summer)');

// ===================== DOMINANT TREE CROWN PEAK DETECTION =====================
var kernel = ee.Kernel.circle({radius: CROWN_RADIUS_M, units: 'meters', normalize: false});
var peaks = chPred.focal_max({kernel: kernel, iterations: 1})
                  .eq(chPred)
                  .selfMask()
                  .rename('peak');

// Filter peaks with height >= MIN_H_M
var peaksFiltered = peaks.updateMask(chPred.gte(MIN_H_M));

// Convert peaks to point features (with limit for memory optimization)
var peakFeatImg = peaksFiltered.addBands(chPred.rename('H'));
var treePtsAll = peakFeatImg.sample({
  region: AOI,
  scale: 10,
  geometries: true,
  tileScale: TILE_SCALE
}).map(function(f){
  var H = ee.Number(f.get('H'));
  return f.set({
    'W': H,
    'H_m': H,
    'source': 'RF(S2 Summer) trained by GEDI rh98',
    'crown_radius_m': CROWN_RADIUS_M,
    'spacing_m': SPACING_M
  });
});

// Limit to top MAX_PEAK_POINTS by height
var treePts = ee.FeatureCollection(treePtsAll.limit(MAX_PEAK_POINTS, 'H', false));

print('Tree candidates (limited):', treePts.size());
Map.addLayer(peaksFiltered, {palette:['cyan']}, 'Peaks (filtered)');
Map.addLayer(treePts, {color:'red'}, 'Tree candidates (points, limited)');

// ===================== EXPORTS =====================
Export.image.toDrive({
  image: chPred.toFloat(),
  description: OUT_PREFIX + '_CH10m_' + Date.now(),
  fileNamePrefix: OUT_PREFIX + '_CH10m',
  region: AOI,
  scale: 10,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});

Export.table.toDrive({
  collection: treePts,
  description: OUT_PREFIX + '_candidates_csv_' + Date.now(),
  fileNamePrefix: OUT_PREFIX + '_candidates',
  fileFormat: 'CSV'
});

Export.table.toDrive({
  collection: treePts,
  description: OUT_PREFIX + '_candidates_geojson_' + Date.now(),
  fileNamePrefix: OUT_PREFIX + '_candidates',
  fileFormat: 'GeoJSON'
});

// ===================== STATISTICS =====================
var stats = chPred.reduceRegion({
  reducer: ee.Reducer.percentile([25,50,75]).combine({
    reducer2: ee.Reducer.mean(), sharedInputs: true
  }),
  geometry: AOI,
  scale: 30,
  bestEffort: true,
  maxPixels: 1e8
});
print('Predicted CH stats:', stats);

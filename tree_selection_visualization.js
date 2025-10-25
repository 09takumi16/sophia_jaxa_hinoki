/************************************************************
 * Tree Selection Visualization
 * Displays retained vs. removed trees after MWIS optimization
 ************************************************************/

// ===================== USER PARAMETERS =====================
// Replace with your own GEE Asset path
var ASSET_PATH = 'projects/spacedev-476108/assets/KisoHinoki_thinning_keep';

// ===================== LOAD DATA =====================
var trees = ee.FeatureCollection(ASSET_PATH);

// ===================== FILTER AND DISPLAY =====================
// Trees to keep (keep=1): displayed in green
var kept = trees.filter(ee.Filter.eq('keep', 1));
Map.addLayer(kept, {color: 'green'}, 'Kept Trees (remain)');

// Trees to remove (remove=true): displayed in red
var removed = trees.filter(ee.Filter.eq('remove', true));
Map.addLayer(removed, {color: 'red'}, 'Removed Trees (to cut)');

// Center map on the tree collection
Map.centerObject(trees, 13);

// ===================== STATISTICS =====================
print('Kept count:', kept.size());
print('Removed count:', removed.size());

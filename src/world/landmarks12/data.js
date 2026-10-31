// Line 12 buildings whose OSM massing is replaced by hand-built geometry (format of REPLACED in
// ../LandmarkData.js): footprint centroid (vertex average) in game coordinates, match radius, note.
export const REPLACED12 = [
  // --- Sofia Central Station, main building (OSM building=train_station, 13 500 m²), stops 1330 / 1331
  { x: -2588.5, z: -4815.8, r: 4, id: 10703, note: 'Central Station main building', h: 15.4 },
  // --- храм „Свети Седмочисленици“ (Graf Ignatiev 25): the domed hall part in the pack
  { x: -1999.0, z: -2325.0, r: 1, id: 3935, note: 'Seven Saints church', h: 26 },
  { x: -1999.0, z: -2325.0, r: 1, id: 3934, note: 'Seven Saints church hall', h: 12 },
  { x: -2011.9, z: -2339.4, r: 3, id: 3936, note: 'Seven Saints church bell tower', h: 22 },
  // --- УАСГ: the twelve-storey block (OSM "Нова сграда") and the rectorate wing
  { x: -1659.0, z: -1601.1, r: 3, id: 2950, note: 'UASG tower block main', h: 37 },
  { x: -1691.1, z: -1620.7, r: 3, id: 2947, note: 'UASG tower block west', h: 37 },
  { x: -1637.2, z: -1570.2, r: 3, id: 2952, note: 'UASG tower block east', h: 37 },
  { x: -1687.0, z: -1620.9, r: 2, id: 2951, note: 'UASG podium', h: 7.4 },
  { x: -1727.0, z: -1777.3, r: 3, id: 3017, note: 'UASG rectorate', h: 13 },
];

import { r as e } from "./rolldown-runtime-DdACKOZr.js";
import { t } from "./vendor-maplibre-U8rKgh-I.js";
import {
  a,
  i as o,
  n as r,
  o as i,
  r as n,
  s,
  t as l,
} from "./vendor-deckgl-l5zqbYGK.js";
!(function () {
  const e = document.createElement("link").relList;
  if (!(e && e.supports && e.supports("modulepreload"))) {
    for (const e of document.querySelectorAll('link[rel="modulepreload"]'))
      t(e);
    new MutationObserver((e) => {
      for (const a of e)
        if ("childList" === a.type)
          for (const e of a.addedNodes)
            "LINK" === e.tagName && "modulepreload" === e.rel && t(e);
    }).observe(document, { childList: !0, subtree: !0 });
  }
  function t(e) {
    if (e.ep) return;
    e.ep = !0;
    const t = (function (e) {
      const t = {};
      return (
        e.integrity && (t.integrity = e.integrity),
        e.referrerPolicy && (t.referrerPolicy = e.referrerPolicy),
        "use-credentials" === e.crossOrigin
          ? (t.credentials = "include")
          : "anonymous" === e.crossOrigin
            ? (t.credentials = "omit")
            : (t.credentials = "same-origin"),
        t
      );
    })(e);
    fetch(e.href, t);
  }
})();
var c = e(t(), 1),
  d = {
    container: "map",
    style: "https://tiles.openfreemap.org/styles/liberty",
    center: [-3.7035, 40.4169],
    zoom: 19,
    maxZoom: 24,
  },
  u = { PAVEMENT: 1, LIGHT_PARK: 1.8, HEAVY_GRASS: 3.5, IMPASSABLE: 999999 };
function h(e) {
  const t = e.sourceLayer || "",
    {
      layer: a,
      class: o,
      subclass: r,
      brunnel: i,
      indoor: n,
      foot: s,
      access: l,
    } = e.properties;
  let c = parseInt(a ?? "0", 10).toString();
  if (1 === n || "true" === n || !0 === n)
    return { cost: "IMPASSABLE", layer: c };
  if ("transportation" === t) {
    if (
      ("0" === c && ("bridge" === i && (c = "1"), "tunnel" === i && (c = "-1")),
      "no" === s || "private" === s || "no" === l || "private" === l)
    )
      return { cost: "IMPASSABLE", layer: c };
    if (o.includes("_construction")) return { cost: "IMPASSABLE", layer: c };
    if ("path" === o)
      return ["pedestrian", "footway", "corridor", "platform", "path"].includes(
        r,
      )
        ? { cost: "PAVEMENT", layer: c }
        : "bridleway" === r || "cycleway" === r
          ? { cost: "LIGHT_PARK", layer: c }
          : "steps" === r
            ? { cost: "HEAVY_GRASS", layer: c }
            : { cost: "PAVEMENT", layer: c };
    if ("ford" === i) return { cost: "HEAVY_GRASS", layer: c };
    const e = ["secondary", "tertiary"],
      t = ["minor", "service"];
    return [
      "motorway",
      "trunk",
      "primary",
      "raceway",
      "busway",
      "bus_guideway",
    ].includes(o)
      ? { cost: "IMPASSABLE", layer: c }
      : e.includes(o) || t.includes(o)
        ? { cost: "PAVEMENT", layer: c }
        : "track" === o
          ? { cost: "LIGHT_PARK", layer: c }
          : ("railway" === o ||
              [
                "rail",
                "narrow_gauge",
                "preserved",
                "funicular",
                "subway",
                "light_rail",
                "monorail",
                "tram",
              ].includes(r),
            { cost: "IMPASSABLE", layer: c });
  }
  if ("landcover" === t) {
    if (
      ["ice", "rock", "wetland"].includes(o) ||
      [
        "glacier",
        "bare_rock",
        "scree",
        "swamp",
        "bog",
        "marsh",
        "mangrove",
        "reedbed",
        "saltmarsh",
        "tidalflat",
        "tundra",
      ].includes(r)
    )
      return { cost: "IMPASSABLE", layer: c };
    if (
      [
        "forest",
        "wood",
        "scrub",
        "shrubbery",
        "heath",
        "sand",
        "beach",
        "dune",
        "fell",
      ].includes(r)
    )
      return { cost: "HEAVY_GRASS", layer: c };
    if (
      [
        "grass",
        "grassland",
        "meadow",
        "park",
        "garden",
        "golf_course",
        "village_green",
        "recreation_ground",
        "flowerbed",
        "wet_meadow",
      ].includes(r)
    )
      return { cost: "LIGHT_PARK", layer: c };
    if (
      [
        "farm",
        "farmland",
        "allotments",
        "orchard",
        "vineyard",
        "plant_nursery",
      ].includes(r)
    )
      return { cost: "HEAVY_GRASS", layer: c };
  }
  if ("landuse" === t) {
    if (["military", "industrial", "quarry", "dam", "railway"].includes(o))
      return { cost: "IMPASSABLE", layer: c };
    if (
      [
        "residential",
        "commercial",
        "retail",
        "school",
        "university",
        "kindergarten",
        "college",
        "library",
        "hospital",
        "bus_station",
      ].includes(o)
    )
      return { cost: "PAVEMENT", layer: c };
    if (
      [
        "stadium",
        "pitch",
        "playground",
        "track",
        "theme_park",
        "zoo",
        "cemetery",
      ].includes(o)
    )
      return { cost: "LIGHT_PARK", layer: c };
    if (["suburb", "quarter", "neighbourhood", "garages"].includes(o))
      return { cost: "PAVEMENT", layer: c };
  }
  return "building" === t || "water" === t
    ? { cost: "IMPASSABLE", layer: c }
    : { cost: "PAVEMENT", layer: c };
}
function p() {
  let e;
  try {
    e = s(this.aoi_polygon, 15, !0);
  } catch (t) {
    return;
  }
  return e;
}
function g() {
  let e = this.getHexes();
  const t = this.queryRenderedFeatures(this.aoi_px, {
      layers: ["building", "water", "landcover", "landuse", "transportation"],
    }),
    a = t.length;
  this.cellFrictionMap.clear();
  for (let r = 0; r < a; r++) {
    const e = t[r];
    if (!e.geometry) continue;
    const a = h(e);
    if ("Polygon" === e.geometry.type)
      this.mapPolygonCells(e.geometry.coordinates, a);
    else if ("MultiPolygon" === e.geometry.type) {
      const t = e.geometry.coordinates.length;
      for (let o = 0; o < t; o++)
        this.mapPolygonCells(e.geometry.coordinates[o], a);
    } else if (
      "LineString" === e.geometry.type ||
      "MultiLineString" === e.geometry.type
    ) {
      const t =
          "LineString" === e.geometry.type
            ? [e.geometry.coordinates]
            : e.geometry.coordinates,
        o = t.length;
      for (let e = 0; e < o; e++) this.mapLineCells(t[e], a);
    }
  }
  (this.multiFrictionMap.forEach((e, t) => {
    let a = 1 / 0;
    for (const o in e) e[o] < a && (a = e[o]);
    this.cellFrictionMap.set(t, a);
  }),
    this.initializeAffordanceMap());
  const o = e.length;
  for (let r = 0; r < o; r++) {
    const t = e[r];
    this.cachedCoordinates.has(t) || this.cachedCoordinates.set(t, n(t));
  }
  this.updateLayers(e);
}
function f(e, t) {
  const a = s(
    e.map((e) => e.map((e) => [e[1], e[0]])),
    15,
  );
  m(this.multiFrictionMap, a, t);
}
function y(e, t) {
  const o = e.length;
  for (let r = 0; r < o - 1; r++) {
    const o = i(e[r][1], e[r][0], 15),
      n = i(e[r + 1][1], e[r + 1][0], 15),
      s = a(o, n);
    s.push(o, n);
    const l = new Set(s);
    m(this.multiFrictionMap, [...l], t);
  }
}
function m(e, t, a) {
  const o = t.length,
    r = {};
  r[a.layer] = u[a.cost];
  for (let i = 0; i < o; i++) {
    const o = t[i],
      n = e.get(o);
    void 0 === n
      ? e.set(o, r)
      : void 0 !== n &&
        (void 0 === n[a.layer] || r[a.layer] > n[a.layer]) &&
        ((n[a.layer] = r[a.layer]), e.set(o, n));
  }
}
function M() {
  const e = new c.default.LngLatBounds(),
    t = this.project(this.getBounds().getSouthEast()),
    a = Object.keys(this.simulationNodes).map((t) => {
      const a = n(t),
        o = this.simulationNodes[t];
      return (
        e.extend([a[1], a[0]]),
        {
          type: "Feature",
          properties: { type: o.type, weight: o.weight },
          geometry: { type: "Point", coordinates: [a[1], a[0]] },
        }
      );
    });
  let o = this.project(e.getNorthWest()),
    r = this.project(e.getSouthEast());
  ((o = [Math.max(0, o.x - 64), Math.max(0, o.y - 64)]),
    (r = [Math.min(t.x, r.x + 64), Math.min(t.y, r.y + 64)]));
  const i = this.unproject([o[0], r[1]]),
    s = this.unproject([r[0], o[1]]);
  ((this.aoi_px = [o, r]),
    (this.aoi_polygon = [
      [i.lng, i.lat],
      [s.lng, i.lat],
      [s.lng, s.lat],
      [i.lng, s.lat],
      [i.lng, i.lat],
    ]),
    this.getSource("pins")
      ? this.getSource("pins").setData({
          type: "FeatureCollection",
          features: a,
        })
      : (this.addSource("pins", {
          type: "geojson",
          data: { type: "FeatureCollection", features: a },
        }),
        this.addLayer({
          id: "pin-circles",
          type: "circle",
          source: "pins",
          paint: {
            "circle-radius": ["+", 7, ["*", ["get", "weight"], 2.5]],
            "circle-color": [
              "match",
              ["get", "type"],
              "origin",
              "#28a745",
              "destination",
              "#dc3545",
              "both",
              "#ffc107",
              "#000",
            ],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#fff",
          },
        }),
        this.addLayer({
          id: "pin-labels",
          type: "symbol",
          source: "pins",
          layout: {
            "text-field": ["concat", ["get", "weight"], "p"],
            "text-size": 10,
            "text-allow-overlap": !0,
          },
          paint: { "text-color": "#ffffff" },
        })));
}
function A(e) {
  const t = [],
    a = e.length;
  for (let o = 0; o < a; o++) {
    const a = e[o];
    t.push({
      hex: a,
      f: this.cellFrictionMap.get(a) ?? 1,
      s: this.pathDesireScores.get(a) || 0,
    });
  }
  ((this.baseLayer = new l({
    id: "friction-mesh",
    data: t,
    beforeId: this.targetLabelLayerId,
    stroked: !1,
    getLineWidth: 0,
    filled: !0,
    getHexagon: (e) => e.hex,
    getFillColor: (e) =>
      e.f >= u.IMPASSABLE
        ? [231, 76, 60, 160]
        : e.f === u.HEAVY_GRASS
          ? [39, 174, 96, 120]
          : e.f === u.LIGHT_PARK
            ? [166, 216, 84, 90]
            : [0, 150, 255, 25],
    updateTriggers: { getFillColor: [t] },
  })),
    (this.flowLayer = new l({
      id: "flow-mesh",
      data: t.filter((e) => e.s > 0),
      beforeId: this.targetLabelLayerId,
      stroked: !1,
      getLineWidth: 0,
      filled: !0,
      getHexagon: (e) => e.hex,
      getFillColor: (e) => {
        const t = Math.log1p(e.s),
          a = Math.log1p(this.globalPeakFlow),
          o = a > 0 ? t / a : 0;
        return [
          Math.floor(135 + 120 * o),
          0,
          Math.floor(236 * o),
          Math.floor(140 + 115 * o),
        ];
      },
      updateTriggers: { getFillColor: [t, this.globalPeakFlow] },
    })),
    this.deckOverlayInstance.setProps({
      layers: [this.baseLayer, this.flowLayer],
    }));
}
function S() {
  (this.flowLayer && (this.flowLayer = null),
    this.deckOverlayInstance.setProps({ layers: [this.baseLayer] }));
}
var b = class {
  constructor() {
    this.data = [];
  }
  insert(e, t) {
    (this.data.push({ node: e, score: t }), this.up(this.data.length - 1));
  }
  extractMin() {
    if (0 === this.data.length) return null;
    const e = this.data[0],
      t = this.data.pop();
    return (this.data.length > 0 && ((this.data[0] = t), this.down(0)), e.node);
  }
  size() {
    return this.data.length;
  }
  up(e) {
    for (; e > 0; ) {
      const t = (e - 1) >> 1;
      if (this.data[e].score >= this.data[t].score) break;
      const a = this.data[e];
      ((this.data[e] = this.data[t]), (this.data[t] = a), (e = t));
    }
  }
  down(e) {
    const t = this.data.length;
    for (; 1 + (e << 1) < t; ) {
      let a = 1 + (e << 1),
        o = a + 1,
        r = a;
      if (
        (o < t && this.data[o].score < this.data[a].score && (r = o),
        this.data[e].score <= this.data[r].score)
      )
        break;
      const i = this.data[e];
      ((this.data[e] = this.data[r]), (this.data[r] = i), (e = r));
    }
  }
};
function L() {
  const e = Object.keys(this.simulationNodes).filter((e) =>
      ["destination", "both"].includes(this.simulationNodes[e].type),
    ),
    t = Object.keys(this.simulationNodes).filter((e) =>
      ["origin", "both"].includes(this.simulationNodes[e].type),
    ),
    a = this.getHexes(),
    r = Math.ceil(a.length / Math.sqrt(2)),
    i = new Map();
  (e.forEach((e) =>
    i.set(
      e,
      (function (e) {
        let t = new Map(),
          a = new b();
        for (t.set(e, 0), a.insert(e, 0); a.size() > 0; ) {
          let e = a.extractMin(),
            r = o(e, 1);
          for (let o of r)
            this.cellFrictionMap.get(o) >= u.IMPASSABLE ||
              (t.get(e) + 1 < (t.get(o) ?? 1 / 0) &&
                (t.set(o, t.get(e) + 1), a.insert(o, t.get(e) + 1)));
        }
        return t;
      })(e),
    ),
  ),
    t.forEach((t) => {
      let a = t,
        o =
          ((n = a),
          (s = i),
          e.reduce((e, t) => (s.get(t).get(n) < s.get(e).get(n) ? t : e)));
      var n, s;
      let l = i.get(o),
        c = P(a, o),
        d = 25 * this.simulationNodes[t].weight,
        u = [];
      for (let e = 0; e < r; e++) {
        let e = w(a, l, c);
        if (!e) break;
        if ((u.push(e), (c = P(a, e)), (a = e), a === o)) break;
      }
      let h = new Set(u);
      for (let e of h)
        (this.pathDesireScores.set(e, (this.pathDesireScores.get(e) || 0) + d),
          I.call(this, e, d));
    }));
  for (let o of this.affordanceMap.keys()) v.call(this, o);
  this.updateLayers(a);
}
function w(e, t, a) {
  let r = o(e, 15),
    i = -1 / 0,
    n = null;
  for (let o of r) {
    if (o === e || !E(e, o)) continue;
    let r = P(e, o);
    if (Math.abs(r - a) > 45) continue;
    let s =
      1.8 * (this.affordanceMap.get(o) || 0.1) -
      0.9 * (this.cellFrictionMap.get(o) || u.HEAVY_GRASS) -
      0.8 * ((t.get(o) || 0) - (t.get(e) || 0));
    s > i
      ? ((i = s), (n = o))
      : Math.abs(s - i) < 0.001 && (t.get(o) || 0) < (t.get(n) || 0) && (n = o);
  }
  return n;
}
function E(e, t) {
  return a(e, t).every((e) => this.cellFrictionMap.get(e) < u.IMPASSABLE);
}
function P(e, t) {
  const a = n(e),
    o = n(t);
  let r = Math.sin(o[1] - a[1]) * Math.cos(o[0]),
    i =
      Math.cos(a[0]) * Math.sin(o[0]) -
      Math.sin(a[0]) * Math.cos(o[0]) * Math.cos(o[1] - a[1]);
  return ((180 * Math.atan2(r, i)) / Math.PI + 360) % 360;
}
function I(e, t = 1) {
  const a = this.cellFrictionMap.get(e);
  if (a === u.PAVEMENT || a === u.IMPASSABLE) return;
  const o = a === u.HEAVY_GRASS ? 1.5 : 0.8;
  let r = this.affordanceMap.get(e) || 0.1,
    i = (0.005 * t) / (100 * o);
  this.affordanceMap.set(e, Math.min(0.85, r + i));
}
function v(e) {
  const t = this.cellFrictionMap.get(e);
  if (t !== u.PAVEMENT && t !== u.IMPASSABLE) {
    const a = t === u.HEAVY_GRASS ? 0.5 : 1.5;
    let o = this.affordanceMap.get(e) || 0.1,
      r = 0.001 * a;
    this.affordanceMap.set(e, Math.max(0.1, o - r));
  }
}
function N() {
  this.affordanceMap.clear();
  for (let [e, t] of this.cellFrictionMap)
    t >= u.IMPASSABLE
      ? this.affordanceMap.set(e, 0)
      : t === u.PAVEMENT
        ? this.affordanceMap.set(e, 1)
        : t === u.LIGHT_PARK
          ? this.affordanceMap.set(e, 0.3)
          : t === u.HEAVY_GRASS && this.affordanceMap.set(e, 0.1);
}
var k = function (e) {
  const t = Object.values(e.simulationNodes),
    a = t.filter((e) => e.weight > 0).length >= 2,
    o = t.filter((e) => "origin" === e.type || "both" === e.type).length > 0,
    r =
      t.filter((e) => "destination" === e.type || "both" === e.type).length > 0;
  return a && o && r;
};
document.addEventListener("DOMContentLoaded", () => {
  ((c.default.Map.prototype.getHexes = p),
    (c.default.Map.prototype.triggerFastScan = g),
    (c.default.Map.prototype.mapPolygonCells = f),
    (c.default.Map.prototype.mapLineCells = y),
    (c.default.Map.prototype.renderInterfacePins = M),
    (c.default.Map.prototype.updateLayers = A),
    (c.default.Map.prototype.clearLayers = S),
    (c.default.Map.prototype.computeDesirePaths = L),
    (c.default.Map.prototype.initializeAffordanceMap = N));
  const e = new c.default.Map(d);
  ((e.multiFrictionMap = new Map()),
    (e.cellFrictionMap = new Map()),
    (e.cachedCoordinates = new Map()),
    (e.pathDesireScores = new Map()),
    (e.affordanceMap = new Map()),
    (e.globalPeakFlow = 1),
    (e.simulationNodes = {}),
    (e.deckOverlayInstance = new r({ interleaved: !0, layers: [] })),
    (e.targetLabelLayerId = void 0),
    (e.placementMode = "origin"),
    (e.aoi = void 0),
    (e.readyToCompute = !1),
    e.addControl(e.deckOverlayInstance),
    e.on("load", (e) => {
      const t = e.target
        .getStyle()
        .layers.find(
          (e) =>
            "symbol" === e.type &&
            (e.id.includes("label") || e.id.includes("place")),
        );
      t && (e.target.targetLabelLayerId = t.id);
    }),
    e.on("click", (e) => {
      const t = i(e.lngLat.lat, e.lngLat.lng, 15);
      !(function (e) {
        const t = [
            [e.point.x - 5, e.point.y - 5],
            [e.point.x + 5, e.point.y + 5],
          ],
          a = e.target.queryRenderedFeatures(t, {
            layers: [
              "building",
              "water",
              "landcover",
              "landuse",
              "transportation",
            ],
          }),
          o = {};
        for (const r of a) {
          if (!r.geometry) continue;
          const e = h(r);
          (void 0 === o[e.layer] || e.cost < o[e.layer]) &&
            (o[e.layer] = e.cost);
        }
        return !(Math.min(...Object.values(o)) >= u.IMPASSABLE);
      })(e)
        ? alert(
            "This location is not accessible by foot. Please select a different location.",
          )
        : (e.target.simulationNodes[t]
            ? e.target.simulationNodes[t].type === e.target.placementMode
              ? (e.target.simulationNodes[t].weight += 1)
              : (e.target.simulationNodes[t].type = e.target.placementMode)
            : (e.target.simulationNodes[t] = {
                type: e.target.placementMode,
                weight: 1,
              }),
          e.target.renderInterfacePins(),
          k(e.target)
            ? ((e.target.readyToCompute = !0), e.target.triggerFastScan())
            : (e.target.readyToCompute = !1));
    }),
    e.on("contextmenu", (e) => {
      e.preventDefault();
      const t = i(e.lngLat.lat, e.lngLat.lng, 15);
      (e.target.simulationNodes[t] &&
        e.target.simulationNodes[t].type === e.target.placementMode &&
        (e.target.simulationNodes[t].weight -= 1),
        e.target.simulationNodes[t] &&
          e.target.simulationNodes[t].weight <= 0 &&
          delete e.target.simulationNodes[t],
        e.target.renderInterfacePins(),
        (e.target.readyToCompute = k(e.target)));
    }),
    (function (e) {
      (document
        .getElementById("btn-toggle-mode")
        .addEventListener("click", () => {
          const t = document.getElementById("mode-status");
          "origin" === e.placementMode
            ? ((e.placementMode = "destination"),
              (t.innerText = "Placement Role: Destination (B)"),
              (t.className = "mode-indicator mode-destination"))
            : "destination" === e.placementMode
              ? ((e.placementMode = "both"),
                (t.innerText = "Placement Role: Dual Mode (A + B)"),
                (t.className = "mode-indicator mode-both"))
              : ((e.placementMode = "origin"),
                (t.innerText = "Placement Role: Origin (A)"),
                (t.className = "mode-indicator mode-origin"));
        }),
        document.getElementById("btn-compute").addEventListener("click", () => {
          e.computeDesirePaths();
        }),
        document.getElementById("btn-clear").addEventListener("click", () => {
          ((e.simulationNodes = {}),
            e.pathDesireScores.clear(),
            (e.globalPeakFlow = 1),
            e.getSource("pins") &&
              e
                .getSource("pins")
                .setData({ type: "FeatureCollection", features: [] }),
            e.clearLayers());
        }));
    })(e));
});

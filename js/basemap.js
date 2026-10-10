// Map backgrounds for every map: a topo map (contours, tracks and peaks) by default, or the street map.
// The layers button switches them, and the choice is remembered on this phone for all the maps.
// The topo map 2 km either side of both courses (zoom 10 to 15) is hosted on this site (data/tiles.js lists it),
// so it can be saved on the phone for use without signal. Closer in than zoom 15 it enlarges the saved map,
// with OpenTopoMap's sharper tiles on top when there's signal. (The street map can't be saved: OpenStreetMap
// doesn't allow it.)
(function () {
  const KEY = 'gptBase', OFFLINE = 'gpt100-offline-map', DONE = 'gptOfflineMap';
  const T = window.GPT_TILES || { count: 0, bytes: 0, zmax: 15, tree: {} };
  const has = (z, x, y) => !!(T.tree[z] && T.tree[z][x] && T.tree[z][x].includes(y));
  const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
  const OTM = 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', ATTR = '&copy; OpenStreetMap, SRTM, OpenTopoMap (CC-BY-SA)';

  // Our own copy where we have it, OpenTopoMap elsewhere.
  const Corridor = window.L && L.TileLayer.extend({
    getTileUrl(c) { return has(c.z, c.x, c.y) ? `tiles/topo/${c.z}/${c.x}/${c.y}.png` : L.TileLayer.prototype.getTileUrl.call(this, c); }
  });

  window.GPTBaseMap = function (map) {
    const bases = {
      Topo: L.layerGroup([
        new Corridor(OTM, { maxZoom: 17, maxNativeZoom: T.zmax, attribution: ATTR, errorTileUrl: BLANK }),
        L.tileLayer(OTM, { minZoom: T.zmax + 1, maxZoom: 17, errorTileUrl: BLANK })
      ]),
      Street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '&copy; OpenStreetMap' })
    };
    let pick = 'Topo'; try { const v = localStorage.getItem(KEY); if (bases[v]) pick = v; } catch (e) { }
    map.attributionControl.setPrefix(false);
    bases[pick].addTo(map);
    L.control.layers(bases, null, { position: 'topright' }).addTo(map);
    map.on('baselayerchange', e => { try { localStorage.setItem(KEY, e.name); } catch (err) { } });
    return bases;
  };

  // ---------- saving the topo map on the phone ----------
  const urls = () => {
    const out = [];
    Object.keys(T.tree).forEach(z => Object.keys(T.tree[z]).forEach(x => T.tree[z][x].forEach(y => out.push(new URL(`tiles/topo/${z}/${x}/${y}.png`, location.href).href))));
    return out;
  };
  const read = () => { try { return JSON.parse(localStorage.getItem(DONE)) || null; } catch (e) { return null; } };
  window.GPTOfflineMap = {
    count: T.count, bytes: T.bytes, version: T.version,
    available: () => T.count > 0 && 'caches' in window,
    // { saved, have, total, when, current } where current means saved from this version of the map.
    async status() {
      if (!this.available()) return { saved: false, have: 0, total: T.count };
      const c = await caches.open(OFFLINE), have = (await c.keys()).length, d = read();
      return { saved: have >= T.count, have, total: T.count, when: d && d.t, current: !!d && d.v === T.version };
    },
    // Saves every tile not already on the phone, a few at a time. progress(done, total).
    async save(progress) {
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
      const c = await caches.open(OFFLINE), list = urls(), have = new Set((await c.keys()).map(r => r.url));
      let done = 0, failed = 0, i = 0;
      const next = async () => {
        while (i < list.length) {
          const u = list[i++];
          if (!have.has(u)) {
            try { const res = await fetch(u, { headers: { 'X-Offline-Save': '1' } }); if (!res.ok) throw 0; await c.put(u, res); } catch (e) { failed++; }
          }
          progress && progress(++done, list.length);
        }
      };
      await Promise.all([1, 2, 3, 4, 5, 6].map(next));
      if (!failed) try { localStorage.setItem(DONE, JSON.stringify({ v: T.version, t: Date.now() })); } catch (e) { }
      return { failed, total: list.length };
    },
    async clear() { await caches.delete(OFFLINE); try { localStorage.removeItem(DONE); } catch (e) { } }
  };
})();

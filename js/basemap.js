// Map backgrounds for every map: a topo map (contours, tracks and peaks) by default, or the street map.
// The layers button switches them, and the choice is remembered on this phone for all the maps.
(function () {
  const KEY = 'gptBase';
  window.GPTBaseMap = function (map) {
    const bases = {
      Topo: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '&copy; OpenStreetMap, SRTM, OpenTopoMap (CC-BY-SA)' }),
      Street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '&copy; OpenStreetMap' })
    };
    let pick = 'Topo'; try { const v = localStorage.getItem(KEY); if (bases[v]) pick = v; } catch (e) { }
    map.attributionControl.setPrefix(false);
    bases[pick].addTo(map);
    L.control.layers(bases, null, { position: 'topright' }).addTo(map);
    map.on('baselayerchange', e => { try { localStorage.setItem(KEY, e.name); } catch (err) { } });
    return bases;
  };
})();

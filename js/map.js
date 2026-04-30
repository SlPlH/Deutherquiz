/**
 * map.js — SVG map rendering and interaction using D3.js and GeoJSON
 */

class MapRenderer {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.conquests = {}; // regionId → { playerId, color, playerName }
    this.activeRegion = null;
    this.svg = null;
    this.g = null;
    this.projection = null;
    this.pathGenerator = null;
    this.regionsData = []; // Store geojson features
    this.isLoaded = false;
    
    // We'll call an async init
    this._init();
  }

  async _init() {
    // Create base SVG
    const width = 600;
    const height = 800;
    
    const svg = d3.select(this.container).append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)
      .attr('preserveAspectRatio', 'xMidYMid meet')
      .style('width', '100%')
      .style('height', '100%')
      .style('max-height', '100%')
      .style('display', 'block');
      
    this.svg = svg.node();

    // Defs for gradients and filters
    const defs = svg.append('defs');
    defs.html(`
      <filter id="glow-filter" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
        <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="shadow-filter" x="-10%" y="-10%" width="120%" height="120%">
        <feDropShadow dx="2" dy="3" stdDeviation="4" flood-color="rgba(0,0,0,0.5)"/>
      </filter>
    `);

    // Background
    svg.append('rect')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('fill', 'transparent');

    this.g = svg.append('g').attr('id', 'regions-group');

    try {
      // Fetch the Germany Regierungsbezirke GeoJSON (38 regions, perfect for classroom)
      const response = await fetch('https://raw.githubusercontent.com/isellsoap/deutschlandGeoJSON/main/3_regierungsbezirke/4_niedrig.geo.json');
      const geojson = await response.json();
      
      this.regionsData = geojson.features;

      // Create projection centered on Germany
      this.projection = d3.geoMercator()
        .fitSize([width, height], geojson);
        
      this.pathGenerator = d3.geoPath().projection(this.projection);

      // Render paths
      this.g.selectAll('path')
        .data(this.regionsData)
        .enter()
        .append('path')
        .attr('id', d => `region-${this._cleanId(d.properties.CCA_2 || d.properties.NAME_2 || d.properties.ID_2 || Math.random().toString())}`)
        .attr('d', this.pathGenerator)
        .attr('fill', '#1e2438')
        .attr('stroke', '#2d3555')
        .attr('stroke-width', '0.5')
        .attr('stroke-linejoin', 'round')
        .style('transition', 'fill 0.6s ease, stroke 0.3s ease')
        .style('cursor', 'default')
        .each(function(d) {
          // Store region ID on dataset for easy access
          this.dataset.regionId = d.properties.CCA_2 || d.properties.NAME_2 || d.properties.ID_2;
          this.dataset.regionName = d.properties.NAME_2;
        });

      this.isLoaded = true;
      
      // Dispatch an event so the game knows map is ready
      window.dispatchEvent(new CustomEvent('mapLoaded'));

    } catch (err) {
      console.error("Error loading GeoJSON map:", err);
      this.container.innerHTML = `<div style="color:white;text-align:center;padding:20px;">Fehler beim Laden der Karte. Bitte Internetverbindung prüfen.</div>`;
    }
  }

  _cleanId(id) {
    if (!id) return "unknown";
    return id.toString().replace(/[^a-zA-Z0-9]/g, '_');
  }

  /**
   * Get list of all region IDs available
   */
  getAllRegionIds() {
    return this.regionsData.map(d => this._cleanId(d.properties.CCA_2 || d.properties.NAME_2 || d.properties.ID_2));
  }

  /**
   * Highlight the active (currently contested) region
   */
  highlightRegion(rawId) {
    const regionId = this._cleanId(rawId);
    // Reset previous
    if (this.activeRegion) {
      const prev = document.getElementById(`region-${this.activeRegion}`);
      if (prev) {
        prev.setAttribute('stroke', this.conquests[this.activeRegion] ? '#fff' : '#2d3555');
        prev.setAttribute('stroke-width', this.conquests[this.activeRegion] ? '1' : '0.5');
        prev.removeAttribute('filter');
      }
    }

    this.activeRegion = regionId;
    if (!regionId) return;

    const path = document.getElementById(`region-${regionId}`);
    if (path) {
      path.setAttribute('stroke', '#ffffff');
      path.setAttribute('stroke-width', '2');
      path.setAttribute('filter', 'url(#glow-filter)');

      // Pulse animation via class
      path.style.animation = 'none';
      requestAnimationFrame(() => {
        path.style.animation = 'regionPulse 1.5s ease-in-out infinite';
      });
      
      // Bring to front
      path.parentNode.appendChild(path);
    }
  }

  /**
   * Conquer a region (animate color change)
   */
  conquerRegion(rawId, playerId, color, playerName) {
    const regionId = this._cleanId(rawId);
    this.conquests[regionId] = { playerId, color, playerName };

    const path = document.getElementById(`region-${regionId}`);
    if (path) {
      path.style.animation = 'none';
      path.setAttribute('fill', color);
      path.setAttribute('stroke', this._lighten(color));
      path.setAttribute('stroke-width', '1');
      path.removeAttribute('filter');

      // Conquest flash
      path.style.filter = 'brightness(1.8)';
      setTimeout(() => { path.style.filter = ''; }, 600);
      
      // Bring to front
      path.parentNode.appendChild(path);
    }

    this.activeRegion = null;
  }

  /**
   * Find adjacent neutral or enemy regions for a given player
   * This is a simplified approach using D3 bounding box distance since proper topology is complex
   */
  findExpandableRegions(playerId, count = 1) {
    // Get all regions owned by player
    const ownedIds = Object.keys(this.conquests).filter(id => this.conquests[id].playerId === playerId);
    if (ownedIds.length === 0) return [];

    const ownedFeatures = this.regionsData.filter(d => ownedIds.includes(this._cleanId(d.properties.CCA_2 || d.properties.NAME_2 || d.properties.ID_2)));
    
    // Calculate centers
    const ownedCenters = ownedFeatures.map(f => this.pathGenerator.centroid(f));
    
    // Find all unowned or enemy features
    const targetableFeatures = this.regionsData.filter(d => {
      const id = this._cleanId(d.properties.CCA_2 || d.properties.NAME_2 || d.properties.ID_2);
      return !this.conquests[id] || this.conquests[id].playerId !== playerId;
    });

    if (targetableFeatures.length === 0) return [];

    // Sort targetable by minimum distance to ANY owned center
    const targetableWithDist = targetableFeatures.map(f => {
      const center = this.pathGenerator.centroid(f);
      if (isNaN(center[0])) return { feature: f, dist: Infinity };
      
      let minDist = Infinity;
      for (const oc of ownedCenters) {
        if (isNaN(oc[0])) continue;
        const dist = Math.sqrt(Math.pow(oc[0] - center[0], 2) + Math.pow(oc[1] - center[1], 2));
        if (dist < minDist) minDist = dist;
      }
      
      // Bonus (negative distance) if it's neutral vs enemy (prefer neutral)
      const id = this._cleanId(f.properties.CCA_2 || f.properties.NAME_2 || f.properties.ID_2);
      const isNeutral = !this.conquests[id];
      if (isNeutral) minDist -= 20; // Prefer neutral
      
      return { feature: f, dist: minDist };
    });

    targetableWithDist.sort((a, b) => a.dist - b.dist);
    
    // Return top 'count' regions
    return targetableWithDist.slice(0, count).map(t => this._cleanId(t.feature.properties.CCA_2 || t.feature.properties.NAME_2 || t.feature.properties.ID_2));
  }

  /**
   * Reset entire map
   */
  reset() {
    this.conquests = {};
    this.activeRegion = null;
    
    if (this.g) {
      this.g.selectAll('path').each(function() {
        d3.select(this)
          .attr('fill', '#1e2438')
          .attr('stroke', '#2d3555')
          .attr('stroke-width', '0.5')
          .style('animation', 'none')
          .attr('filter', null);
      });
    }
  }

  /**
   * Get conquest stats
   */
  getStats() {
    const regionCount = {};
    for (const [rid, info] of Object.entries(this.conquests)) {
      if (!regionCount[info.playerId]) {
        regionCount[info.playerId] = { count: 0, color: info.color, name: info.playerName };
      }
      regionCount[info.playerId].count++;
    }
    return regionCount;
  }

  getRegionName(rawId) {
    const regionId = this._cleanId(rawId);
    const feature = this.regionsData.find(d => this._cleanId(d.properties.CCA_2 || d.properties.NAME_2 || d.properties.ID_2) === regionId);
    return feature ? feature.properties.NAME_2 : regionId;
  }

  _lighten(hex) {
    // If it's already an rgb/rgba string, just return it or parse it
    if(hex.startsWith('rgb')) return hex;
    if(!hex.startsWith('#')) return hex;
    
    const r = parseInt(hex.slice(1,3),16) || 0;
    const g = parseInt(hex.slice(3,5),16) || 0;
    const b = parseInt(hex.slice(5,7),16) || 0;
    const factor = 1.4;
    const clamp = v => Math.min(255, Math.round(v * factor));
    return `rgb(${clamp(r)},${clamp(g)},${clamp(b)})`;
  }
}

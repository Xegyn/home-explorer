// Custom Lightweight 3D Software & WebGL2 Hybrid Renderer
// Renders Cozy Architectural Stylized 3D rooms, furniture, spinning ceiling/standing/box fans,
// pull-chains, dynamic warm lighting pools, floating airflow dust motes, and 3D picking!

export class Cozy3DRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.fov = 68 * (Math.PI / 180);

    this.camera = {
      x: 0,
      y: 1.55, // Kid eye-height in meters
      z: 0,
      yaw: 0,
      pitch: 0,
      flashlightOn: false,
    };

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.floor(this.width * dpr);
    this.canvas.height = Math.floor(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.focalLength = (this.height * 0.5) / Math.tan(this.fov * 0.5);
  }

  // Transform world point (wx, wy, wz) into camera space (cx, cy, cz)
  worldToCamera(wx, wy, wz) {
    const dx = wx - this.camera.x;
    const dy = wy - this.camera.y;
    const dz = wz - this.camera.z;

    const cosYaw = Math.cos(this.camera.yaw);
    const sinYaw = Math.sin(this.camera.yaw);

    // Rotate around Y axis (yaw): forward = (sinYaw, 0, cosYaw), right = (cosYaw, 0, -sinYaw)
    const rx = dx * cosYaw - dz * sinYaw;
    const rz = dx * sinYaw + dz * cosYaw;

    const cosPitch = Math.cos(this.camera.pitch);
    const sinPitch = Math.sin(this.camera.pitch);

    // Rotate around X axis (pitch): positive pitch looks up (+Y)
    const cy = dy * cosPitch - rz * sinPitch;
    const cz = dy * sinPitch + rz * cosPitch;

    return { x: rx, y: cy, z: cz };
  }

  // Project camera-space point to 2D screen coordinates
  projectCameraPoint(pt) {
    const scale = this.focalLength / pt.z;
    return {
      x: this.width * 0.5 + pt.x * scale,
      y: this.height * 0.5 - pt.y * scale,
      z: pt.z,
      scale,
    };
  }

  // Clip a 3D polygon in camera space against the near plane (z >= near)
  clipPolygonNear(verts, near = 0.18) {
    const out = [];
    const n = verts.length;
    for (let i = 0; i < n; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % n];
      const aInside = a.z >= near;
      const bInside = b.z >= near;

      if (aInside && bInside) {
        out.push(b);
      } else if (aInside && !bInside) {
        const t = (near - a.z) / (b.z - a.z);
        out.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: near,
        });
      } else if (!aInside && bInside) {
        const t = (near - a.z) / (b.z - a.z);
        out.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: near,
        });
        out.push(b);
      }
    }
    return out;
  }

  // Compute dynamic lighting color multiplier at a 3D surface point & normal
  computeLighting(wx, wy, wz, nx, ny, nz, lights, ambientBase = 0.34) {
    let rLight = ambientBase;
    let gLight = ambientBase * 0.98;
    let bLight = ambientBase * 1.04;

    // Slight top-down directional bounce so ceilings/floors have clear contrast
    const hemi = 0.08 * (ny * 0.5 + 0.5);
    rLight += hemi;
    gLight += hemi;
    bLight += hemi;

    // Evaluate all active lamps, ceiling fixtures, and nightlights
    for (let i = 0; i < lights.length; i++) {
      const L = lights[i];
      if (!L.isOn) continue;

      const dx = L.x - wx;
      const dy = L.y - wy;
      const dz = L.z - wz;
      const distSq = dx * dx + dy * dy + dz * dz;
      const radiusSq = L.radius * L.radius;
      if (distSq > radiusSq) continue;

      const dist = Math.sqrt(distSq) + 0.001;
      const ndotl = Math.max(0.18, (dx * nx + dy * ny + dz * nz) / dist);
      const falloff = Math.pow(1 - dist / L.radius, 1.55) * L.intensity * ndotl;

      rLight += falloff * L.colorR;
      gLight += falloff * L.colorG;
      bLight += falloff * L.colorB;
    }

    // Personal flashlight beam if toggled ON
    if (this.camera.flashlightOn) {
      const fx = wx - this.camera.x;
      const fy = wy - this.camera.y;
      const fz = wz - this.camera.z;
      const dist = Math.sqrt(fx * fx + fy * fy + fz * fz) + 0.01;
      if (dist < 11) {
        const lookX = Math.sin(this.camera.yaw) * Math.cos(this.camera.pitch);
        const lookY = Math.sin(this.camera.pitch);
        const lookZ = Math.cos(this.camera.yaw) * Math.cos(this.camera.pitch);
        const alignment = (fx * lookX + fy * lookY + fz * lookZ) / dist;
        if (alignment > 0.72) {
          const spot = Math.pow((alignment - 0.72) / 0.28, 1.5) * (1 - dist / 11) * 0.95;
          rLight += spot * 1.05;
          gLight += spot * 1.02;
          bLight += spot * 0.95;
        }
      }
    }

    return {
      r: Math.min(1.45, rLight),
      g: Math.min(1.4, gLight),
      b: Math.min(1.35, bLight),
    };
  }

  shadeHex(baseRgb, lightMul) {
    const r = Math.min(255, Math.max(0, Math.round(baseRgb[0] * lightMul.r)));
    const g = Math.min(255, Math.max(0, Math.round(baseRgb[1] * lightMul.g)));
    const b = Math.min(255, Math.max(0, Math.round(baseRgb[2] * lightMul.b)));
    return `rgb(${r},${g},${b})`;
  }

  // Main render entry point
  render(house, hoverTarget, screenClickTest = null) {
    const ctx = this.ctx;
    ctx.fillStyle = '#121624';
    ctx.fillRect(0, 0, this.width, this.height);

    const drawList = [];
    let drawOrderCounter = 0;
    const activeLights = house.getActiveLightSources();
    let currentRoomDepth = 0;

    const setCurrentRoom = (room) => {
      if (!room) {
        currentRoomDepth = 0;
        return;
      }
      const dx = room.cx - this.camera.x;
      const dz = room.cz - this.camera.z;
      currentRoomDepth = Math.hypot(dx, dz);
    };

    // Helper to enqueue a 3D world-space quad or polygon
    const pushPolygon = (worldVerts, baseRgb, normal, options = {}) => {
      // Exact perspective backface culling: vector from camera to vertex
      const v0 = worldVerts[0];
      const toCamX = this.camera.x - v0.x;
      const toCamY = this.camera.y - v0.y;
      const toCamZ = this.camera.z - v0.z;
      const dot = toCamX * normal.x + toCamY * normal.y + toCamZ * normal.z;
      if (!options.doubleSided && dot <= 0) return;

      // Convert to camera space
      const camVerts = [];
      let maxZ = -Infinity;
      let sumX = 0, sumY = 0, sumZ = 0;
      let wx = 0, wy = 0, wz = 0;

      for (let i = 0; i < worldVerts.length; i++) {
        const w = worldVerts[i];
        wx += w.x;
        wy += w.y;
        wz += w.z;
        const c = this.worldToCamera(w.x, w.y, w.z);
        if (c.z > maxZ) maxZ = c.z;
        sumX += c.x;
        sumY += c.y;
        sumZ += c.z;
        camVerts.push(c);
      }

      if (maxZ < 0.12) return;
      const n = worldVerts.length;
      const avgDistSq = (sumX / n) ** 2 + (sumY / n) ** 2 + (sumZ / n) ** 2;
      if (avgDistSq > 360) return; // Distance cull > 19m

      const clipped = this.clipPolygonNear(camVerts, 0.12);
      if (clipped.length < 3) return;

      const screenPts = clipped.map((pt) => this.projectCameraPoint(pt));

      // Compute centroid in world space for lighting (never changes when clipped!)
      const cx = wx / n;
      const cy = wy / n;
      const cz = wz / n;

      let fillStyle;
      if (options.emissive) {
        fillStyle = `rgb(${baseRgb[0]},${baseRgb[1]},${baseRgb[2]})`;
      } else {
        const lightMul = this.computeLighting(
          cx, cy, cz,
          normal.x, normal.y, normal.z,
          activeLights,
          house.ambientLevel
        );
        fillStyle = this.shadeHex(baseRgb, lightMul);
      }

      // Layer priority ensures floor/ceiling/wall base layers NEVER pop in front of rugs, trim, windows, or furniture!
      const layer = options.layer ?? 10;
      const depth = Math.sqrt(avgDistSq) + (options.depthBias || 0);

      drawList.push({
        type: 'poly',
        screenPts,
        fillStyle,
        strokeStyle: options.strokeStyle || fillStyle,
        lineWidth: options.lineWidth ?? 0.6,
        roomDepth: currentRoomDepth,
        layer,
        depth,
        order: drawOrderCounter++,
        interactiveId: options.interactiveId || null,
        highlight: options.highlight || false,
        alpha: options.alpha || 1.0,
      });
    };

    // Helper to enqueue a 3D billboard circle/glow/mote/label
    const pushSprite = (wx, wy, wz, radiusMeters, color, options = {}) => {
      const camPt = this.worldToCamera(wx, wy, wz);
      if (camPt.z < 0.15 || camPt.z > 18) return;
      const proj = this.projectCameraPoint(camPt);
      const depth = Math.sqrt(camPt.x * camPt.x + camPt.y * camPt.y + camPt.z * camPt.z) + (options.depthBias || 0);

      drawList.push({
        type: 'sprite',
        x: proj.x,
        y: proj.y,
        r: Math.max(1.5, radiusMeters * proj.scale),
        color,
        roomDepth: currentRoomDepth,
        layer: options.layer ?? 12,
        depth,
        order: drawOrderCounter++,
        glow: options.glow || false,
        alpha: options.alpha ?? 1.0,
        label: options.label || null,
        interactiveId: options.interactiveId || null,
      });
    };

    // Build all static + animated geometry from the house
    house.collectRenderPrimitives(pushPolygon, pushSprite, hoverTarget, this.camera, setCurrentRoom);

    // Transitive Strict Total Weak Ordering Comparator (using exact IEEE-754 comparisons — NO epsilon thresholds!):
    // Any `Math.abs(a - b) > eps` in a sort comparator violates transitivity (A == B and B == C, yet A != C),
    // which causes V8 TimSort to scramble the array order when dynamic elements (like spinning fan blades) move!
    drawList.sort((a, b) => {
      if (a.roomDepth !== b.roomDepth) {
        return b.roomDepth - a.roomDepth;
      }
      if (a.layer !== b.layer) {
        return a.layer - b.layer;
      }
      if (a.layer < 10) {
        return a.order - b.order;
      }
      if (a.depth !== b.depth) {
        return b.depth - a.depth;
      }
      return a.order - b.order;
    });

    let pickedInteractiveId = null;
    const testX = screenClickTest ? screenClickTest.x : this.width * 0.5;
    const testY = screenClickTest ? screenClickTest.y : this.height * 0.5;

    // Draw all primitives
    for (let i = 0; i < drawList.length; i++) {
      const item = drawList[i];
      if (item.alpha < 1) ctx.globalAlpha = item.alpha;

      if (item.type === 'poly') {
        const pts = item.screenPts;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let j = 1; j < pts.length; j++) {
          ctx.lineTo(pts[j].x, pts[j].y);
        }
        ctx.closePath();

        ctx.fillStyle = item.fillStyle;
        ctx.fill();

        if (item.highlight) {
          ctx.strokeStyle = '#ffb72b';
          ctx.lineWidth = 2.6;
          ctx.stroke();
        } else if (item.lineWidth > 0) {
          ctx.strokeStyle = item.strokeStyle;
          ctx.lineWidth = item.lineWidth;
          ctx.stroke();
        }

        // Hit testing for mouse click or center reticle raycast
        if (item.interactiveId && item.depth < 5.2) {
          if (this.pointInPolygon(testX, testY, pts)) {
            pickedInteractiveId = item.interactiveId;
          }
        }
      } else if (item.type === 'sprite') {
        if (item.glow) {
          const grad = ctx.createRadialGradient(item.x, item.y, item.r * 0.1, item.x, item.y, item.r);
          grad.addColorStop(0, item.color);
          grad.addColorStop(1, 'rgba(255, 220, 130, 0)');
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = item.color;
          ctx.beginPath();
          ctx.arc(item.x, item.y, item.r, 0, Math.PI * 2);
          ctx.fill();
        }

        if (item.label) {
          ctx.font = '800 13px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          ctx.lineWidth = 3.5;
          ctx.strokeText(item.label, item.x, item.y - item.r - 6);
          ctx.fillText(item.label, item.x, item.y - item.r - 6);
        }

        if (item.interactiveId && item.depth < 5.2) {
          const dx = testX - item.x;
          const dy = testY - item.y;
          if (dx * dx + dy * dy <= Math.max(18, item.r * 1.4) ** 2) {
            pickedInteractiveId = item.interactiveId;
          }
        }
      }

      if (item.alpha < 1) ctx.globalAlpha = 1.0;
    }

    return pickedInteractiveId;
  }

  pointInPolygon(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y;
      const xj = pts[j].x, yj = pts[j].y;
      const intersect = ((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi + 0.00001) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
}

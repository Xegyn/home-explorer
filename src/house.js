// Procedural Roguelike House Generator
// Generates a multi-room floorplan, doorways, cozy furniture, interactive Ceiling Fans,
// Pedestal Standing Fans, Box Fans, Floor Lamps, Desk Lamps, Wall Switches, Pull-Chains,
// Floating Airflow Breeze Motes, and Kid-Friendly House Helper Checklist Goals!

const HOUSE_NAMES = [
  'Sunny Breeze Cottage',
  'Windmill Way Bungalow',
  'Lantern & Blade Manor',
  'Cozy Cloud House',
  'Firefly Villa',
  'Starlight Gables',
  'Maple Leaf Townhouse',
  'Bluebird Harbor Home',
];

const ROOM_THEMES = [
  {
    type: 'foyer',
    name: 'Front Hallway',
    icon: '🚪',
    wallColor: [232, 224, 208],
    floorColor: [168, 124, 86],
    rugColor: [184, 78, 68],
    trimColor: [245, 242, 235],
  },
  {
    type: 'living',
    name: 'Living Room',
    icon: '🛋️',
    wallColor: [214, 228, 238],
    floorColor: [158, 114, 76],
    rugColor: [72, 126, 164],
    trimColor: [245, 245, 240],
  },
  {
    type: 'kitchen',
    name: 'Sunny Kitchen',
    icon: '🍳',
    wallColor: [246, 236, 198],
    floorColor: [215, 210, 198],
    rugColor: [224, 142, 68],
    trimColor: [250, 248, 242],
  },
  {
    type: 'bedroom',
    name: 'Cozy Bedroom',
    icon: '🛏️',
    wallColor: [222, 214, 238],
    floorColor: [162, 120, 84],
    rugColor: [138, 104, 184],
    trimColor: [245, 242, 248],
  },
  {
    type: 'playroom',
    name: 'Toy & Game Room',
    icon: '🧸',
    wallColor: [210, 238, 220],
    floorColor: [172, 132, 92],
    rugColor: [78, 178, 122],
    trimColor: [246, 250, 246],
  },
  {
    type: 'study',
    name: 'Reading Den',
    icon: '📚',
    wallColor: [236, 218, 206],
    floorColor: [142, 98, 66],
    rugColor: [176, 96, 82],
    trimColor: [244, 238, 232],
  },
];

export const FAN_SPEED_LABELS = ['OFF', 'LOW', 'MEDIUM', 'HIGH'];
export const FAN_SPEED_RAD_PER_SEC = [0, 3.8, 8.2, 14.8];

// Seeded PRNG so each house level has repeatable or fresh procedural variety
class SeededRNG {
  constructor(seed = Date.now()) {
    this.state = seed % 2147483647;
    if (this.state <= 0) this.state += 2147483646;
  }
  next() {
    this.state = (this.state * 16807) % 2147483647;
    return (this.state - 1) / 2147483646;
  }
  range(min, max) {
    return min + this.next() * (max - min);
  }
  int(min, max) {
    return Math.floor(this.range(min, max + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  shuffle(arr) {
    const copy = [...arr];
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }
}

export class ProceduralHouse {
  constructor(levelNumber = 1, seed = Date.now()) {
    this.levelNumber = levelNumber;
    this.rng = new SeededRNG(seed);
    this.houseName = `House #${levelNumber} — ${this.rng.pick(HOUSE_NAMES)}`;

    this.roomSize = 6.0; // Each room is 6m x 6m
    this.wallHeight = 3.0; // 3m ceiling height
    this.doorWidth = 1.6;
    this.doorHeight = 2.25;
    this.ambientLevel = 0.36;

    this.rooms = []; // Grid rooms
    this.roomMap = new Map(); // "gx,gz" -> room
    this.interactives = []; // All clickable / toggleable fans, lights, switches, exit door
    this.interactiveById = new Map();
    this.colliders = []; // 2D AABB boxes for furniture & walls
    this.breezeParticles = []; // Floating dust/wind motes propelled by active fans
    this.checklist = []; // Kid-friendly level goals
    this.exitUnlocked = false;
    this.exitDoor = null;

    this.generateFloorplan();
    this.populateRooms();
    this.generateChecklist();
  }

  gridKey(gx, gz) {
    return `${gx},${gz}`;
  }

  generateFloorplan() {
    // Number of rooms scales gently from 4 rooms on Level 1 up to 6 rooms
    const numRooms = Math.min(6, 4 + Math.floor((this.levelNumber - 1) / 2));

    // Start at (0, 0) with the Front Hallway / Foyer
    const foyerTheme = ROOM_THEMES[0];
    const otherThemes = this.rng.shuffle(ROOM_THEMES.slice(1));

    const startRoom = this.createRoom(0, 0, foyerTheme);
    this.rooms.push(startRoom);
    this.roomMap.set(this.gridKey(0, 0), startRoom);

    const dirs = [
      { dx: 0, dz: 1, side: 'north', opp: 'south' },
      { dx: 1, dz: 0, side: 'east', opp: 'west' },
      { dx: -1, dz: 0, side: 'west', opp: 'east' },
      { dx: 0, dz: -1, side: 'south', opp: 'north' },
    ];

    let themeIdx = 0;
    while (this.rooms.length < numRooms) {
      const baseRoom = this.rng.pick(this.rooms);
      const shuffledDirs = this.rng.shuffle(dirs);

      for (const d of shuffledDirs) {
        // Keep the South wall of the Foyer (0,0) free for the Front Exit Door!
        if (baseRoom.gx === 0 && baseRoom.gz === 0 && d.side === 'south') continue;

        const nx = baseRoom.gx + d.dx;
        const nz = baseRoom.gz + d.dz;
        const key = this.gridKey(nx, nz);

        if (!this.roomMap.has(key)) {
          const theme = otherThemes[themeIdx % otherThemes.length];
          themeIdx++;
          const newRoom = this.createRoom(nx, nz, theme);
          this.rooms.push(newRoom);
          this.roomMap.set(key, newRoom);
          break;
        }
      }
    }

    // Connect all adjacent rooms with open doorways
    for (const room of this.rooms) {
      for (const d of dirs) {
        const neighbor = this.roomMap.get(this.gridKey(room.gx + d.dx, room.gz + d.dz));
        if (neighbor) {
          room.doors[d.side] = true;
        }
      }
    }
  }

  createRoom(gx, gz, theme) {
    const cx = gx * this.roomSize;
    const cz = gz * this.roomSize;
    return {
      id: `room_${gx}_${gz}`,
      gx,
      gz,
      cx,
      cz,
      minX: cx - this.roomSize * 0.5,
      maxX: cx + this.roomSize * 0.5,
      minZ: cz - this.roomSize * 0.5,
      maxZ: cz + this.roomSize * 0.5,
      theme,
      name: theme.name,
      icon: theme.icon,
      doors: { north: false, south: false, east: false, west: false },
      furniture: [],
      ceilingFan: null,
      portableFan: null,
      lights: [],
    };
  }

  registerInteractive(obj) {
    this.interactives.push(obj);
    this.interactiveById.set(obj.id, obj);
    return obj;
  }

  populateRooms() {
    for (const room of this.rooms) {
      // 1. Every room gets a centerpiece Ceiling Fan with a Built-in Ceiling Light & Pull Chains!
      const initialFanSpeed = this.rng.next() < 0.45 ? this.rng.int(1, 3) : 0;
      const initialLightOn = this.rng.next() < 0.55;

      const ceilingFan = this.registerInteractive({
        id: `cfan_${room.id}`,
        kind: 'fan',
        subKind: 'ceiling_fan',
        room,
        name: `${room.name} Ceiling Fan`,
        icon: '🌀',
        x: room.cx,
        y: this.wallHeight - 0.35,
        z: room.cz,
        interactY: 1.75, // Pull chain height
        speed: initialFanSpeed, // 0=OFF, 1=LOW, 2=MED, 3=HIGH
        bladeAngle: this.rng.range(0, Math.PI * 2),
        currentAngularVel: FAN_SPEED_RAD_PER_SEC[initialFanSpeed],
        chainSwing: 0,
      });
      room.ceilingFan = ceilingFan;

      // Ceiling Fan Light Kit (can be toggled via its pull chain or the room's wall switch!)
      const ceilingLight = this.registerInteractive({
        id: `clight_${room.id}`,
        kind: 'light',
        subKind: 'ceiling_light',
        room,
        name: `${room.name} Ceiling Light`,
        icon: '💡',
        x: room.cx,
        y: this.wallHeight - 0.48,
        z: room.cz,
        interactY: 1.75,
        isOn: initialLightOn,
        radius: 6.4,
        intensity: 0.78,
        colorR: 1.05,
        colorG: 0.96,
        colorB: 0.82,
      });
      room.lights.push(ceilingLight);

      // 2. Wall Switch Panel next to one of the room's doorways
      this.placeWallSwitchesForRoom(room, ceilingLight, ceilingFan);

      // 3. Room-Specific Furniture + Standing Pedestal Fans / Box Fans + Floor & Desk Lamps!
      this.placeRoomFurnitureAndFixtures(room);

      // 4. Spawn floating airflow breeze motes inside each room
      for (let i = 0; i < 14; i++) {
        this.breezeParticles.push({
          room,
          x: this.rng.range(room.minX + 0.6, room.maxX - 0.6),
          y: this.rng.range(0.35, this.wallHeight - 0.4),
          z: this.rng.range(room.minZ + 0.6, room.maxZ - 0.6),
          phase: this.rng.range(0, Math.PI * 2),
          size: this.rng.range(0.024, 0.045),
        });
      }
    }

    // 5. Place the Front Exit Door on the South wall of the Foyer (0, 0)
    const foyer = this.roomMap.get('0,0');
    this.exitDoor = this.registerInteractive({
      id: 'exit_door',
      kind: 'exit',
      subKind: 'front_door',
      room: foyer,
      name: 'Front Exit Door (Next House)',
      icon: '🚪',
      x: foyer.cx,
      y: 1.15,
      z: foyer.minZ + 0.08,
      interactY: 1.2,
    });
  }

  placeWallSwitchesForRoom(room, ceilingLight, ceilingFan) {
    // Pick a wall with a door (or North wall) and place a dual switch plate beside the doorframe
    let swX = room.cx + 1.15;
    let swZ = room.maxZ - 0.06;
    let normal = { x: 0, y: 0, z: -1 };

    if (room.doors.north) {
      swX = room.cx + 1.15;
      swZ = room.maxZ - 0.05;
      normal = { x: 0, y: 0, z: -1 };
    } else if (room.doors.south) {
      swX = room.cx - 1.15;
      swZ = room.minZ + 0.05;
      normal = { x: 0, y: 0, z: 1 };
    } else if (room.doors.east) {
      swX = room.maxX - 0.05;
      swZ = room.cz - 1.15;
      normal = { x: -1, y: 0, z: 0 };
    } else if (room.doors.west) {
      swX = room.minX + 0.05;
      swZ = room.cz + 1.15;
      normal = { x: 1, y: 0, z: 0 };
    }

    // Wall Light Switch (linked to the room's ceiling light)
    this.registerInteractive({
      id: `switch_light_${room.id}`,
      kind: 'switch_light',
      room,
      targetLight: ceilingLight,
      name: `${room.name} Light Switch`,
      icon: '🎚️',
      x: swX,
      y: 1.25,
      z: swZ,
      interactY: 1.25,
      normal,
    });

    // Wall Fan Dial Switch right beside the light switch (linked to the room's ceiling fan)
    const offsetX = normal.z !== 0 ? 0.24 : 0;
    const offsetZ = normal.x !== 0 ? 0.24 : 0;
    this.registerInteractive({
      id: `switch_fan_${room.id}`,
      kind: 'switch_fan',
      room,
      targetFan: ceilingFan,
      name: `${room.name} Fan Wall Dial`,
      icon: '🎛️',
      x: swX + offsetX,
      y: 1.25,
      z: swZ + offsetZ,
      interactY: 1.25,
      normal,
    });
  }

  placeRoomFurnitureAndFixtures(room) {
    // Pick safe corners of the room (away from center and doorways)
    const corners = [
      { x: room.minX + 0.9, z: room.maxZ - 0.9, dirYaw: -Math.PI * 0.25 },
      { x: room.maxX - 0.9, z: room.maxZ - 0.9, dirYaw: -Math.PI * 0.75 },
      { x: room.minX + 0.9, z: room.minZ + 0.9, dirYaw: Math.PI * 0.25 },
      { x: room.maxX - 0.9, z: room.minZ + 0.9, dirYaw: Math.PI * 0.75 },
    ];
    const shuffledCorners = this.rng.shuffle(corners);

    // Corner 1: Standing Oscillating Pedestal Fan OR Retro Box Fan
    const fanCorner = shuffledCorners[0];
    const isPedestal = this.rng.next() < 0.55;
    const initSpeed = this.rng.next() < 0.4 ? this.rng.int(1, 3) : 0;

    const portableFan = this.registerInteractive({
      id: `pfan_${room.id}`,
      kind: 'fan',
      subKind: isPedestal ? 'standing_fan' : 'box_fan',
      room,
      name: isPedestal ? `${room.name} Standing Fan` : `${room.name} Box Fan`,
      icon: isPedestal ? '🌬️' : '🧊',
      x: fanCorner.x,
      y: isPedestal ? 1.15 : 0.42,
      z: fanCorner.z,
      interactY: isPedestal ? 1.15 : 0.55,
      baseYaw: fanCorner.dirYaw,
      oscillatePhase: this.rng.range(0, Math.PI * 2),
      speed: initSpeed,
      bladeAngle: 0,
      currentAngularVel: FAN_SPEED_RAD_PER_SEC[initSpeed],
    });
    room.portableFan = portableFan;
    this.addCollider(fanCorner.x, fanCorner.z, 0.35, 0.35);

    // Corner 2: Cozy Floor Lamp or Table Lamp
    const lampCorner = shuffledCorners[1];
    const lampOn = this.rng.next() < 0.5;
    const floorLamp = this.registerInteractive({
      id: `flamp_${room.id}`,
      kind: 'light',
      subKind: 'floor_lamp',
      room,
      name: `${room.name} Cozy Floor Lamp`,
      icon: '🛋️',
      x: lampCorner.x,
      y: 1.38,
      z: lampCorner.z,
      interactY: 1.3,
      isOn: lampOn,
      radius: 4.8,
      intensity: 0.65,
      colorR: 1.1,
      colorG: 0.88,
      colorB: 0.62,
    });
    room.lights.push(floorLamp);
    this.addCollider(lampCorner.x, lampCorner.z, 0.32, 0.32);

    // Corners 3 & 4: Rich Room-Specific Furniture + Plants + Wall Decor + Table/Nightstand Lamps!
    const furnCornerA = shuffledCorners[2];
    const furnCornerB = shuffledCorners[3];
    this.addFurnitureForTheme(room, furnCornerA, furnCornerB);
    this.addWallDecorForRoom(room);
  }

  addBox(room, x, y, z, w, h, d, color, options = {}) {
    room.furniture.push({
      kind: 'box',
      x, y, z, w, h, d, color,
      emissive: options.emissive || false,
      layer: options.layer ?? 10,
    });
  }

  addPottedPlant(room, x, z) {
    // Terracotta pot
    this.addBox(room, x, 0.16, z, 0.34, 0.32, 0.34, [188, 98, 66]);
    this.addBox(room, x, 0.33, z, 0.38, 0.06, 0.38, [202, 110, 74]);
    // Lush layered green leaves
    this.addBox(room, x, 0.52, z, 0.46, 0.32, 0.46, [68, 152, 88]);
    this.addBox(room, x + 0.04, 0.76, z - 0.03, 0.32, 0.28, 0.32, [86, 176, 102]);
    this.addBox(room, x - 0.03, 0.96, z + 0.03, 0.18, 0.2, 0.18, [106, 196, 118]);
    this.addCollider(x, z, 0.25, 0.25);
  }

  addDeskLamp(room, x, baseTopY, z, labelName) {
    const isOn = this.rng.next() < 0.55;
    const lamp = this.registerInteractive({
      id: `dlamp_${room.id}_${Math.round(x * 10)}_${Math.round(z * 10)}`,
      kind: 'light',
      subKind: 'desk_lamp',
      room,
      name: `${room.name} ${labelName}`,
      icon: '🏮',
      x,
      y: baseTopY + 0.34,
      z,
      baseTopY,
      interactY: baseTopY + 0.25,
      isOn,
      radius: 4.2,
      intensity: 0.58,
      colorR: 1.12,
      colorG: 0.9,
      colorB: 0.68,
    });
    room.lights.push(lamp);
  }

  addWallDecorForRoom(room) {
    // Place windows on exterior walls (walls without a connecting door, excluding the Foyer south exit wall)
    const wallSpecs = [
      { side: 'north', hasDoor: room.doors.north, isExit: false },
      { side: 'south', hasDoor: room.doors.south, isExit: room.gx === 0 && room.gz === 0 },
      { side: 'east', hasDoor: room.doors.east, isExit: false },
      { side: 'west', hasDoor: room.doors.west, isExit: false },
    ];

    let windowAdded = false;
    for (const w of wallSpecs) {
      if (w.hasDoor || w.isExit) continue;

      if (!windowAdded) {
        // Cozy Exterior Window with Sky Glass, Cross Mullions, Sill & Curtains!
        this.addWindowOnWall(room, w.side);
        windowAdded = true;
      } else {
        // Framed Wall Artwork Painting on the other solid wall!
        this.addPaintingOnWall(room, w.side);
      }
    }
  }

  addWindowOnWall(room, side) {
    const frameColor = [248, 246, 240];
    const glassColor = [155, 218, 252];
    const sillColor = [235, 228, 216];
    const curtainColor = room.theme.rugColor;
    const wy = 1.55;

    if (side === 'north' || side === 'south') {
      const wz = side === 'north' ? room.maxZ - 0.04 : room.minZ + 0.04;
      const sign = side === 'north' ? -1 : 1;
      const wx = room.cx;
      // Outer window frame & sky glass (layers 5, 6, 7 so they never Z-fight!)
      this.addBox(room, wx, wy, wz, 1.56, 1.24, 0.06, frameColor, { layer: 5 });
      this.addBox(room, wx, wy, wz + sign * 0.03, 1.38, 1.06, 0.04, glassColor, { emissive: true, layer: 6 });
      // Crossbars (mullions)
      this.addBox(room, wx, wy, wz + sign * 0.05, 1.4, 0.06, 0.03, frameColor, { layer: 7 });
      this.addBox(room, wx, wy, wz + sign * 0.05, 0.06, 1.08, 0.03, frameColor, { layer: 7 });
      // Window Sill
      this.addBox(room, wx, wy - 0.64, wz + sign * 0.06, 1.72, 0.07, 0.14, sillColor, { layer: 7 });
      // Left & Right Cozy Curtains
      this.addBox(room, wx - 0.84, wy - 0.05, wz + sign * 0.06, 0.24, 1.42, 0.1, curtainColor, { layer: 7 });
      this.addBox(room, wx + 0.84, wy - 0.05, wz + sign * 0.06, 0.24, 1.42, 0.1, curtainColor, { layer: 7 });
    } else {
      const wx = side === 'east' ? room.maxX - 0.04 : room.minX + 0.04;
      const wz = room.cz;
      const sign = side === 'east' ? -1 : 1;
      this.addBox(room, wx, wy, wz, 0.06, 1.24, 1.56, frameColor, { layer: 5 });
      this.addBox(room, wx + sign * 0.03, wy, wz, 0.04, 1.06, 1.38, glassColor, { emissive: true, layer: 6 });
      this.addBox(room, wx + sign * 0.05, wy, wz, 0.03, 0.06, 1.4, frameColor, { layer: 7 });
      this.addBox(room, wx + sign * 0.05, wy, wz, 0.03, 1.08, 0.06, frameColor, { layer: 7 });
      this.addBox(room, wx + sign * 0.06, wy - 0.64, wz, 0.14, 0.07, 1.72, sillColor, { layer: 7 });
      this.addBox(room, wx + sign * 0.06, wy - 0.05, wz - 0.84, 0.1, 1.42, 0.24, curtainColor, { layer: 7 });
      this.addBox(room, wx + sign * 0.06, wy - 0.05, wz + 0.84, 0.1, 1.42, 0.24, curtainColor, { layer: 7 });
    }
  }

  addPaintingOnWall(room, side) {
    const frameColor = [112, 78, 52];
    const canvasColors = [
      [234, 168, 92],
      [98, 174, 198],
      [198, 112, 126],
      [124, 184, 132],
    ];
    const artColor = this.rng.pick(canvasColors);
    const py = 1.62;

    if (side === 'north' || side === 'south') {
      const pz = side === 'north' ? room.maxZ - 0.04 : room.minZ + 0.04;
      const sign = side === 'north' ? -1 : 1;
      this.addBox(room, room.cx, py, pz, 1.12, 0.78, 0.05, frameColor, { layer: 5 });
      this.addBox(room, room.cx, py, pz + sign * 0.03, 0.96, 0.62, 0.04, artColor, { layer: 6 });
    } else {
      const px = side === 'east' ? room.maxX - 0.04 : room.minX + 0.04;
      const sign = side === 'east' ? -1 : 1;
      this.addBox(room, px, py, room.cz, 0.05, 0.78, 1.12, frameColor, { layer: 5 });
      this.addBox(room, px + sign * 0.03, py, room.cz, 0.04, 0.62, 0.96, artColor, { layer: 6 });
    }
  }

  addFurnitureForTheme(room, cornerA, cornerB) {
    const t = room.theme.type;
    const zBackA = cornerA.z > room.cz ? 0.25 : -0.25;
    const zBackB = cornerB.z > room.cz ? 0.25 : -0.25;

    if (t === 'living') {
      // Corner A: Plush Sofa with Backrest, Armrests & Throw Pillows (non-overlapping boxes so no Z-fighting!)
      this.addBox(room, cornerA.x, 0.24, cornerA.z, 1.16, 0.48, 0.76, [78, 118, 168]);
      this.addBox(room, cornerA.x, 0.69, cornerA.z + zBackA, 1.56, 0.42, 0.24, [64, 102, 150]);
      // Armrests sitting cleanly to the left and right of the seat cushion
      this.addBox(room, cornerA.x - 0.68, 0.34, cornerA.z, 0.2, 0.68, 0.78, [64, 102, 150]);
      this.addBox(room, cornerA.x + 0.68, 0.34, cornerA.z, 0.2, 0.68, 0.78, [64, 102, 150]);
      // Colorful Throw Cushions sitting cleanly on top of the seat
      this.addBox(room, cornerA.x - 0.36, 0.59, cornerA.z - zBackA * 0.25, 0.3, 0.22, 0.22, [242, 178, 72]);
      this.addBox(room, cornerA.x + 0.36, 0.59, cornerA.z - zBackA * 0.25, 0.3, 0.22, 0.22, [232, 108, 92]);
      this.addCollider(cornerA.x, cornerA.z, 0.8, 0.44);

      // Corner B: TV Media Console + Widescreen TV
      this.addBox(room, cornerB.x, 0.28, cornerB.z, 1.35, 0.56, 0.55, [128, 86, 56]);
      // Widescreen TV Bezel & Screen (screen placed cleanly in front of bezel toward room center)
      const tvFrontSign = cornerB.z > room.cz ? -1 : 1;
      this.addBox(room, cornerB.x, 0.92, cornerB.z, 1.08, 0.62, 0.07, [34, 38, 48]);
      this.addBox(room, cornerB.x, 0.92, cornerB.z + tvFrontSign * 0.05, 0.96, 0.5, 0.03, [74, 138, 184]);
      this.addCollider(cornerB.x, cornerB.z, 0.7, 0.35);
    } else if (t === 'bedroom') {
      // Corner A: Cozy Bed with Wooden Headboard, Mattress, Blanket & Pillows (non-overlapping!)
      // Upper mattress section (under pillows)
      this.addBox(room, cornerA.x, 0.26, cornerA.z + zBackA * 1.4, 1.38, 0.52, 0.76, [242, 238, 246]);
      // Lower blanket section
      this.addBox(room, cornerA.x, 0.27, cornerA.z - zBackA * 0.65, 1.4, 0.54, 1.04, [148, 106, 186]);
      // Wooden Headboard behind mattress
      this.addBox(room, cornerA.x, 0.64, cornerA.z + zBackA * 3.1, 1.42, 0.78, 0.14, [118, 78, 52]);
      // Twin Pillows sitting cleanly on top of upper mattress
      this.addBox(room, cornerA.x - 0.34, 0.59, cornerA.z + zBackA * 1.6, 0.48, 0.14, 0.34, [252, 250, 255]);
      this.addBox(room, cornerA.x + 0.34, 0.59, cornerA.z + zBackA * 1.6, 0.48, 0.14, 0.34, [252, 250, 255]);
      this.addCollider(cornerA.x, cornerA.z, 0.72, 0.85);

      // Corner B: Nightstand + Interactive Bedside Table Lamp!
      const nsFrontSign = cornerB.z > room.cz ? -1 : 1;
      this.addBox(room, cornerB.x, 0.34, cornerB.z, 0.68, 0.68, 0.6, [132, 92, 62]);
      this.addBox(room, cornerB.x, 0.44, cornerB.z + nsFrontSign * 0.32, 0.52, 0.22, 0.04, [158, 114, 78]);
      this.addDeskLamp(room, cornerB.x, 0.68, cornerB.z, 'Bedside Table Lamp');
      this.addCollider(cornerB.x, cornerB.z, 0.4, 0.38);
    } else if (t === 'kitchen') {
      // Corner A: Kitchen Counter with Sink Basin, Stove Burners & Countertop
      this.addBox(room, cornerA.x, 0.44, cornerA.z, 1.48, 0.88, 0.76, [224, 148, 82]);
      this.addBox(room, cornerA.x, 0.92, cornerA.z, 1.56, 0.08, 0.82, [246, 244, 238]);
      // Sink Basin & Faucet sitting cleanly above countertop (y=0.96+)
      this.addBox(room, cornerA.x - 0.36, 0.985, cornerA.z, 0.48, 0.05, 0.44, [175, 192, 206]);
      this.addBox(room, cornerA.x - 0.36, 1.12, cornerA.z + zBackA * 0.6, 0.06, 0.22, 0.06, [155, 168, 182]);
      // Stove Cooktop sitting cleanly above countertop
      this.addBox(room, cornerA.x + 0.38, 0.98, cornerA.z, 0.52, 0.04, 0.48, [48, 52, 62]);
      this.addCollider(cornerA.x, cornerA.z, 0.78, 0.44);

      // Corner B: Tall Retro Refrigerator!
      const frFrontSign = cornerB.z > room.cz ? -1 : 1;
      this.addBox(room, cornerB.x, 0.88, cornerB.z, 0.82, 1.76, 0.74, [238, 244, 248]);
      // Freezer door divider & handles placed cleanly on the front door face
      this.addBox(room, cornerB.x, 1.24, cornerB.z + frFrontSign * 0.39, 0.82, 0.04, 0.04, [170, 182, 194]);
      this.addBox(room, cornerB.x - 0.28, 1.48, cornerB.z + frFrontSign * 0.4, 0.05, 0.28, 0.06, [185, 196, 208]);
      this.addBox(room, cornerB.x - 0.28, 0.82, cornerB.z + frFrontSign * 0.4, 0.05, 0.44, 0.06, [185, 196, 208]);
      this.addCollider(cornerB.x, cornerB.z, 0.45, 0.45);
    } else if (t === 'study' || t === 'playroom') {
      // Corner A: Tall Bookshelf with Colorful Book Rows placed cleanly on the front face
      const bsFrontSign = cornerA.z > room.cz ? -1 : 1;
      this.addBox(room, cornerA.x, 0.84, cornerA.z, 1.24, 1.68, 0.46, [146, 98, 62]);
      // Colorful Book Stacks protruding cleanly on the front shelf side
      this.addBox(room, cornerA.x - 0.25, 0.55, cornerA.z + bsFrontSign * 0.25, 0.46, 0.28, 0.06, [226, 92, 82]);
      this.addBox(room, cornerA.x + 0.22, 1.02, cornerA.z + bsFrontSign * 0.25, 0.5, 0.28, 0.06, [78, 168, 214]);
      this.addBox(room, cornerA.x - 0.18, 1.44, cornerA.z + bsFrontSign * 0.25, 0.54, 0.26, 0.06, [92, 188, 122]);
      this.addCollider(cornerA.x, cornerA.z, 0.65, 0.32);

      // Corner B: Reading Desk / Activity Table + Interactive Desk Lamp!
      this.addBox(room, cornerB.x, 0.38, cornerB.z, 1.15, 0.76, 0.68, [178, 126, 78]);
      this.addDeskLamp(room, cornerB.x, 0.76, cornerB.z, 'Desk Lamp');
      this.addCollider(cornerB.x, cornerB.z, 0.6, 0.38);
    } else {
      // Foyer / Hallway: Entryway Console Table + Table Lamp + Potted Houseplant
      this.addBox(room, cornerA.x, 0.4, cornerA.z, 1.18, 0.8, 0.54, [164, 112, 72]);
      this.addDeskLamp(room, cornerA.x, 0.8, cornerA.z, 'Entry Table Lamp');
      this.addCollider(cornerA.x, cornerA.z, 0.62, 0.32);

      this.addPottedPlant(room, cornerB.x, cornerB.z);
    }
  }

  addCollider(x, z, halfW, halfD) {
    this.colliders.push({
      minX: x - halfW,
      maxX: x + halfW,
      minZ: z - halfD,
      maxZ: z + halfD,
    });
  }

  // Generate 3 simple, clear, kid-friendly checklist tasks for this house!
  generateChecklist() {
    const tasks = [];
    const nonFoyerRooms = this.rooms.filter((r) => r.theme.type !== 'foyer');
    const targetRooms = this.rng.shuffle(nonFoyerRooms.length ? nonFoyerRooms : this.rooms);

    // Goal 1: A specific room's Ceiling Fan or Standing Fan speed task
    const r1 = targetRooms[0];
    const wantHigh = this.rng.next() < 0.6;
    if (wantHigh) {
      // Ensure it doesn't already start at HIGH so the player gets to do it
      if (r1.ceilingFan.speed === 3) r1.ceilingFan.speed = 1;
      tasks.push({
        id: 'goal_room_fan_high',
        title: `Set the ${r1.name} Ceiling Fan to HIGH`,
        check: () => {
          const isDone = r1.ceilingFan.speed === 3;
          return {
            done: isDone,
            progress: FAN_SPEED_LABELS[r1.ceilingFan.speed],
          };
        },
        completed: false,
      });
    } else {
      if (r1.portableFan.speed === 0) r1.portableFan.speed = 0;
      tasks.push({
        id: 'goal_portable_fan_on',
        title: `Turn ON the ${r1.portableFan.name}`,
        check: () => {
          const isDone = r1.portableFan.speed > 0;
          return {
            done: isDone,
            progress: FAN_SPEED_LABELS[r1.portableFan.speed],
          };
        },
        completed: false,
      });
    }

    // Goal 2: Global Ceiling Fan or All Fans task
    const allCeilingFans = this.rooms.map((r) => r.ceilingFan);
    const turnAllFansOn = this.rng.next() < 0.7;
    if (turnAllFansOn) {
      // Make sure at least 2 ceiling fans start OFF
      allCeilingFans.slice(0, 2).forEach((f) => {
        if (f.speed === r1.ceilingFan.speed) return;
        f.speed = 0;
        f.currentAngularVel = 0;
      });
      tasks.push({
        id: 'goal_all_cfans_on',
        title: `Make all ${allCeilingFans.length} Ceiling Fans spin!`,
        check: () => {
          const spinning = allCeilingFans.filter((f) => f.speed > 0).length;
          return {
            done: spinning === allCeilingFans.length,
            progress: `${spinning} / ${allCeilingFans.length}`,
          };
        },
        completed: false,
      });
    } else {
      const r2 = targetRooms[1] || r1;
      if (r2.portableFan.speed === 0) r2.portableFan.speed = 2;
      tasks.push({
        id: 'goal_turn_off_pfan',
        title: `Turn OFF the ${r2.portableFan.name}`,
        check: () => {
          const isDone = r2.portableFan.speed === 0;
          return {
            done: isDone,
            progress: FAN_SPEED_LABELS[r2.portableFan.speed],
          };
        },
        completed: false,
      });
    }

    // Goal 3: Lights task (e.g., Turn ON all lights in a room, or Turn ON at least N lights in the house)
    const rLight = targetRooms[1] || targetRooms[0];
    const lightTaskType = this.rng.next() < 0.55 ? 'room_lights_on' : 'house_lights_on';

    if (lightTaskType === 'room_lights_on') {
      rLight.lights.forEach((l) => { l.isOn = false; });
      const countWord = rLight.lights.length === 2 ? 'both' : `all ${rLight.lights.length}`;
      tasks.push({
        id: 'goal_room_lights',
        title: `Turn ON ${countWord} lights in the ${rLight.name}`,
        check: () => {
          const onCount = rLight.lights.filter((l) => l.isOn).length;
          return {
            done: onCount === rLight.lights.length,
            progress: `${onCount} / ${rLight.lights.length}`,
          };
        },
        completed: false,
      });
    } else {
      const allLights = this.interactives.filter((i) => i.kind === 'light');
      const targetCount = Math.min(allLights.length, Math.max(4, Math.ceil(allLights.length * 0.75)));
      // Turn off several lights initially
      allLights.slice(0, Math.ceil(allLights.length * 0.6)).forEach((l) => { l.isOn = false; });
      tasks.push({
        id: 'goal_house_lights',
        title: `Turn ON at least ${targetCount} lights in the house`,
        check: () => {
          const onCount = allLights.filter((l) => l.isOn).length;
          return {
            done: onCount >= targetCount,
            progress: `${onCount} / ${targetCount}`,
          };
        },
        completed: false,
      });
    }

    this.checklist = tasks;
  }

  getActiveLightSources() {
    return this.interactives.filter((item) => item.kind === 'light' && item.isOn);
  }

  getCounts() {
    const lights = this.interactives.filter((i) => i.kind === 'light');
    const fans = this.interactives.filter((i) => i.kind === 'fan');
    return {
      lightsOn: lights.filter((l) => l.isOn).length,
      lightsTotal: lights.length,
      fansOn: fans.filter((f) => f.speed > 0).length,
      fansTotal: fans.length,
    };
  }

  getRoomAt(x, z) {
    const gx = Math.round(x / this.roomSize);
    const gz = Math.round(z / this.roomSize);
    return this.roomMap.get(this.gridKey(gx, gz)) || this.rooms[0];
  }

  // Update fan blade momentum, oscillation, pull-chain bounce, and floating breeze particles
  update(dt) {
    for (const item of this.interactives) {
      if (item.kind === 'fan') {
        const targetVel = FAN_SPEED_RAD_PER_SEC[item.speed];
        // Smooth physical spin-up and spin-down inertia!
        item.currentAngularVel += (targetVel - item.currentAngularVel) * Math.min(1, dt * 3.2);
        item.bladeAngle = (item.bladeAngle + item.currentAngularVel * dt) % (Math.PI * 2);

        if (item.chainSwing > 0) {
          item.chainSwing = Math.max(0, item.chainSwing - dt * 2.5);
        }

        if (item.subKind === 'standing_fan' && item.speed > 0) {
          item.oscillatePhase += dt * (0.7 + item.speed * 0.25);
        }
      }
    }

    // Animate breeze motes in each room based on how fast that room's fans are spinning!
    for (const p of this.breezeParticles) {
      const room = p.room;
      const cSpeed = room.ceilingFan ? room.ceilingFan.currentAngularVel : 0;
      const pSpeed = room.portableFan ? room.portableFan.currentAngularVel : 0;
      const totalWind = cSpeed + pSpeed;

      p.phase += dt * (1.2 + totalWind * 0.35);

      if (totalWind > 0.3) {
        // Swirl around the room in a gentle breeze vortex
        const dx = p.x - room.cx;
        const dz = p.z - room.cz;
        const swirlSpeed = totalWind * 0.085 * dt;
        const cosS = Math.cos(swirlSpeed);
        const sinS = Math.sin(swirlSpeed);

        p.x = room.cx + (dx * cosS - dz * sinS);
        p.z = room.cz + (dx * sinS + dz * cosS);
        p.y += Math.sin(p.phase) * dt * (0.15 + totalWind * 0.03);
      } else {
        // Lazy floating dust mote when fans are off
        p.y += Math.sin(p.phase) * dt * 0.04;
      }

      // Keep inside room bounds
      p.x = Math.max(room.minX + 0.4, Math.min(room.maxX - 0.4, p.x));
      p.z = Math.max(room.minZ + 0.4, Math.min(room.maxZ - 0.4, p.z));
      if (p.y > this.wallHeight - 0.4) p.y = 0.4;
      if (p.y < 0.35) p.y = this.wallHeight - 0.45;
    }
  }

  // Test player movement against walls, doorways, and furniture colliders
  canMoveTo(nx, nz, radius = 0.38) {
    const gx = Math.round(nx / this.roomSize);
    const gz = Math.round(nz / this.roomSize);
    const room = this.roomMap.get(this.gridKey(gx, gz));
    if (!room) return false;

    const halfDoor = this.doorWidth * 0.5 - radius * 0.55;

    // Check North wall (+Z)
    if (nz + radius > room.maxZ) {
      if (!room.doors.north || Math.abs(nx - room.cx) > halfDoor) return false;
    }
    // Check South wall (-Z)
    if (nz - radius < room.minZ) {
      if (!room.doors.south || Math.abs(nx - room.cx) > halfDoor) return false;
    }
    // Check East wall (+X)
    if (nx + radius > room.maxX) {
      if (!room.doors.east || Math.abs(nz - room.cz) > halfDoor) return false;
    }
    // Check West wall (-X)
    if (nx - radius < room.minX) {
      if (!room.doors.west || Math.abs(nz - room.cz) > halfDoor) return false;
    }

    // Check furniture AABBs
    for (const c of this.colliders) {
      if (
        nx + radius > c.minX &&
        nx - radius < c.maxX &&
        nz + radius > c.minZ &&
        nz - radius < c.maxZ
      ) {
        return false;
      }
    }

    return true;
  }

  // Find the best interactive target in front of the player (or hovered by mouse)
  findNearestInteractive(cam, hoveredId = null) {
    if (hoveredId && this.interactiveById.has(hoveredId)) {
      const item = this.interactiveById.get(hoveredId);
      const dist = Math.hypot(item.x - cam.x, item.z - cam.z);
      if (dist <= 4.8) return item;
    }

    const lookX = Math.sin(cam.yaw) * Math.cos(cam.pitch);
    const lookY = Math.sin(cam.pitch);
    const lookZ = Math.cos(cam.yaw) * Math.cos(cam.pitch);

    let bestItem = null;
    let bestScore = Infinity;

    for (const item of this.interactives) {
      const dx = item.x - cam.x;
      const dy = (item.interactY ?? item.y) - cam.y;
      const dz = item.z - cam.z;
      const dist = Math.hypot(dx, dy, dz);

      if (dist > 3.6) continue;

      const dot = (dx * lookX + dy * lookY + dz * lookZ) / (dist + 0.001);
      if (dot < 0.45) continue; // Must be roughly in front of the player's view

      const score = dist * (1.35 - dot);
      if (score < bestScore) {
        bestScore = score;
        bestItem = item;
      }
    }

    return bestItem;
  }

  // Emit all 3D polygons & sprites for the Cozy3DRenderer
  collectRenderPrimitives(pushPoly, pushSprite, hoverTarget, camera, setCurrentRoom = () => {}) {
    const hoverId = hoverTarget ? hoverTarget.id : null;

    for (const room of this.rooms) {
      // Quick distance check from camera to room center
      const distRoom = Math.hypot(room.cx - camera.x, room.cz - camera.z);
      if (distRoom > 16.5) continue;

      setCurrentRoom(room);
      this.emitRoomGeometry(room, pushPoly);

      // Room furniture boxes
      for (const f of room.furniture) {
        this.emitBox(
          pushPoly,
          f.x, f.y, f.z,
          f.w, f.h, f.d,
          f.color,
          { emissive: f.emissive, layer: f.layer ?? 10 }
        );
      }
    }

    // Emit interactive fixtures (Ceiling Fans, Portable Fans, Lamps, Switches, Exit Door)
    for (const item of this.interactives) {
      const dist = Math.hypot(item.x - camera.x, item.z - camera.z);
      if (dist > 15.5) continue;
      const isHovered = item.id === hoverId;
      setCurrentRoom(item.room);

      if (item.subKind === 'ceiling_fan') {
        this.emitCeilingFan(pushPoly, pushSprite, item, isHovered);
      } else if (item.subKind === 'ceiling_light') {
        this.emitCeilingLight(pushPoly, pushSprite, item, isHovered);
      } else if (item.subKind === 'standing_fan') {
        this.emitStandingFan(pushPoly, pushSprite, item, isHovered);
      } else if (item.subKind === 'box_fan') {
        this.emitBoxFan(pushPoly, pushSprite, item, isHovered);
      } else if (item.subKind === 'floor_lamp') {
        this.emitFloorLamp(pushPoly, pushSprite, item, isHovered);
      } else if (item.subKind === 'desk_lamp') {
        this.emitDeskLamp(pushPoly, pushSprite, item, isHovered);
      } else if (item.kind === 'switch_light' || item.kind === 'switch_fan') {
        this.emitWallSwitch(pushPoly, pushSprite, item, isHovered);
      } else if (item.kind === 'exit') {
        this.emitExitDoor(pushPoly, pushSprite, item, isHovered);
      }
    }

    // Emit swirling airflow breeze particles
    for (const p of this.breezeParticles) {
      const dist = Math.hypot(p.x - camera.x, p.z - camera.z);
      if (dist > 11) continue;
      setCurrentRoom(p.room);
      const cVel = p.room.ceilingFan ? p.room.ceilingFan.currentAngularVel : 0;
      const pVel = p.room.portableFan ? p.room.portableFan.currentAngularVel : 0;
      const activeWind = cVel + pVel > 0.5;

      pushSprite(
        p.x, p.y, p.z,
        activeWind ? p.size * 1.25 : p.size * 0.8,
        activeWind ? 'rgba(130, 235, 255, 0.72)' : 'rgba(255, 245, 210, 0.35)',
        { alpha: activeWind ? 0.75 : 0.35 }
      );
    }
  }

  // Deterministic hash in [-1, 1] for wood planks, grain lines, and tile tones
  hash2D(a, b) {
    const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  }

  tintColor(rgb, delta) {
    return [
      Math.max(0, Math.min(255, Math.round(rgb[0] + delta))),
      Math.max(0, Math.min(255, Math.round(rgb[1] + delta))),
      Math.max(0, Math.min(255, Math.round(rgb[2] + delta))),
    ];
  }

  // High-Resolution Woven Rectangular Area Rug: Concentric Woven Borders + Fine Warp/Weft Pile Stripes + Fringe Tassels!
  emitHighResRug(room, pushPoly) {
    const { cx, cz, theme } = room;
    const rugW = 1.68; // Half-width (X)
    const rugD = 1.42; // Half-depth (Z) — classic rectangular room rug proportions!

    const cream = theme.trimColor;
    const primary = theme.rugColor;
    const darkBorder = this.tintColor(primary, -32);
    const warmInner = this.tintColor(primary, 18);
    const goldAccent = [234, 188, 92];

    // 1. Woven Fringe Tassels along the left (-X) and right (+X) short ends of the rectangular rug
    const numTassels = 26;
    const tasselStep = (rugD * 2) / numTassels;
    const fringeLen = 0.11;
    for (let t = 0; t < numTassels; t++) {
      if (t % 2 !== 0) continue;
      const tz0 = cz - rugD + t * tasselStep;
      const tz1 = tz0 + tasselStep * 0.68;

      // West (-X) fringe tufts
      pushPoly(
        [
          { x: cx - rugW - fringeLen, y: 0.012, z: tz0 },
          { x: cx - rugW - fringeLen, y: 0.012, z: tz1 },
          { x: cx - rugW, y: 0.012, z: tz1 },
          { x: cx - rugW, y: 0.012, z: tz0 },
        ],
        cream,
        { x: 0, y: 1, z: 0 },
        { layer: 2, lineWidth: 0 }
      );
      // East (+X) fringe tufts
      pushPoly(
        [
          { x: cx + rugW, y: 0.012, z: tz0 },
          { x: cx + rugW, y: 0.012, z: tz1 },
          { x: cx + rugW + fringeLen, y: 0.012, z: tz1 },
          { x: cx + rugW + fringeLen, y: 0.012, z: tz0 },
        ],
        cream,
        { x: 0, y: 1, z: 0 },
        { layer: 2, lineWidth: 0 }
      );
    }

    // 2. Outer Cream Binding Edge & Dark Woven Frame (clean, sharp rectangular silhouette!)
    const drawRugRect = (hw, hd, color, strokeStyle = null, lineWidth = 0) => {
      pushPoly(
        [
          { x: cx - hw, y: 0.015, z: cz - hd },
          { x: cx - hw, y: 0.015, z: cz + hd },
          { x: cx + hw, y: 0.015, z: cz + hd },
          { x: cx + hw, y: 0.015, z: cz - hd },
        ],
        color,
        { x: 0, y: 1, z: 0 },
        { layer: 2, strokeStyle, lineWidth }
      );
    };

    // Outer cream binding
    drawRugRect(rugW, rugD, cream, 'rgba(60, 44, 30, 0.45)', 1.2);
    // Dark woven outer guard border
    drawRugRect(rugW - 0.08, rugD - 0.08, darkBorder, 'rgba(255, 255, 255, 0.22)', 0.8);
    // Gold accent pinstripe frame
    drawRugRect(rugW - 0.22, rugD - 0.22, goldAccent);

    // 3. High-Resolution Woven Fabric Field: 20 fine woven warp/weft bands across the inner rectangle
    const fieldW = rugW - 0.27;
    const fieldD = rugD - 0.27;
    const numWeftStrips = 20;
    const stripW = (fieldW * 2) / numWeftStrips;

    for (let i = 0; i < numWeftStrips; i++) {
      const sx0 = cx - fieldW + i * stripW;
      const sx1 = sx0 + stripW;
      // Subtle alternating woven yarn rib tone (no blocky pixels!)
      const ribTone = (i % 2 === 0) ? 4 : -5;
      const stripColor = this.tintColor(primary, ribTone);

      pushPoly(
        [
          { x: sx0, y: 0.017, z: cz - fieldD },
          { x: sx0, y: 0.017, z: cz + fieldD },
          { x: sx1, y: 0.017, z: cz + fieldD },
          { x: sx1, y: 0.017, z: cz - fieldD },
        ],
        stripColor,
        { x: 0, y: 1, z: 0 },
        {
          layer: 2,
          strokeStyle: 'rgba(255, 255, 255, 0.07)',
          lineWidth: 0.5,
        }
      );
    }

    // 4. Crisp Nested Rectangular Inner Medallion Frame & Diamond Centerpiece
    drawRugRect(0.76, 0.56, cream, 'rgba(60, 44, 30, 0.25)', 0.8);
    drawRugRect(0.68, 0.48, warmInner);
    drawRugRect(0.42, 0.28, darkBorder, 'rgba(234, 188, 92, 0.6)', 0.9);

    // Smooth geometric diamond lozenge at the center of the rug
    pushPoly(
      [
        { x: cx, y: 0.019, z: cz - 0.2 },
        { x: cx - 0.28, y: 0.019, z: cz },
        { x: cx, y: 0.019, z: cz + 0.2 },
        { x: cx + 0.28, y: 0.019, z: cz },
      ],
      goldAccent,
      { x: 0, y: 1, z: 0 },
      { layer: 2, strokeStyle: 'rgba(255, 250, 235, 0.65)', lineWidth: 1.0 }
    );
  }

  emitRoomGeometry(room, pushPoly) {
    const { minX, maxX, minZ, maxZ, cx, cz, theme } = room;
    const H = this.wallHeight;

    // 1. High-Resolution Textured Floor: Mosaic Ceramic Tile (Kitchen) or Fine-Strip Hardwood Planks with Multi-Ribbon Wood Grain!
    if (theme.type === 'kitchen') {
      const tileSteps = 14; // High-res 0.42m ceramic tiles
      const step = this.roomSize / tileSteps;
      const groutColor = 'rgba(124, 118, 108, 0.48)';
      for (let ix = 0; ix < tileSteps; ix++) {
        for (let iz = 0; iz < tileSteps; iz++) {
          const x0 = minX + ix * step;
          const x1 = x0 + step;
          const z0 = minZ + iz * step;
          const z1 = z0 + step;
          const isAlt = (ix + iz) % 2 === 0;
          const jitter = this.hash2D(ix * 11, iz * 19) * 5;
          const tileColor = isAlt
            ? this.tintColor(theme.floorColor, 10 + jitter)
            : this.tintColor(theme.floorColor, -18 + jitter);

          pushPoly(
            [
              { x: x0, y: 0, z: z0 },
              { x: x0, y: 0, z: z1 },
              { x: x1, y: 0, z: z1 },
              { x: x1, y: 0, z: z0 },
            ],
            tileColor,
            { x: 0, y: 1, z: 0 },
            { layer: 0, strokeStyle: groutColor, lineWidth: 0.85 }
          );
        }
      }
    } else {
      // High-Resolution Narrow Hardwood Floorboards (24 strips = 0.25m planks) with Wavy Multi-Fiber Wood Grain & Knots!
      const numStrips = 24;
      const stripW = this.roomSize / numStrips;
      const plankSeamColor = 'rgba(54, 32, 16, 0.5)';

      for (let s = 0; s < numStrips; s++) {
        const x0 = minX + s * stripW;
        const x1 = x0 + stripW;

        // 4 staggered plank joint patterns across neighboring strips
        const staggerType = s % 4;
        let joints;
        if (staggerType === 0) {
          joints = [minZ, minZ + 1.5, minZ + 3.1, minZ + 4.6, maxZ];
        } else if (staggerType === 1) {
          joints = [minZ, minZ + 0.9, minZ + 2.4, minZ + 3.9, minZ + 5.2, maxZ];
        } else if (staggerType === 2) {
          joints = [minZ, minZ + 1.8, minZ + 3.5, minZ + 4.9, maxZ];
        } else {
          joints = [minZ, minZ + 1.2, minZ + 2.7, minZ + 4.2, maxZ];
        }

        for (let p = 0; p < joints.length - 1; p++) {
          const z0 = joints[p];
          const z1 = joints[p + 1];
          const hVal = this.hash2D(room.gx * 31 + s * 7, room.gz * 29 + p * 13);
          const variation = hVal * 21;
          const plankColor = this.tintColor(theme.floorColor, variation);

          // Base plank board (Layer 0)
          pushPoly(
            [
              { x: x0, y: 0, z: z0 },
              { x: x0, y: 0, z: z1 },
              { x: x1, y: 0, z: z1 },
              { x: x1, y: 0, z: z0 },
            ],
            plankColor,
            { x: 0, y: 1, z: 0 },
            { layer: 0, strokeStyle: plankSeamColor, lineWidth: 0.75 }
          );

          // High-res wood grain fibers (Layer 1 — always drawn cleanly on top of Layer 0 planks!)
          const plankLen = z1 - z0;
          const darkFiberColor = this.tintColor(plankColor, -14);
          const warmFiberColor = this.tintColor(plankColor, 11);

          // Ribbon 1: Dark heartwood grain vein
          const r1x0 = x0 + stripW * (0.16 + (hVal + 1) * 0.12);
          const r1x1 = r1x0 + stripW * 0.24;
          const r1z0 = z0 + plankLen * 0.08;
          const r1z1 = z1 - plankLen * 0.1;
          pushPoly(
            [
              { x: r1x0, y: 0.002, z: r1z0 },
              { x: r1x0 + stripW * 0.05, y: 0.002, z: r1z1 },
              { x: r1x1 + stripW * 0.05, y: 0.002, z: r1z1 },
              { x: r1x1, y: 0.002, z: r1z0 },
            ],
            darkFiberColor,
            { x: 0, y: 1, z: 0 },
            { layer: 1, lineWidth: 0 }
          );

          // Ribbon 2: Lighter sapwood shimmer streak
          const r2x0 = x0 + stripW * 0.56;
          const r2x1 = x0 + stripW * 0.78;
          const r2z0 = z0 + plankLen * 0.18;
          const r2z1 = z1 - plankLen * 0.16;
          pushPoly(
            [
              { x: r2x0, y: 0.003, z: r2z0 },
              { x: r2x0 - stripW * 0.04, y: 0.003, z: r2z1 },
              { x: r2x1 - stripW * 0.04, y: 0.003, z: r2z1 },
              { x: r2x1, y: 0.003, z: r2z0 },
            ],
            warmFiberColor,
            { x: 0, y: 1, z: 0 },
            { layer: 1, lineWidth: 0 }
          );

          // Occasional darker wood knot oval on select planks
          if (hVal > 0.35) {
            const kx = (x0 + x1) * 0.5;
            const kz = (z0 + z1) * 0.5 + hVal * 0.2;
            const kw = stripW * 0.16;
            const kd = 0.065;
            pushPoly(
              [
                { x: kx - kw, y: 0.004, z: kz - kd },
                { x: kx - kw, y: 0.004, z: kz + kd },
                { x: kx + kw, y: 0.004, z: kz + kd },
                { x: kx + kw, y: 0.004, z: kz - kd },
              ],
              this.tintColor(plankColor, -26),
              { x: 0, y: 1, z: 0 },
              { layer: 1, lineWidth: 0 }
            );
          }
        }
      }
    }

    // High-Resolution Woven Patterned Area Rug (Layer 2)
    this.emitHighResRug(room, pushPoly);

    // 2. Coffered Ceiling Panels with Recessed Acoustic/Plaster Tiles & Exposed Wooden Ceiling Beams!
    const ceilColor = [242, 239, 232];
    const ceilSteps = 4; // 4x4 coffered ceiling grid (1.5m panels)
    const cStep = this.roomSize / ceilSteps;
    for (let ix = 0; ix < ceilSteps; ix++) {
      for (let iz = 0; iz < ceilSteps; iz++) {
        const x0 = minX + ix * cStep;
        const x1 = x0 + cStep;
        const z0 = minZ + iz * cStep;
        const z1 = z0 + cStep;
        const tone = ((ix + iz) % 2 === 0) ? 3 : -3;

        pushPoly(
          [
            { x: x0, y: H, z: z0 },
            { x: x1, y: H, z: z0 },
            { x: x1, y: H, z: z1 },
            { x: x0, y: H, z: z1 },
          ],
          this.tintColor(ceilColor, tone),
          { x: 0, y: -1, z: 0 },
          { layer: 0, strokeStyle: 'rgba(185, 178, 165, 0.55)', lineWidth: 1.1 }
        );
      }
    }

    // Exposed Wooden Ceiling Rafter Beams running across the ceiling (Layer 2)
    const beamColor = [132, 94, 64];
    for (const bz of [minZ + 1.5, maxZ - 1.5]) {
      this.emitBox(pushPoly, cx, H - 0.06, bz, this.roomSize - 0.08, 0.12, 0.16, beamColor, { layer: 2 });
    }

    // 3. Textured Walls with Wainscoting Lower Wood Panels, Chair Rail Molding, Striped Wallpaper & Crown Molding!
    const hd = this.doorWidth * 0.5;
    const dh = this.doorHeight;

    // NORTH WALL (+Z, normal 0, 0, -1)
    this.emitWallSide(
      pushPoly,
      room.doors.north,
      theme.wallColor,
      { x: 0, y: 0, z: -1 },
      (u0, u1, v0, v1) => [
        { x: u0, y: v0, z: maxZ },
        { x: u0, y: v1, z: maxZ },
        { x: u1, y: v1, z: maxZ },
        { x: u1, y: v0, z: maxZ },
      ],
      minX, maxX, cx, hd, dh, H
    );

    // SOUTH WALL (-Z, normal 0, 0, 1)
    this.emitWallSide(
      pushPoly,
      room.doors.south,
      theme.wallColor,
      { x: 0, y: 0, z: 1 },
      (u0, u1, v0, v1) => [
        { x: u1, y: v0, z: minZ },
        { x: u1, y: v1, z: minZ },
        { x: u0, y: v1, z: minZ },
        { x: u0, y: v0, z: minZ },
      ],
      minX, maxX, cx, hd, dh, H
    );

    // EAST WALL (+X, normal -1, 0, 0)
    this.emitWallSide(
      pushPoly,
      room.doors.east,
      theme.wallColor,
      { x: -1, y: 0, z: 0 },
      (u0, u1, v0, v1) => [
        { x: maxX, y: v0, z: u1 },
        { x: maxX, y: v1, z: u1 },
        { x: maxX, y: v1, z: u0 },
        { x: maxX, y: v0, z: u0 },
      ],
      minZ, maxZ, cz, hd, dh, H
    );

    // WEST WALL (-X, normal 1, 0, 0)
    this.emitWallSide(
      pushPoly,
      room.doors.west,
      theme.wallColor,
      { x: 1, y: 0, z: 0 },
      (u0, u1, v0, v1) => [
        { x: minX, y: v0, z: u0 },
        { x: minX, y: v1, z: u0 },
        { x: minX, y: v1, z: u1 },
        { x: minX, y: v0, z: u1 },
      ],
      minZ, maxZ, cz, hd, dh, H
    );
  }

  // Emit a textured wall span [uStart, uEnd] with Baseboard, Wainscoting Beadboard, Chair Rail, Wallpaper Stripes, and Crown Molding
  emitTexturedWallSpan(pushPoly, uStart, uEnd, wallColor, normal, makeQuad, wallH) {
    const trimColor = [248, 245, 238];
    const wainscotColor = this.tintColor(wallColor, -18);
    const chairRailColor = [240, 236, 228];

    const baseH = 0.14;
    const wainscotH = 0.92;
    const chairRailH = 0.99;
    const crownH = wallH - 0.12;

    const spanLen = uEnd - uStart;
    // Subdivide horizontally into ~0.55m vertical wallpaper / beadboard strips!
    const numStrips = Math.max(2, Math.round(spanLen / 0.55));
    const du = spanLen / numStrips;

    for (let i = 0; i < numStrips; i++) {
      const u0 = uStart + i * du;
      const u1 = u0 + du;
      const isEven = i % 2 === 0;

      // 1. Lower Wainscoting Beadboard Panel (alternating subtle vertical wood ribs)
      const wTone = isEven ? this.tintColor(wainscotColor, 5) : this.tintColor(wainscotColor, -5);
      pushPoly(makeQuad(u0, u1, baseH, wainscotH), wTone, normal, {
        layer: 3,
        strokeStyle: 'rgba(120, 112, 100, 0.35)',
        lineWidth: 0.8,
      });

      // 2. Upper Wallpaper Strip (alternating subtle warm woven stripes)
      const upperTone = isEven ? this.tintColor(wallColor, 6) : this.tintColor(wallColor, -6);
      pushPoly(makeQuad(u0, u1, chairRailH, crownH), upperTone, normal, {
        layer: 3,
        strokeStyle: 'rgba(160, 152, 140, 0.22)',
        lineWidth: 0.6,
      });
    }

    // 3. Baseboard along the floor
    pushPoly(makeQuad(uStart, uEnd, 0, baseH), trimColor, normal, { layer: 4 });
    // 4. Horizontal Chair Rail Molding separating wainscoting and wallpaper
    pushPoly(makeQuad(uStart, uEnd, wainscotH, chairRailH), chairRailColor, normal, { layer: 4 });
    // 5. Top Crown Molding along the ceiling
    pushPoly(makeQuad(uStart, uEnd, crownH, wallH), trimColor, normal, { layer: 4 });
  }

  emitWallSide(pushPoly, hasDoor, wallColor, normal, makeQuad, uMin, uMax, uCenter, halfDoor, doorH, wallH) {
    const trimColor = [248, 246, 240];
    const crownH = wallH - 0.12;

    if (!hasDoor) {
      this.emitTexturedWallSpan(pushPoly, uMin, uMax, wallColor, normal, makeQuad, wallH);
    } else {
      const dLeft = uCenter - halfDoor;
      const dRight = uCenter + halfDoor;

      // Left and Right textured wall spans
      this.emitTexturedWallSpan(pushPoly, uMin, dLeft, wallColor, normal, makeQuad, wallH);
      this.emitTexturedWallSpan(pushPoly, dRight, uMax, wallColor, normal, makeQuad, wallH);

      // Top doorway header wallpaper strips + crown molding
      const headerStrips = 3;
      const hdu = (dRight - dLeft) / headerStrips;
      for (let i = 0; i < headerStrips; i++) {
        const hu0 = dLeft + i * hdu;
        const hu1 = hu0 + hdu;
        const hTone = (i % 2 === 0) ? this.tintColor(wallColor, 6) : this.tintColor(wallColor, -6);
        pushPoly(makeQuad(hu0, hu1, doorH, crownH), hTone, normal, { layer: 3 });
      }
      pushPoly(makeQuad(dLeft, dRight, crownH, wallH), trimColor, normal, { layer: 4 });

      // Crisp Doorway Frame Trim (Left casing, Right casing, Top header trim)
      pushPoly(makeQuad(dLeft - 0.09, dLeft, 0, doorH + 0.08), trimColor, normal, { layer: 4 });
      pushPoly(makeQuad(dRight, dRight + 0.09, 0, doorH + 0.08), trimColor, normal, { layer: 4 });
      pushPoly(makeQuad(dLeft - 0.09, dRight + 0.09, doorH, doorH + 0.09), trimColor, normal, { layer: 4 });
    }
  }

  // Emit an axis-aligned 3D box
  emitBox(pushPoly, cx, cy, cz, w, h, d, color, options = {}) {
    const hw = w * 0.5;
    const hh = h * 0.5;
    const hd = d * 0.5;
    const x0 = cx - hw, x1 = cx + hw;
    const y0 = cy - hh, y1 = cy + hh;
    const z0 = cz - hd, z1 = cz + hd;

    // Top (+Y)
    pushPoly(
      [{ x: x0, y: y1, z: z0 }, { x: x0, y: y1, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x1, y: y1, z: z0 }],
      color, { x: 0, y: 1, z: 0 }, options
    );
    // North (+Z)
    pushPoly(
      [{ x: x0, y: y0, z: z1 }, { x: x1, y: y0, z: z1 }, { x: x1, y: y1, z: z1 }, { x: x0, y: y1, z: z1 }],
      color, { x: 0, y: 0, z: 1 }, options
    );
    // South (-Z)
    pushPoly(
      [{ x: x1, y: y0, z: z0 }, { x: x0, y: y0, z: z0 }, { x: x0, y: y1, z: z0 }, { x: x1, y: y1, z: z0 }],
      color, { x: 0, y: 0, z: -1 }, options
    );
    // East (+X)
    pushPoly(
      [{ x: x1, y: y0, z: z1 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y1, z: z0 }, { x: x1, y: y1, z: z1 }],
      color, { x: 1, y: 0, z: 0 }, options
    );
    // West (-X)
    pushPoly(
      [{ x: x0, y: y0, z: z0 }, { x: x0, y: y0, z: z1 }, { x: x0, y: y1, z: z1 }, { x: x0, y: y1, z: z0 }],
      color, { x: -1, y: 0, z: 0 }, options
    );
  }

  emitCeilingFan(pushPoly, pushSprite, fan, isHovered) {
    const { x, y, z, bladeAngle, speed } = fan;
    const boxOpts = { interactiveId: fan.id, highlight: isHovered };
    const bladeOpts = { interactiveId: fan.id, highlight: isHovered, doubleSided: true };

    // Downrod & Motor Housing (single-sided 3D boxes with non-overlapping Y ranges!)
    this.emitBox(pushPoly, x, this.wallHeight - 0.14, z, 0.1, 0.28, 0.1, [85, 72, 62], boxOpts);
    this.emitBox(pushPoly, x, y, z, 0.36, 0.14, 0.36, [112, 84, 62], boxOpts);

    // 4 Rotating Wooden Fan Blades with Dual-Tone Wood Grain Inlay!
    const numBlades = 4;
    const bladeLen = 1.08;
    const bladeInner = 0.22;
    const bladeHalfW = 0.11;
    const bladeColor = speed > 0 ? [194, 142, 92] : [168, 118, 74];
    const grainColor = this.tintColor(bladeColor, -22);

    for (let i = 0; i < numBlades; i++) {
      const a = bladeAngle + (i * Math.PI * 2) / numBlades;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      const perpX = -sinA * bladeHalfW;
      const perpZ = cosA * bladeHalfW;

      const xIn = x + cosA * bladeInner;
      const zIn = z + sinA * bladeInner;
      const xOut = x + cosA * bladeLen;
      const zOut = z + sinA * bladeLen;

      pushPoly(
        [
          { x: xIn - perpX, y, z: zIn - perpZ },
          { x: xOut - perpX * 1.25, y, z: zOut - perpZ * 1.25 },
          { x: xOut + perpX * 1.25, y, z: zOut + perpZ * 1.25 },
          { x: xIn + perpX, y, z: zIn + perpZ },
        ],
        bladeColor,
        { x: 0, y: -1, z: 0 },
        { ...bladeOpts, layer: 10 }
      );

      // Inner wood-grain inlay stripe along the center of each fan blade (layer 11 so it always draws cleanly on top of the blade!)
      const gInX = x + cosA * (bladeInner + 0.08);
      const gInZ = z + sinA * (bladeInner + 0.08);
      const gOutX = x + cosA * (bladeLen - 0.1);
      const gOutZ = z + sinA * (bladeLen - 0.1);
      pushPoly(
        [
          { x: gInX - perpX * 0.38, y: y - 0.004, z: gInZ - perpZ * 0.38 },
          { x: gOutX - perpX * 0.45, y: y - 0.004, z: gOutZ - perpZ * 0.45 },
          { x: gOutX + perpX * 0.45, y: y - 0.004, z: gOutZ + perpZ * 0.45 },
          { x: gInX + perpX * 0.38, y: y - 0.004, z: gInZ + perpZ * 0.38 },
        ],
        grainColor,
        { x: 0, y: -1, z: 0 },
        { ...bladeOpts, layer: 11 }
      );
    }

    // Dangling Fan Pull-Chain with beaded handle (easy for kids to click!)
    const swingOffset = Math.sin(fan.chainSwing * 14) * 0.06 * fan.chainSwing;
    const chainX = x + 0.14 + swingOffset;
    const chainZ = z + 0.14;
    for (let b = 0; b < 5; b++) {
      pushSprite(chainX, y - 0.22 - b * 0.12, chainZ, 0.022, '#e2c478', {
        interactiveId: fan.id,
      });
    }
    // Pull fob at bottom of chain
    pushSprite(
      chainX,
      y - 0.85,
      chainZ,
      0.065,
      speed > 0 ? '#38d9ff' : '#ffb72b',
      {
        interactiveId: fan.id,
        label: isHovered ? `🌀 ${FAN_SPEED_LABELS[speed]}` : null,
      }
    );
  }

  emitCeilingLight(pushPoly, pushSprite, light, isHovered) {
    const { x, y, z, isOn } = light;
    const bulbColor = isOn ? [255, 242, 185] : [175, 175, 182];

    // Light Globe below the ceiling fan hub
    this.emitBox(pushPoly, x, y, z, 0.24, 0.14, 0.24, bulbColor, {
      interactiveId: light.id,
      highlight: isHovered,
      emissive: isOn,
    });

    if (isOn) {
      pushSprite(x, y - 0.04, z, 0.55, 'rgba(255, 224, 130, 0.55)', {
        glow: true,
        interactiveId: light.id,
      });
    }

    // Second Pull-Chain for the Ceiling Light Kit
    const chainX = x - 0.14;
    const chainZ = z - 0.14;
    pushSprite(
      chainX,
      y - 0.65,
      chainZ,
      0.058,
      isOn ? '#ffe066' : '#9aa4b8',
      {
        interactiveId: light.id,
        label: isHovered ? (isOn ? '💡 ON' : '💡 OFF') : null,
      }
    );
  }

  emitStandingFan(pushPoly, pushSprite, fan, isHovered) {
    const { x, z, speed, bladeAngle } = fan;
    // Box faces must stay single-sided so back faces don't fight with front faces!
    const boxOpts = { interactiveId: fan.id, highlight: isHovered };
    const bladeOpts = { interactiveId: fan.id, highlight: isHovered, doubleSided: true };

    // Base & vertical pole (separated cleanly without overlapping Y ranges)
    this.emitBox(pushPoly, x, 0.06, z, 0.46, 0.12, 0.46, [68, 78, 96], boxOpts);
    this.emitBox(pushPoly, x, 0.58, z, 0.1, 0.92, 0.1, [195, 205, 220], boxOpts);

    // Oscillating Head
    const headYaw = fan.baseYaw + Math.sin(fan.oscillatePhase) * 0.55;
    const dirX = Math.cos(headYaw);
    const dirZ = Math.sin(headYaw);
    const perpX = -dirZ;
    const perpZ = dirX;
    const hy = 1.17;

    // Fan Motor Hub (sitting cleanly above the pole top at y = 1.04..1.30)
    this.emitBox(pushPoly, x, hy, z, 0.24, 0.24, 0.24, [82, 132, 188], boxOpts);

    // 3 Spinning Cyan/White Fan Blades in front of the hub (pushed out to 0.24m so they never intersect the motor box!)
    const bx = x + dirX * 0.24;
    const bz = z + dirZ * 0.24;
    const numBlades = 3;
    const bladeLen = 0.34;
    const bladeW = 0.08;

    for (let i = 0; i < numBlades; i++) {
      const a = bladeAngle + (i * Math.PI * 2) / numBlades;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);

      // Start blade slightly outside hub center (rInner = 0.05m) so the 3 blades don't overlap each other at the center!
      const rInner = 0.05;
      const rootX = bx + perpX * cosA * rInner;
      const rootY = hy + sinA * rInner;
      const rootZ = bz + perpZ * cosA * rInner;

      const tipX = bx + perpX * cosA * bladeLen;
      const tipY = hy + sinA * bladeLen;
      const tipZ = bz + perpZ * cosA * bladeLen;

      const wX = perpX * (-sinA) * bladeW;
      const wY = cosA * bladeW;
      const wZ = perpZ * (-sinA) * bladeW;

      pushPoly(
        [
          { x: rootX - wX * 0.45, y: rootY - wY * 0.45, z: rootZ - wZ * 0.45 },
          { x: tipX - wX, y: tipY - wY, z: tipZ - wZ },
          { x: tipX + wX, y: tipY + wY, z: tipZ + wZ },
          { x: rootX + wX * 0.45, y: rootY + wY * 0.45, z: rootZ + wZ * 0.45 },
        ],
        speed > 0 ? [90, 225, 255] : [220, 230, 242],
        { x: dirX, y: 0, z: dirZ },
        { ...bladeOpts, emissive: speed > 0, layer: 11 }
      );
    }

    pushSprite(x, hy + 0.38, z, 0.07, speed > 0 ? '#38d9ff' : '#8892a8', {
      interactiveId: fan.id,
      label: (isHovered || speed > 0) ? `🌬️ ${FAN_SPEED_LABELS[speed]}` : null,
    });
  }

  emitBoxFan(pushPoly, pushSprite, fan, isHovered) {
    const { x, z, speed, bladeAngle } = fan;
    const boxOpts = { interactiveId: fan.id, highlight: isHovered };
    const bladeOpts = { interactiveId: fan.id, highlight: isHovered, doubleSided: true };
    const hy = 0.42;

    // Chunky Retro Box Fan Frame
    this.emitBox(pushPoly, x, hy, z, 0.58, 0.64, 0.22, [235, 110, 85], boxOpts);

    // Spinning Blades on front face (non-overlapping at center!)
    const frontSign = z > fan.room.cz ? -1 : 1;
    const faceZ = z + frontSign * 0.14;
    const numBlades = 4;
    const rInner = 0.045;
    const bladeLen = 0.24;
    for (let i = 0; i < numBlades; i++) {
      const a = bladeAngle + (i * Math.PI * 2) / numBlades;
      const cosA = Math.cos(a);
      const sinA = Math.sin(a);
      const rx = x + cosA * rInner;
      const ry = hy + sinA * rInner;
      const tx = x + cosA * bladeLen;
      const ty = hy + sinA * bladeLen;
      const px = -sinA * 0.055;
      const py = cosA * 0.055;

      pushPoly(
        [
          { x: rx - px * 0.5, y: ry - py * 0.5, z: faceZ },
          { x: tx - px, y: ty - py, z: faceZ },
          { x: tx + px, y: ty + py, z: faceZ },
          { x: rx + px * 0.5, y: ry + py * 0.5, z: faceZ },
        ],
        speed > 0 ? [90, 225, 255] : [235, 238, 245],
        { x: 0, y: 0, z: frontSign },
        { ...bladeOpts, emissive: speed > 0, layer: 11 }
      );
    }

    pushSprite(x, hy + 0.46, z, 0.065, speed > 0 ? '#38d9ff' : '#ffb72b', {
      interactiveId: fan.id,
      label: (isHovered || speed > 0) ? `🧊 ${FAN_SPEED_LABELS[speed]}` : null,
    });
  }

  emitFloorLamp(pushPoly, pushSprite, lamp, isHovered) {
    const { x, z, isOn } = lamp;
    const opts = { interactiveId: lamp.id, highlight: isHovered };

    // Base & Brass Pole
    this.emitBox(pushPoly, x, 0.04, z, 0.38, 0.08, 0.38, [96, 76, 56], opts);
    this.emitBox(pushPoly, x, 0.72, z, 0.07, 1.32, 0.07, [204, 164, 88], opts);

    // Warm Lampshade
    const shadeColor = isOn ? [255, 226, 138] : [215, 206, 188];
    this.emitBox(pushPoly, x, 1.44, z, 0.44, 0.38, 0.44, shadeColor, {
      ...opts,
      emissive: isOn,
    });

    if (isOn) {
      pushSprite(x, 1.44, z, 0.65, 'rgba(255, 205, 100, 0.5)', {
        glow: true,
        interactiveId: lamp.id,
      });
    }
  }

  emitDeskLamp(pushPoly, pushSprite, lamp, isHovered) {
    const { x, z, baseTopY, isOn } = lamp;
    const opts = { interactiveId: lamp.id, highlight: isHovered };

    // Ceramic Lamp Base & Stem sitting on top of the nightstand/desk
    this.emitBox(pushPoly, x, baseTopY + 0.06, z, 0.22, 0.12, 0.22, [82, 138, 172], opts);
    this.emitBox(pushPoly, x, baseTopY + 0.2, z, 0.06, 0.18, 0.06, [212, 174, 96], opts);

    // Cozy Glowing Shade
    const shadeColor = isOn ? [255, 232, 152] : [224, 214, 196];
    this.emitBox(pushPoly, x, baseTopY + 0.36, z, 0.34, 0.24, 0.34, shadeColor, {
      ...opts,
      emissive: isOn,
    });

    if (isOn) {
      pushSprite(x, baseTopY + 0.36, z, 0.48, 'rgba(255, 212, 115, 0.52)', {
        glow: true,
        interactiveId: lamp.id,
      });
    }
  }

  emitWallSwitch(pushPoly, pushSprite, sw, isHovered) {
    const isLight = sw.kind === 'switch_light';
    const isActive = isLight ? sw.targetLight.isOn : sw.targetFan.speed > 0;
    const plateColor = isHovered ? [255, 232, 160] : [242, 240, 235];
    const toggleColor = isActive
      ? (isLight ? [255, 195, 45] : [56, 217, 255])
      : [120, 128, 145];

    this.emitBox(pushPoly, sw.x, sw.y, sw.z, 0.14, 0.22, 0.14, plateColor, {
      interactiveId: sw.id,
      highlight: isHovered,
    });

    this.emitBox(
      pushPoly,
      sw.x + sw.normal.x * 0.03,
      sw.y + (isActive ? 0.03 : -0.03),
      sw.z + sw.normal.z * 0.03,
      0.07,
      0.08,
      0.07,
      toggleColor,
      {
        interactiveId: sw.id,
        emissive: isActive,
      }
    );
  }

  emitExitDoor(pushPoly, pushSprite, door, isHovered) {
    const unlocked = this.exitUnlocked;
    const doorColor = unlocked ? [56, 208, 122] : [138, 92, 62];
    const frameColor = unlocked ? [140, 255, 190] : [235, 228, 215];

    // Door Frame
    this.emitBox(pushPoly, door.x, 1.15, door.z, 1.38, 2.3, 0.12, frameColor, {
      interactiveId: door.id,
      highlight: isHovered,
    });

    // Door Panel
    this.emitBox(pushPoly, door.x, 1.12, door.z + 0.03, 1.18, 2.18, 0.12, doorColor, {
      interactiveId: door.id,
      highlight: isHovered,
      emissive: unlocked,
    });

    // Golden Doorknob
    pushSprite(
      door.x + 0.42,
      1.05,
      door.z + 0.12,
      0.075,
      unlocked ? '#ffffff' : '#ffcf48',
      {
        interactiveId: door.id,
        label: unlocked ? '🎉 EXIT OPEN! Click or Walk Here!' : '🔒 Finish Checklist to Unlock',
      }
    );
  }
}

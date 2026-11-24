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
    name: 'Home Office',
    icon: '📚',
    wallColor: [236, 218, 206],
    floorColor: [142, 98, 66],
    rugColor: [176, 96, 82],
    trimColor: [244, 238, 232],
  },
  {
    type: 'sunroom',
    name: 'Garden Sunroom',
    icon: '🌿',
    wallColor: [216, 240, 224],
    floorColor: [176, 138, 98],
    rugColor: [92, 168, 118],
    trimColor: [248, 250, 244],
  },
  {
    type: 'loft',
    name: 'Starlight Loft',
    icon: '✨',
    wallColor: [212, 222, 242],
    floorColor: [154, 112, 82],
    rugColor: [106, 118, 192],
    trimColor: [246, 246, 252],
  },
  {
    type: 'music',
    name: 'Music & Craft Studio',
    icon: '🎨',
    wallColor: [244, 226, 210],
    floorColor: [164, 118, 78],
    rugColor: [212, 116, 88],
    trimColor: [250, 245, 240],
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

    this.roomSize = 7.2; // Spacious 7.2m x 7.2m rooms so staircases & furniture have plenty of room!
    this.wallHeight = 3.0; // 3m ceiling height per story
    this.doorWidth = 1.68;
    this.doorHeight = 2.28;
    this.ambientLevel = 0.36;

    // Occasionally generate a 2-Story House! (Every even level or ~45% chance)
    this.hasSecondFloor = (levelNumber % 2 === 0) || (this.rng.next() < 0.45);
    const storyTag = this.hasSecondFloor ? ' (2-Story!)' : '';
    this.houseName = `House #${levelNumber} — ${this.rng.pick(HOUSE_NAMES)}${storyTag}`;

    this.rooms = []; // All rooms across 1st and 2nd floors
    this.roomMap = new Map(); // "floor,gx,gz" -> room
    this.interactives = []; // All clickable / toggleable fans, lights, switches, stairs, exit door
    this.interactiveById = new Map();
    this.colliders = []; // 2D AABB boxes per floor for furniture & walls
    this.breezeParticles = []; // Floating dust/wind motes propelled by active fans
    this.checklist = []; // Kid-friendly level goals
    this.exitUnlocked = false;
    this.exitDoor = null;
    this.stairwell = null; // Continuous walkable 3D staircase ramp between 1st and 2nd floor!

    this.generateFloorplan();
    this.populateRooms();
    this.generateChecklist();
  }

  gridKey(gx, gz, floor = 0) {
    return `${floor},${gx},${gz}`;
  }

  generateFloorplan() {
    // Ground floor (floor 0) ALWAYS has 6 rooms!
    const groundFloorRoomsCount = 6;

    // Start at (0, 0) on Floor 0 with the Front Hallway / Foyer
    const foyerTheme = ROOM_THEMES[0];
    const otherThemes = this.rng.shuffle(ROOM_THEMES.slice(1));

    const startRoom = this.createRoom(0, 0, foyerTheme, 0);
    this.rooms.push(startRoom);
    this.roomMap.set(this.gridKey(0, 0, 0), startRoom);

    const dirs = [
      { dx: 0, dz: 1, side: 'north', opp: 'south' },
      { dx: 1, dz: 0, side: 'east', opp: 'west' },
      { dx: -1, dz: 0, side: 'west', opp: 'east' },
      { dx: 0, dz: -1, side: 'south', opp: 'north' },
    ];

    let themeIdx = 0;
    const floor0Rooms = [startRoom];
    while (floor0Rooms.length < groundFloorRoomsCount) {
      const baseRoom = this.rng.pick(floor0Rooms);
      const shuffledDirs = this.rng.shuffle(dirs);

      for (const d of shuffledDirs) {
        // Keep the South wall of the Foyer (0,0) free for the Front Exit Door!
        if (baseRoom.gx === 0 && baseRoom.gz === 0 && d.side === 'south') continue;

        const nx = baseRoom.gx + d.dx;
        const nz = baseRoom.gz + d.dz;
        const key = this.gridKey(nx, nz, 0);

        if (!this.roomMap.has(key)) {
          const theme = otherThemes[themeIdx % otherThemes.length];
          themeIdx++;
          const newRoom = this.createRoom(nx, nz, theme, 0);
          floor0Rooms.push(newRoom);
          this.rooms.push(newRoom);
          this.roomMap.set(key, newRoom);
          break;
        }
      }
    }

    // Occasionally add a Second Floor (Upstairs, floor = 1) with a dedicated Grand Staircase Hall!
    if (this.hasSecondFloor) {
      // Pick an exterior leaf room on Floor 0 (or attach a dedicated Staircase Hallway leaf room)
      // so the staircase sits cleanly in the center of the room, far away from walls, and NEVER blocks any doorway!
      const stairHallTheme = {
        type: 'stair_hall',
        name: 'Grand Staircase Hall',
        icon: '🪜',
        wallColor: [238, 230, 214],
        floorColor: [164, 120, 82],
        rugColor: [188, 86, 72],
        trimColor: [248, 245, 238],
      };

      // Attach the 1st-Floor Grand Staircase Hall off the North or East/West of an existing Floor 0 room
      // so it only has ONE doorway (at its South or entry side) and a completely clear center for the grand staircase!
      let stairRoom0 = null;
      const candidateParents = this.rng.shuffle(floor0Rooms);
      // Prefer a North expansion (dx=0, dz=1) so you walk straight North through the doorway and right up the center stairs!
      const stairDirs = [
        { dx: 0, dz: 1, side: 'north', opp: 'south' },
        { dx: 1, dz: 0, side: 'east', opp: 'west' },
        { dx: -1, dz: 0, side: 'west', opp: 'east' },
      ];
      for (const parent of candidateParents) {
        for (const d of stairDirs) {
          const nx = parent.gx + d.dx;
          const nz = parent.gz + d.dz;
          const key0 = this.gridKey(nx, nz, 0);
          if (!this.roomMap.has(key0)) {
            stairRoom0 = this.createRoom(nx, nz, stairHallTheme, 0);
            stairRoom0.hasStairsUp = true;
            stairRoom0.stairEntrySide = d.opp; // 'south', 'west', or 'east'
            this.rooms.push(stairRoom0);
            this.roomMap.set(key0, stairRoom0);
            break;
          }
        }
        if (stairRoom0) break;
      }

      const upLandingTheme = {
        type: 'stair_hall',
        name: 'Upstairs Gallery Landing',
        icon: '🪜',
        wallColor: [236, 228, 214],
        floorColor: [164, 120, 82],
        rugColor: [194, 96, 78],
        trimColor: [248, 245, 238],
      };

      const upLanding = this.createRoom(stairRoom0.gx, stairRoom0.gz, upLandingTheme, 1);
      upLanding.hasStairsDown = true;
      upLanding.stairEntrySide = stairRoom0.stairEntrySide;
      const floor1Rooms = [upLanding];
      this.rooms.push(upLanding);
      this.roomMap.set(this.gridKey(upLanding.gx, upLanding.gz, 1), upLanding);

      // Add 2 to 3 upstairs rooms connected to the Upstairs Gallery Landing
      // (Never place an upstairs room on the side where the bottom of the stairs is, so the top landing doorway is never blocked!)
      const numUpstairsRooms = this.rng.int(3, 4);
      while (floor1Rooms.length < numUpstairsRooms) {
        const baseRoom = this.rng.pick(floor1Rooms);
        const shuffledDirs = this.rng.shuffle(dirs);

        for (const d of shuffledDirs) {
          // On the Upstairs Gallery Landing itself, keep the South wall (foot-of-stairs side) free of doors
          // so all upstairs doorways open off the wide Upper Landing!
          if (baseRoom === upLanding && d.side === 'south') continue;

          const nx = baseRoom.gx + d.dx;
          const nz = baseRoom.gz + d.dz;
          const key = this.gridKey(nx, nz, 1);

          if (!this.roomMap.has(key)) {
            const rawTheme = otherThemes[themeIdx % otherThemes.length];
            themeIdx++;
            const upTheme = {
              ...rawTheme,
              name: `Upstairs ${rawTheme.name}`,
            };
            const newUpRoom = this.createRoom(nx, nz, upTheme, 1);
            floor1Rooms.push(newUpRoom);
            this.rooms.push(newUpRoom);
            this.roomMap.set(key, newUpRoom);
            break;
          }
        }
      }
    }

    // Connect adjacent rooms on the SAME floor with open doorways
    // IMPORTANT: For the 1st-Floor Grand Staircase Hall (hasStairsUp), ONLY open the door to its entry side (or South/East/West),
    // keeping its North wall (top of the stairs) solid so the staircase NEVER blocks a 1st-floor doorway!
    for (const room of this.rooms) {
      for (const d of dirs) {
        if (room.hasStairsUp && d.side === 'north') continue;
        if (room.hasStairsDown && d.side === 'south') continue;

        const neighbor = this.roomMap.get(
          this.gridKey(room.gx + d.dx, room.gz + d.dz, room.floor)
        );
        if (neighbor) {
          if (neighbor.hasStairsUp && d.opp === 'north') continue;
          if (neighbor.hasStairsDown && d.opp === 'south') continue;
          room.doors[d.side] = true;
        }
      }
    }

    // Apply variable luxury room sizes (1.5x Grand Staircase Hall & up to 2x Grand Luxury Rooms)!
    this.applyVariableRoomSizes();
  }

  createRoom(gx, gz, theme, floor = 0, scaleX = 1.0, scaleZ = 1.0) {
    const cx = gx * this.roomSize;
    const cz = gz * this.roomSize;
    const baseY = floor * this.wallHeight;
    const sizeX = this.roomSize * scaleX;
    const sizeZ = this.roomSize * scaleZ;
    return {
      id: `room_f${floor}_${gx}_${gz}`,
      floor,
      baseY,
      gx,
      gz,
      cx,
      cz,
      sizeX,
      sizeZ,
      scaleX,
      scaleZ,
      isLuxurySize: scaleX > 1.35 || scaleZ > 1.35,
      minX: cx - sizeX * 0.5,
      maxX: cx + sizeX * 0.5,
      minZ: cz - sizeZ * 0.5,
      maxZ: cz + sizeZ * 0.5,
      theme,
      name: theme.name,
      icon: theme.icon,
      doors: { north: false, south: false, east: false, west: false },
      doorCenters: { north: cx, south: cx, east: cz, west: cz },
      hasStairsUp: false,
      hasStairsDown: false,
      furniture: [],
      ceilingFan: null,
      extraCeilingFan: null,
      portableFan: null,
      lights: [],
    };
  }

  // Expand exterior rooms into 1.5x Staircase Halls or up to 2x Luxury Grand Rooms
  // using strict 2D AABB collision checks so expanded rooms NEVER overlap another room!
  applyVariableRoomSizes() {
    // Check if candidate rectangle [minX, maxX] x [minZ, maxZ] overlaps any other room on the given floor(s)
    const canExpandTo = (room, candMinX, candMaxX, candMinZ, candMaxZ, checkBothFloors = false) => {
      const eps = 0.05; // Allow shared walls to touch flush, but forbid any interior overlap!
      for (const other of this.rooms) {
        if (other === room) continue;
        // Skip the paired stairwell counterpart on the other floor (we sync those explicitly)
        if (checkBothFloors && other.gx === room.gx && other.gz === room.gz) continue;
        if (!checkBothFloors && other.floor !== room.floor) continue;

        const overlapX = candMinX < other.maxX - eps && candMaxX > other.minX + eps;
        const overlapZ = candMinZ < other.maxZ - eps && candMaxZ > other.minZ + eps;
        if (overlapX && overlapZ) {
          return false;
        }
      }
      return true;
    };

    // Pass 1: Expand the Grand Staircase Hall (and its paired Upstairs Gallery Landing) by 1.5x first
    const stairRoom0 = this.rooms.find((r) => r.hasStairsUp);
    const stairRoom1 = this.rooms.find((r) => r.hasStairsDown);
    if (stairRoom0) {
      const extraSide = this.roomSize * 0.25; // +1.8m
      const extraDepth = this.roomSize * 0.5; // +3.6m (1.5x room depth)

      // Try expanding North, South, West, and East only if no room on Floor 0 or Floor 1 is in the way
      if (
        !stairRoom0.doors.north &&
        !(stairRoom1 && stairRoom1.doors.north) &&
        canExpandTo(stairRoom0, stairRoom0.minX, stairRoom0.maxX, stairRoom0.minZ, stairRoom0.maxZ + extraDepth, true)
      ) {
        stairRoom0.maxZ += extraDepth;
        if (stairRoom1) stairRoom1.maxZ = stairRoom0.maxZ;
      } else if (
        !stairRoom0.doors.south &&
        !(stairRoom1 && stairRoom1.doors.south) &&
        canExpandTo(stairRoom0, stairRoom0.minX, stairRoom0.maxX, stairRoom0.minZ - extraDepth, stairRoom0.maxZ, true)
      ) {
        stairRoom0.minZ -= extraDepth;
        if (stairRoom1) stairRoom1.minZ = stairRoom0.minZ;
      }

      if (
        !stairRoom0.doors.west &&
        !(stairRoom1 && stairRoom1.doors.west) &&
        canExpandTo(stairRoom0, stairRoom0.minX - extraSide, stairRoom0.maxX, stairRoom0.minZ, stairRoom0.maxZ, true)
      ) {
        stairRoom0.minX -= extraSide;
        if (stairRoom1) stairRoom1.minX = stairRoom0.minX;
      }

      if (
        !stairRoom0.doors.east &&
        !(stairRoom1 && stairRoom1.doors.east) &&
        canExpandTo(stairRoom0, stairRoom0.minX, stairRoom0.maxX + extraSide, stairRoom0.minZ, stairRoom0.maxZ, true)
      ) {
        stairRoom0.maxX += extraSide;
        if (stairRoom1) stairRoom1.maxX = stairRoom0.maxX;
      }
    }

    // Pass 2: Shape rooms into realistic architectural proportions (compact kitchens, rectangular offices/bedrooms/living rooms, and square rooms!)
    for (const room of this.rooms) {
      const isStairHall = room.hasStairsUp || room.hasStairsDown;
      const isFoyer = room.gx === 0 && room.gz === 0 && room.floor === 0;
      const t = room.theme.type;

      // Helper to try expanding a single side by `amount`
      const tryExpandSide = (side, amount) => {
        if (amount <= 0 || room.doors[side]) return false;
        let cMinX = room.minX, cMaxX = room.maxX, cMinZ = room.minZ, cMaxZ = room.maxZ;
        if (side === 'north') cMaxZ += amount;
        else if (side === 'south') cMinZ -= amount;
        else if (side === 'east') cMaxX += amount;
        else if (side === 'west') cMinX -= amount;

        if (canExpandTo(room, cMinX, cMaxX, cMinZ, cMaxZ)) {
          room.minX = cMinX;
          room.maxX = cMaxX;
          room.minZ = cMinZ;
          room.maxZ = cMaxZ;
          return true;
        }
        return false;
      };

      if (!isStairHall && !isFoyer) {
        if (t === 'kitchen') {
          // Real-world Kitchen: compact & cozy! Occasionally a slightly rectangular galley/eat-in kitchen (+1.8m on one axis only), never huge!
          const galleyExpand = this.roomSize * 0.25;
          const sides = this.rng.shuffle(['north', 'south', 'east', 'west']);
          for (const s of sides) {
            if (tryExpandSide(s, galleyExpand)) break;
          }
        } else if (t === 'study' || t === 'music') {
          // Real-world Home Office / Studio: rectangular office (+3.0m along one axis) or cozy square room
          const officeExpand = this.roomSize * 0.42;
          const sides = this.rng.shuffle(['north', 'south', 'east', 'west']);
          for (const s of sides) {
            if (tryExpandSide(s, officeExpand)) break;
          }
        } else {
          // Living Room, Bedroom, Playroom, Sunroom, Loft:
          // Make most of them distinctly RECTANGULAR (expanding 1.7x-2.0x along one primary axis, and 1.0x-1.25x on the perpendicular axis)
          // while leaving some rooms square for natural floorplan variety!
          const shapeRoll = this.rng.next();
          const preferHorizontal = this.rng.next() < 0.5;
          const primarySides = preferHorizontal
            ? this.rng.shuffle(['east', 'west'])
            : this.rng.shuffle(['north', 'south']);
          const secondarySides = preferHorizontal
            ? this.rng.shuffle(['north', 'south'])
            : this.rng.shuffle(['east', 'west']);

          const longExpand = this.roomSize * 0.85; // ~1.85x length along primary axis (distinct rectangle!)
          const medExpand = this.roomSize * 0.52;  // ~1.52x length
          const minorExpand = this.roomSize * 0.24; // slight width boost

          if (shapeRoll < 0.78 || t === 'living' || t === 'bedroom') {
            // Rectangular room: expand strongly along primary axis, keep secondary axis at 1.0x (or 1.24x for Grand Living Room)
            let expandedPrimary = false;
            for (const s of primarySides) {
              if (tryExpandSide(s, longExpand) || tryExpandSide(s, medExpand)) {
                expandedPrimary = true;
                break;
              }
            }
            // If primary axis was blocked by neighbors, try making it rectangular along the secondary axis instead!
            if (!expandedPrimary) {
              for (const s of secondarySides) {
                if (tryExpandSide(s, longExpand) || tryExpandSide(s, medExpand)) {
                  expandedPrimary = true;
                  break;
                }
              }
            } else if (t === 'living' && this.rng.next() < 0.5) {
              // Living room can occasionally be a wider rectangle (e.g. 1.85x by 1.24x)
              for (const s of secondarySides) {
                if (tryExpandSide(s, minorExpand)) break;
              }
            }
          } else {
            // ~22% chance for non-living/bedroom rooms to be a large square or standard 1x square
            for (const s of primarySides) {
              if (tryExpandSide(s, medExpand)) break;
            }
            for (const s of secondarySides) {
              if (tryExpandSide(s, medExpand)) break;
            }
          }
        }
      }

      // Recompute room center and dimensions from updated bounds
      // Keep original grid center for doorway alignment (`doorCenters`), while updating `cx, cz, sizeX, sizeZ`!
      const origCx = room.gx * this.roomSize;
      const origCz = room.gz * this.roomSize;
      room.doorCenters = {
        north: origCx,
        south: origCx,
        east: origCz,
        west: origCz,
      };
      room.cx = (room.minX + room.maxX) * 0.5;
      room.cz = (room.minZ + room.maxZ) * 0.5;
      room.sizeX = room.maxX - room.minX;
      room.sizeZ = room.maxZ - room.minZ;
      room.isLuxurySize =
        t !== 'kitchen' &&
        (room.sizeX * room.sizeZ) > (this.roomSize * this.roomSize * 1.38);
      if (room.isLuxurySize && !isStairHall && !room.name.includes('Grand')) {
        room.name = `Grand ${room.name}`;
      }
    }
  }

  registerInteractive(obj) {
    this.interactives.push(obj);
    this.interactiveById.set(obj.id, obj);
    return obj;
  }

  populateRooms() {
    for (const room of this.rooms) {
      const by = room.baseY;
      const isStairHall = room.hasStairsUp || room.hasStairsDown;
      // 1. Every room gets a centerpiece Ceiling Fan with a Built-in Ceiling Light & Pull Chains!
      // (In the 1st-floor Grand Staircase Hall, the ceiling is open to the 2nd floor above, so the Grand Ceiling Fan hangs from the high 2nd-floor ceiling!)
      const initialFanSpeed = this.rng.next() < 0.45 ? this.rng.int(1, 3) : 0;
      const initialLightOn = this.rng.next() < 0.55;

      // Offset the fan slightly to the East gallery in Staircase Halls so pull chains hang over the flat walkway!
      const fanX = isStairHall ? room.cx + 1.85 : room.cx;
      const fanZ = room.cz;

      const ceilingFan = this.registerInteractive({
        id: `cfan_${room.id}`,
        kind: 'fan',
        subKind: 'ceiling_fan',
        room,
        name: `${room.name} Ceiling Fan`,
        icon: '🌀',
        x: fanX,
        y: by + this.wallHeight - 0.35,
        z: fanZ,
        interactY: by + 1.75, // Pull chain height
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
        x: fanX,
        y: by + this.wallHeight - 0.48,
        z: fanZ,
        interactY: by + 1.75,
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
          y: by + this.rng.range(0.35, this.wallHeight - 0.4),
          z: this.rng.range(room.minZ + 0.6, room.maxZ - 0.6),
          phase: this.rng.range(0, Math.PI * 2),
          size: this.rng.range(0.024, 0.045),
        });
      }
    }

    // 5. Place the Front Exit Door on the South wall of the 1st-Floor Foyer (0, 0, floor 0)
    const foyer = this.roomMap.get('0,0,0');
    this.exitDoor = this.registerInteractive({
      id: 'exit_door',
      kind: 'exit',
      subKind: 'front_door',
      room: foyer,
      name: 'Front Exit Door (Next House)',
      icon: '🚪',
      x: foyer.cx,
      y: foyer.baseY + 1.15,
      z: foyer.minZ + 0.08,
      interactY: foyer.baseY + 1.2,
    });
  }

  placeWallSwitchesForRoom(room, ceilingLight, ceilingFan) {
    const by = room.baseY;
    const dc = room.doorCenters || { north: room.cx, south: room.cx, east: room.cz, west: room.cz };
    // Pick a wall with a door (or North wall) and place a dual switch plate beside the doorframe
    let swX = dc.north + 1.15;
    let swZ = room.maxZ - 0.06;
    let normal = { x: 0, y: 0, z: -1 };

    if (room.doors.north) {
      swX = dc.north + 1.15;
      swZ = room.maxZ - 0.05;
      normal = { x: 0, y: 0, z: -1 };
    } else if (room.doors.south) {
      swX = dc.south - 1.15;
      swZ = room.minZ + 0.05;
      normal = { x: 0, y: 0, z: 1 };
    } else if (room.doors.east) {
      swX = room.maxX - 0.05;
      swZ = dc.east - 1.15;
      normal = { x: -1, y: 0, z: 0 };
    } else if (room.doors.west) {
      swX = room.minX + 0.05;
      swZ = dc.west + 1.15;
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
      y: by + 1.25,
      z: swZ,
      interactY: by + 1.25,
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
      y: by + 1.25,
      z: swZ + offsetZ,
      interactY: by + 1.25,
      normal,
    });
  }

  placeRoomFurnitureAndFixtures(room) {
    const by = room.baseY;
    room.tallWallItems = [];
    // Pick snug corners of the room (0.58m from corner walls so standing fans & floor lamps sit right in the corners!)
    const corners = [
      { x: room.minX + 0.58, z: room.maxZ - 0.58, dirYaw: -Math.PI * 0.25 },
      { x: room.maxX - 0.58, z: room.maxZ - 0.58, dirYaw: -Math.PI * 0.75 },
      { x: room.minX + 0.58, z: room.minZ + 0.58, dirYaw: Math.PI * 0.25 },
      { x: room.maxX - 0.58, z: room.minZ + 0.58, dirYaw: Math.PI * 0.75 },
    ];
    const shuffledCorners = this.rng.shuffle(corners);

    // Corner 1: Standing Oscillating Pedestal Fan OR Retro Box Fan (keep West stairwell clear if room has stairs!)
    const availableCorners = (room.hasStairsUp || room.hasStairsDown)
      ? shuffledCorners.filter((c) => c.x > room.cx)
      : shuffledCorners;
    const fanCorner = availableCorners[0];
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
      y: by + (isPedestal ? 1.15 : 0.42),
      z: fanCorner.z,
      interactY: by + (isPedestal ? 1.15 : 0.55),
      baseYaw: fanCorner.dirYaw,
      oscillatePhase: this.rng.range(0, Math.PI * 2),
      speed: initSpeed,
      bladeAngle: 0,
      currentAngularVel: FAN_SPEED_RAD_PER_SEC[initSpeed],
    });
    room.portableFan = portableFan;
    this.addCollider(fanCorner.x, fanCorner.z, 0.34, 0.34, room.floor);

    // Corner 2: Cozy Floor Lamp
    const lampCorner = availableCorners[1] || shuffledCorners[1];
    const lampOn = this.rng.next() < 0.5;
    const floorLamp = this.registerInteractive({
      id: `flamp_${room.id}`,
      kind: 'light',
      subKind: 'floor_lamp',
      room,
      name: `${room.name} Cozy Floor Lamp`,
      icon: '🛋️',
      x: lampCorner.x,
      y: by + 1.38,
      z: lampCorner.z,
      interactY: by + 1.3,
      isOn: lampOn,
      radius: 4.8,
      intensity: 0.65,
      colorR: 1.1,
      colorG: 0.88,
      colorB: 0.62,
    });
    room.lights.push(floorLamp);
    this.addCollider(lampCorner.x, lampCorner.z, 0.3, 0.3, room.floor);

    // Corner 3: Cozy Corner Potted Plant
    const plantCorner = availableCorners[2] || shuffledCorners[2];
    if (plantCorner) {
      this.addPottedPlant(room, plantCorner.x, plantCorner.z);
    }

    if (room.hasStairsUp || room.hasStairsDown) {
      // Dedicated Grand Staircase Hall: keep all 4 walls and walkways spacious and uncluttered!
      if (room.hasStairsUp) {
        this.buildClimbableStaircase(room);
      }
    } else {
      this.addFurnitureForTheme(room);
    }

    this.addWallDecorForRoom(room);
  }

  // Build a Dedicated Center Grand Staircase in the 1.5x Grand Staircase Hall!
  // Placed right down the center of the room (x = room.cx), with >2.5m of clear space from both East and West walls,
  // 2.2m of flat lower landing on the South side, and 2.5m of flat upper landing on the North side!
  buildClimbableStaircase(stairRoom0) {
    const stairX = stairRoom0.cx; // Centered horizontally in the 1.5x Grand Staircase Hall!
    const stairHalfW = 0.92; // Wide, luxurious 1.84m grand staircase!
    const zBottom = stairRoom0.minZ + 2.15; // 2.15m spacious flat lower landing at bottom of stairs
    const zTop = stairRoom0.maxZ - 2.45; // 2.45m spacious flat upper landing at top of stairs!

    this.stairwell = {
      gx: stairRoom0.gx,
      gz: stairRoom0.gz,
      cx: stairX,
      minX: stairX - stairHalfW,
      maxX: stairX + stairHalfW,
      zBottom,
      zTop,
    };

    // Protective left and right side balustrade colliders along the stairwell
    // leaving the wide bottom entry (z < zBottom) and wide top exit (z > zTop) completely open!
    const railHalfLen = (zTop - zBottom) * 0.46;
    const railMidZ = (zBottom + zTop) * 0.5;
    for (const sideSign of [-1, 1]) {
      const rx = stairX + sideSign * (stairHalfW + 0.06);
      this.addCollider(rx, railMidZ, 0.07, railHalfLen, 0);
      this.addCollider(rx, railMidZ, 0.07, railHalfLen, 1);
    }

    // Also place a protective back guardrail along the South edge of the 2nd-floor stairwell opening (z = zBottom)
    // so on the 2nd floor you can walk around the East and West galleries without falling into the back of the stairwell!
    this.addCollider(stairX, zBottom - 0.06, stairHalfW + 0.06, 0.07, 1);

    // Build 14 wide, comfortable solid oak steps climbing from Floor 0 (y=0) to Floor 1 (y=3.0m)
    const numSteps = 14;
    const totalDepth = zTop - zBottom;
    const stepD = totalDepth / numSteps;
    const stepH = this.wallHeight / numSteps;

    for (let s = 0; s < numSteps; s++) {
      const treadY = (s + 1) * stepH;
      const sz = zBottom + (s + 0.5) * stepD;

      // Solid wooden step carriage block
      this.addBox(
        stairRoom0,
        stairX,
        treadY - stepH * 0.5,
        sz,
        stairHalfW * 1.94,
        stepH + 0.02,
        stepD + 0.02,
        [146, 102, 66]
      );
      // Warm Oak Stair Tread on top
      this.addBox(
        stairRoom0,
        stairX,
        treadY - 0.015,
        sz,
        stairHalfW * 2.0,
        0.045,
        stepD + 0.04,
        [208, 162, 110]
      );
    }

    // Twin Wooden Handrail Baluster Posts on BOTH sides of the Grand Staircase!
    for (const sideSign of [-1, 1]) {
      const rx = stairX + sideSign * stairHalfW;
      for (const frac of [0.06, 0.35, 0.65, 0.94]) {
        const pz = zBottom + frac * totalDepth;
        const py = frac * this.wallHeight;
        this.addBox(
          stairRoom0,
          rx,
          py + 0.45,
          pz,
          0.08,
          0.9,
          0.08,
          [116, 76, 48]
        );
      }
    }

    // Upstairs Gallery Landing Guardrail Balustrades along Left, Right, and South (back) edges of the stairwell opening!
    const upLanding = this.roomMap.get(this.gridKey(stairRoom0.gx, stairRoom0.gz, 1));
    if (upLanding) {
      for (const sideSign of [-1, 1]) {
        const rx = stairX + sideSign * (stairHalfW + 0.06);
        this.addBox(
          upLanding,
          rx,
          0.46,
          railMidZ,
          0.09,
          0.92,
          (zTop - zBottom) * 0.96,
          [136, 94, 60]
        );
        // White top handrail cap
        this.addBox(
          upLanding,
          rx,
          0.95,
          railMidZ,
          0.12,
          0.06,
          (zTop - zBottom) * 0.98,
          [246, 242, 235]
        );
      }
      // South guardrail closing the back of the stairwell opening on the 2nd floor
      this.addBox(
        upLanding,
        stairX,
        0.46,
        zBottom - 0.05,
        stairHalfW * 2.08,
        0.92,
        0.09,
        [136, 94, 60]
      );
      this.addBox(
        upLanding,
        stairX,
        0.95,
        zBottom - 0.05,
        stairHalfW * 2.12,
        0.06,
        0.12,
        [246, 242, 235]
      );
    }
  }

  // Returns the player's floor elevation (0.0 to 3.0m) at world position (x, z)
  getFloorElevation(x, z, currentFloor = 0) {
    if (this.stairwell) {
      const sw = this.stairwell;
      // Check if the player is inside the stairwell room and aligned with the center staircase
      if (
        x >= sw.minX - 0.25 &&
        x <= sw.maxX + 0.25 &&
        z >= sw.zBottom - 0.45 &&
        z <= sw.zTop + 0.45
      ) {
        const t = Math.max(0, Math.min(1, (z - sw.zBottom) / (sw.zTop - sw.zBottom)));
        return t * this.wallHeight;
      }
    }
    return currentFloor * this.wallHeight;
  }

  isOnStaircase(x, z) {
    if (!this.stairwell) return false;
    const sw = this.stairwell;
    return (
      x >= sw.minX - 0.25 &&
      x <= sw.maxX + 0.25 &&
      z >= sw.zBottom - 0.35 &&
      z <= sw.zTop + 0.35
    );
  }

  addBox(room, x, y, z, w, h, d, color, options = {}) {
    room.furniture.push({
      kind: 'box',
      x,
      y: room.baseY + y,
      z,
      w, h, d, color,
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
    this.addCollider(x, z, 0.25, 0.25, room.floor);
  }

  addDeskLamp(room, x, baseTopY, z, labelName) {
    const by = room.baseY;
    const isOn = this.rng.next() < 0.55;
    const lamp = this.registerInteractive({
      id: `dlamp_${room.id}_${Math.round(x * 10)}_${Math.round(z * 10)}`,
      kind: 'light',
      subKind: 'desk_lamp',
      room,
      name: `${room.name} ${labelName}`,
      icon: '🏮',
      x,
      y: by + baseTopY + 0.34,
      z,
      baseTopY: by + baseTopY,
      interactY: by + baseTopY + 0.25,
      isOn,
      radius: 4.2,
      intensity: 0.58,
      colorR: 1.12,
      colorG: 0.9,
      colorB: 0.68,
    });
    room.lights.push(lamp);
  }

  // Find a clear horizontal coordinate `u` along `side` wall that doesn't overlap any tall bookshelf or refrigerator!
  findClearWallDecorCoord(room, side, itemHalfW = 0.85) {
    const isNS = side === 'north' || side === 'south';
    const uMin = (isNS ? room.minX : room.minZ) + 1.15 + itemHalfW;
    const uMax = (isNS ? room.maxX : room.maxZ) - 1.15 - itemHalfW;
    const centerU = isNS ? room.cx : room.cz;
    const candidates = [
      centerU,
      centerU - 1.55,
      centerU + 1.55,
      centerU - 2.6,
      centerU + 2.6,
    ];
    const tallItems = (room.tallWallItems || []).filter((it) => it.side === side);
    for (const u of candidates) {
      if (u < uMin || u > uMax) continue;
      const blocked = tallItems.some((it) => Math.abs(u - it.u) < (it.halfW + itemHalfW + 0.12));
      if (!blocked) return u;
    }
    return null;
  }

  addWallDecorForRoom(room) {
    // Place windows and framed artwork on exterior/door-free walls where no tall bookcase is blocking!
    const hasStairwell = room.hasStairsUp || room.hasStairsDown;
    const wallSpecs = [
      { side: 'north', hasDoor: room.doors.north, isExit: false },
      { side: 'south', hasDoor: room.doors.south, isExit: room.gx === 0 && room.gz === 0 && room.floor === 0 },
      { side: 'east', hasDoor: room.doors.east, isExit: false },
      { side: 'west', hasDoor: room.doors.west || hasStairwell, isExit: false },
    ];

    let windowAdded = false;
    for (const w of wallSpecs) {
      if (w.hasDoor || w.isExit) continue;

      if (!windowAdded) {
        const winU = this.findClearWallDecorCoord(room, w.side, 0.92);
        if (winU !== null) {
          this.addWindowOnWall(room, w.side, winU);
          windowAdded = true;
        }
      } else {
        const artU = this.findClearWallDecorCoord(room, w.side, 0.62);
        if (artU !== null) {
          this.addPaintingOnWall(room, w.side, artU);
        }
      }
    }
  }

  addWindowOnWall(room, side, uCoord = null) {
    const frameColor = [248, 246, 240];
    const glassColor = [155, 218, 252];
    const sillColor = [235, 228, 216];
    const curtainColor = room.theme.rugColor;
    const wy = 1.58;

    if (side === 'north' || side === 'south') {
      const wz = side === 'north' ? room.maxZ - 0.04 : room.minZ + 0.04;
      const sign = side === 'north' ? -1 : 1;
      const wx = uCoord ?? room.cx;
      // Outer window frame & sky glass (layers 5, 6, 7 so they never Z-fight!)
      this.addBox(room, wx, wy, wz, 1.56, 1.18, 0.06, frameColor, { layer: 5 });
      this.addBox(room, wx, wy, wz + sign * 0.03, 1.38, 1.0, 0.04, glassColor, { emissive: true, layer: 6 });
      // Crossbars (mullions)
      this.addBox(room, wx, wy, wz + sign * 0.05, 1.4, 0.06, 0.03, frameColor, { layer: 7 });
      this.addBox(room, wx, wy, wz + sign * 0.05, 0.06, 1.02, 0.03, frameColor, { layer: 7 });
      // Window Sill (at y = 0.97m so low furniture <= 0.95m fits cleanly underneath!)
      this.addBox(room, wx, wy - 0.61, wz + sign * 0.06, 1.72, 0.07, 0.14, sillColor, { layer: 7 });
      // Left & Right Cozy Curtains
      this.addBox(room, wx - 0.84, wy - 0.02, wz + sign * 0.06, 0.24, 1.34, 0.1, curtainColor, { layer: 7 });
      this.addBox(room, wx + 0.84, wy - 0.02, wz + sign * 0.06, 0.24, 1.34, 0.1, curtainColor, { layer: 7 });
    } else {
      const wx = side === 'east' ? room.maxX - 0.04 : room.minX + 0.04;
      const wz = uCoord ?? room.cz;
      const sign = side === 'east' ? -1 : 1;
      this.addBox(room, wx, wy, wz, 0.06, 1.18, 1.56, frameColor, { layer: 5 });
      this.addBox(room, wx + sign * 0.03, wy, wz, 0.04, 1.0, 1.38, glassColor, { emissive: true, layer: 6 });
      this.addBox(room, wx + sign * 0.05, wy, wz, 0.03, 0.06, 1.4, frameColor, { layer: 7 });
      this.addBox(room, wx + sign * 0.05, wy, wz, 0.03, 1.02, 0.06, frameColor, { layer: 7 });
      this.addBox(room, wx + sign * 0.06, wy - 0.61, wz, 0.14, 0.07, 1.72, sillColor, { layer: 7 });
      this.addBox(room, wx + sign * 0.06, wy - 0.02, wz - 0.84, 0.1, 1.34, 0.24, curtainColor, { layer: 7 });
      this.addBox(room, wx + sign * 0.06, wy - 0.02, wz + 0.84, 0.1, 1.34, 0.24, curtainColor, { layer: 7 });
    }
  }

  addPaintingOnWall(room, side, uCoord = null) {
    const frameColor = [112, 78, 52];
    const canvasColors = [
      [234, 168, 92],
      [98, 174, 198],
      [198, 112, 126],
      [124, 184, 132],
    ];
    const artColor = this.rng.pick(canvasColors);
    const py = 1.66;

    if (side === 'north' || side === 'south') {
      const pz = side === 'north' ? room.maxZ - 0.04 : room.minZ + 0.04;
      const sign = side === 'north' ? -1 : 1;
      const px = uCoord ?? room.cx;
      this.addBox(room, px, py, pz, 1.12, 0.78, 0.05, frameColor, { layer: 5 });
      this.addBox(room, px, py, pz + sign * 0.03, 0.96, 0.62, 0.04, artColor, { layer: 6 });
    } else {
      const px = side === 'east' ? room.maxX - 0.04 : room.minX + 0.04;
      const sign = side === 'east' ? -1 : 1;
      const pz = uCoord ?? room.cz;
      this.addBox(room, px, py, pz, 0.05, 0.78, 1.12, frameColor, { layer: 5 });
      this.addBox(room, px + sign * 0.03, py, pz, 0.04, 0.62, 0.96, artColor, { layer: 6 });
    }
  }

  // ============================================================================
  // Wall-Flush Coordinate Helpers:
  // Automatically orient any furniture piece so its back sits FLUSH against
  // the North, South, East, or West wall and its front faces into the room!
  // ============================================================================
  wallCoords(room, side, uAlong, depthFromWall, widthAlong = 0, depthOut = 0) {
    if (side === 'north') {
      return { x: uAlong, z: room.maxZ - depthFromWall, w: widthAlong, d: depthOut };
    }
    if (side === 'south') {
      return { x: uAlong, z: room.minZ + depthFromWall, w: widthAlong, d: depthOut };
    }
    if (side === 'east') {
      return { x: room.maxX - depthFromWall, z: uAlong, w: depthOut, d: widthAlong };
    }
    // 'west'
    return { x: room.minX + depthFromWall, z: uAlong, w: depthOut, d: widthAlong };
  }

  addWallBox(room, side, uAlong, depthFromWall, y, widthAlong, height, depthOut, color, options = {}) {
    const c = this.wallCoords(room, side, uAlong, depthFromWall, widthAlong, depthOut);
    this.addBox(room, c.x, y, c.z, c.w, height, c.d, color, options);
  }

  addWallCollider(room, side, uAlong, depthFromWall, widthAlong, depthOut) {
    const c = this.wallCoords(room, side, uAlong, depthFromWall, widthAlong, depthOut);
    this.addCollider(c.x, c.z, c.w * 0.5, c.d * 0.5, room.floor);
  }

  addWallDeskLamp(room, side, uAlong, depthFromWall, baseTopY, labelName) {
    const c = this.wallCoords(room, side, uAlong, depthFromWall, 0, 0);
    this.addDeskLamp(room, c.x, baseTopY, c.z, labelName);
  }

  registerTallWallItem(room, side, uAlong, widthAlong) {
    if (!room.tallWallItems) room.tallWallItems = [];
    room.tallWallItems.push({ side, u: uAlong, halfW: widthAlong * 0.5 });
  }

  // 1. Tall Wooden Bookshelf (flush against `side` wall, with 3 rows of colorful books)
  addWallTallBookshelf(room, side, u, width = 1.24, height = 1.76) {
    const woodColor = [142, 94, 58];
    const trimColor = [118, 74, 44];
    const depth = 0.38;
    const centerD = 0.03 + depth * 0.5; // 0.22m from wall (back face at 0.03m flush with wall!)
    // Main bookcase cabinet
    this.addWallBox(room, side, u, centerD, height * 0.5, width, height, depth, woodColor);
    // Crown top molding cap
    this.addWallBox(room, side, u, centerD + 0.01, height + 0.03, width + 0.06, 0.06, depth + 0.04, trimColor);
    // 3 rows of colorful vertical book stacks protruding cleanly on the front shelf face
    const bookD = 0.03 + depth + 0.03;
    this.addWallBox(room, side, u - width * 0.21, bookD, 0.46, width * 0.38, 0.28, 0.06, [224, 88, 78]);
    this.addWallBox(room, side, u + width * 0.22, bookD, 0.44, width * 0.32, 0.24, 0.06, [238, 178, 74]);
    this.addWallBox(room, side, u + width * 0.16, bookD, 0.96, width * 0.44, 0.28, 0.06, [74, 158, 210]);
    this.addWallBox(room, side, u - width * 0.24, bookD, 0.94, width * 0.28, 0.24, 0.06, [156, 108, 192]);
    this.addWallBox(room, side, u - width * 0.15, bookD, 1.44, width * 0.46, 0.26, 0.06, [88, 182, 118]);
    this.addWallBox(room, side, u + width * 0.24, bookD, 1.42, width * 0.26, 0.22, 0.06, [232, 132, 78]);
    this.addWallCollider(room, side, u, centerD, width + 0.06, depth + 0.1);
    this.registerTallWallItem(room, side, u, width + 0.12);
  }

  // 2. Wide Low Credenza Bookcase (waist-high shelf flush against `side` wall, with books & tabletop decor)
  addWallLowBookcase(room, side, u, width = 1.36) {
    const woodColor = [156, 106, 68];
    const topColor = [178, 126, 82];
    const height = 0.86;
    const depth = 0.40;
    const centerD = 0.03 + depth * 0.5;
    this.addWallBox(room, side, u, centerD, height * 0.5, width, height, depth, woodColor);
    this.addWallBox(room, side, u, centerD + 0.01, height + 0.03, width + 0.06, 0.06, depth + 0.04, topColor);
    // 2 shelves of colorful books on the front face
    const bookD = 0.03 + depth + 0.03;
    this.addWallBox(room, side, u - width * 0.22, bookD, 0.28, width * 0.36, 0.22, 0.06, [82, 164, 198]);
    this.addWallBox(room, side, u + width * 0.2, bookD, 0.27, width * 0.34, 0.2, 0.06, [226, 112, 86]);
    this.addWallBox(room, side, u - width * 0.18, bookD, 0.66, width * 0.42, 0.22, 0.06, [118, 184, 112]);
    this.addWallBox(room, side, u + width * 0.24, bookD, 0.65, width * 0.28, 0.2, 0.06, [238, 184, 78]);
    // Small decorative ceramic planter & book stack sitting cleanly on top of the low bookcase
    this.addWallBox(room, side, u - 0.32, centerD, height + 0.12, 0.2, 0.12, 0.2, [212, 114, 78]);
    this.addWallBox(room, side, u - 0.32, centerD, height + 0.24, 0.26, 0.12, 0.26, [76, 168, 98]);
    this.addWallBox(room, side, u + 0.28, centerD, height + 0.09, 0.34, 0.06, 0.24, [196, 88, 98]);
    this.addWallCollider(room, side, u, centerD, width + 0.06, depth + 0.08);
  }

  // 3. Tiered Display & Cubby Shelf (flush against `side` wall, with storage baskets, books & curios)
  addWallDisplayShelf(room, side, u, width = 1.18) {
    const frameColor = [228, 222, 210];
    const woodAccent = [168, 118, 76];
    const height = 1.38;
    const depth = 0.38;
    const centerD = 0.03 + depth * 0.5;
    this.addWallBox(room, side, u, centerD, height * 0.5, width, height, depth, frameColor);
    this.addWallBox(room, side, u, centerD + 0.01, height + 0.03, width + 0.04, 0.06, depth + 0.04, woodAccent);
    // Colorful cubby bins and display items on the front face
    const frontD = 0.03 + depth + 0.03;
    this.addWallBox(room, side, u - 0.28, frontD, 0.32, 0.38, 0.28, 0.06, [232, 146, 74]);
    this.addWallBox(room, side, u + 0.28, frontD, 0.32, 0.38, 0.28, 0.06, [78, 168, 154]);
    this.addWallBox(room, side, u - 0.26, frontD, 0.78, 0.42, 0.24, 0.06, [104, 142, 208]);
    this.addWallBox(room, side, u + 0.26, frontD, 0.78, 0.36, 0.24, 0.06, [224, 96, 112]);
    this.addWallBox(room, side, u, frontD, 1.18, 0.56, 0.22, 0.06, [142, 188, 96]);
    this.addWallCollider(room, side, u, centerD, width + 0.06, depth + 0.08);
    this.registerTallWallItem(room, side, u, width + 0.1);
  }

  // 4. Plush 3-Seater Couch / Sofa (flush against `side` wall, with optional coffee table in front)
  addWallCouch(room, side, u, sofaColor = [78, 118, 168], backColor = [62, 98, 146], withCoffeeTable = false) {
    // Backrest cushion flush against the wall (depth 0.03 to 0.25 -> center 0.14, height 0.48 to 0.90)
    this.addWallBox(room, side, u, 0.14, 0.69, 1.44, 0.42, 0.22, backColor);
    // Seat base & plush seat cushion (depth 0.03 to 0.77 -> center 0.40, height 0 to 0.48)
    this.addWallBox(room, side, u, 0.40, 0.24, 1.44, 0.48, 0.74, sofaColor);
    // Left and right armrests sitting cleanly outside the 1.44m seat width (at u ± 0.83, width 0.22)
    this.addWallBox(room, side, u - 0.83, 0.41, 0.34, 0.22, 0.68, 0.76, backColor);
    this.addWallBox(room, side, u + 0.83, 0.41, 0.34, 0.22, 0.68, 0.76, backColor);
    // Colorful throw pillows sitting cleanly on top of the seat cushion in front of the backrest
    this.addWallBox(room, side, u - 0.46, 0.34, 0.59, 0.3, 0.22, 0.18, [242, 178, 72]);
    this.addWallBox(room, side, u + 0.46, 0.34, 0.59, 0.3, 0.22, 0.18, [232, 108, 92]);
    this.addWallCollider(room, side, u, 0.41, 1.88, 0.78);

    if (withCoffeeTable) {
      // Wooden Coffee Table placed 1.36m in front of the wall (leaving a walkable gap in front of the couch)
      const ctD = 1.38;
      this.addWallBox(room, side, u, ctD, 0.21, 1.02, 0.42, 0.48, [152, 104, 66]);
      this.addWallBox(room, side, u, ctD, 0.45, 1.1, 0.06, 0.54, [178, 126, 82]);
      this.addWallBox(room, side, u - 0.18, ctD, 0.505, 0.32, 0.05, 0.22, [218, 96, 84]);
      this.addWallCollider(room, side, u, ctD, 1.12, 0.56);
    }
  }

  // 5. Cozy Upholstered Reading Armchair / Accent Chair (flush against `side` wall)
  addWallArmchair(room, side, u, chairColor = [196, 118, 78], darkColor = [172, 98, 62], cushionColor = [244, 214, 138]) {
    // Backrest flush against the wall
    this.addWallBox(room, side, u, 0.14, 0.68, 0.62, 0.44, 0.2, darkColor);
    // Seat cushion
    this.addWallBox(room, side, u, 0.38, 0.23, 0.62, 0.46, 0.68, chairColor);
    // Left and right armrests
    this.addWallBox(room, side, u - 0.40, 0.39, 0.32, 0.18, 0.64, 0.70, darkColor);
    this.addWallBox(room, side, u + 0.40, 0.39, 0.32, 0.18, 0.64, 0.70, darkColor);
    // Cozy lumbar throw pillow
    this.addWallBox(room, side, u, 0.31, 0.55, 0.36, 0.18, 0.14, cushionColor);
    this.addWallCollider(room, side, u, 0.39, 0.98, 0.72);
  }

  // 6. Wooden Bedroom Dresser / Chest of Drawers (flush against `side` wall)
  addWallDresser(room, side, u, width = 1.24) {
    const bodyColor = [138, 92, 58];
    const topColor = [164, 112, 72];
    const drawerColor = [156, 106, 68];
    const depth = 0.46;
    const centerD = 0.03 + depth * 0.5;
    this.addWallBox(room, side, u, centerD, 0.42, width, 0.84, depth, bodyColor);
    this.addWallBox(room, side, u, centerD + 0.01, 0.87, width + 0.06, 0.06, depth + 0.04, topColor);
    // 4 Drawer fronts on the room-facing face
    const frontD = 0.03 + depth + 0.025;
    for (const du of [-width * 0.24, width * 0.24]) {
      this.addWallBox(room, side, u + du, frontD, 0.26, width * 0.42, 0.26, 0.04, drawerColor);
      this.addWallBox(room, side, u + du, frontD, 0.62, width * 0.42, 0.26, 0.04, drawerColor);
    }
    // Decorative jewelry/keepsake box on top
    this.addWallBox(room, side, u + 0.22, centerD, 0.95, 0.3, 0.1, 0.22, [214, 168, 92]);
    this.addWallCollider(room, side, u, centerD, width + 0.06, depth + 0.08);
  }

  // 7. Cozy Bed (Headboard flush against `side` wall) + Attached Bedside Nightstand & Bedside Table Lamp!
  addWallBedAndNightstand(room, side, u) {
    const bedU = u - 0.32;
    // Wooden headboard flush against wall (depth 0.03 to 0.17 -> center 0.10)
    this.addWallBox(room, side, bedU, 0.10, 0.58, 1.44, 0.92, 0.14, [118, 78, 52]);
    // Upper mattress section (depth 0.17 to 0.89 -> center 0.53)
    this.addWallBox(room, side, bedU, 0.53, 0.26, 1.38, 0.52, 0.72, [242, 238, 246]);
    // Twin pillows resting on top of upper mattress
    this.addWallBox(room, side, bedU - 0.34, 0.44, 0.59, 0.48, 0.14, 0.32, [252, 250, 255]);
    this.addWallBox(room, side, bedU + 0.34, 0.44, 0.59, 0.48, 0.14, 0.32, [252, 250, 255]);
    // Lower duvet blanket section extending into the room (depth 0.89 to 1.89 -> center 1.39)
    this.addWallBox(room, side, bedU, 1.39, 0.27, 1.40, 0.54, 1.0, [148, 106, 186]);
    this.addWallCollider(room, side, bedU, 0.96, 1.44, 1.88);

    // Bedside Nightstand flush against the same wall right beside the head of the bed!
    const nsU = bedU + 1.06;
    this.addWallBox(room, side, nsU, 0.25, 0.32, 0.52, 0.64, 0.44, [132, 92, 62]);
    this.addWallBox(room, side, nsU, 0.49, 0.42, 0.4, 0.2, 0.04, [158, 114, 78]);
    this.addWallDeskLamp(room, side, nsU, 0.25, 0.64, 'Bedside Table Lamp');
    this.addWallCollider(room, side, nsU, 0.26, 0.56, 0.48);
  }

  // 8. Executive Home Office Desk (flush against `side` wall) with Monitor, Office Chair & Desk Lamp!
  addWallOfficeDesk(room, side, u) {
    const depth = 0.66;
    const centerD = 0.03 + depth * 0.5; // 0.36m from wall
    // Left and right drawer pedestals (y = 0 to 0.70)
    this.addWallBox(room, side, u - 0.46, centerD, 0.35, 0.36, 0.7, depth, [138, 92, 56]);
    this.addWallBox(room, side, u + 0.46, centerD, 0.35, 0.36, 0.7, depth, [138, 92, 56]);
    // Wide walnut desktop sitting cleanly on top (y = 0.70 to 0.78)
    this.addWallBox(room, side, u, centerD + 0.02, 0.74, 1.38, 0.08, depth + 0.04, [168, 116, 72]);
    // Desktop Computer Monitor (stand + bezel + glowing screen facing the chair)
    this.addWallBox(room, side, u - 0.22, 0.22, 0.83, 0.12, 0.1, 0.1, [48, 52, 62]);
    this.addWallBox(room, side, u - 0.22, 0.22, 1.02, 0.54, 0.34, 0.05, [38, 42, 52]);
    this.addWallBox(room, side, u - 0.22, 0.26, 1.02, 0.48, 0.28, 0.02, [86, 168, 224], { emissive: true });
    // Interactive Office Desk Lamp on the other side of the desk
    this.addWallDeskLamp(room, side, u + 0.38, centerD, 0.78, 'Office Desk Lamp');
    // Ergonomic Swivel Office Chair tucked in front of the desk
    const chairD = 0.92;
    this.addWallBox(room, side, u, chairD, 0.21, 0.14, 0.42, 0.14, [58, 62, 72]);
    this.addWallBox(room, side, u, chairD, 0.46, 0.46, 0.08, 0.44, [68, 108, 148]);
    this.addWallBox(room, side, u, chairD + 0.18, 0.71, 0.44, 0.42, 0.08, [58, 94, 132]);
    this.addWallCollider(room, side, u, 0.58, 1.4, 1.12);
  }

  // 9. Widescreen TV & Media Credenza Console (flush against `side` wall)
  addWallTVConsole(room, side, u) {
    const depth = 0.44;
    const centerD = 0.03 + depth * 0.5;
    // Media cabinet base
    this.addWallBox(room, side, u, centerD, 0.28, 1.46, 0.56, depth, [128, 86, 56]);
    // Widescreen TV bezel & screen sitting cleanly on top of console against the wall
    this.addWallBox(room, side, u, 0.16, 0.88, 1.16, 0.64, 0.06, [34, 38, 48]);
    this.addWallBox(room, side, u, 0.205, 0.88, 1.04, 0.52, 0.03, [74, 138, 184]);
    this.addWallCollider(room, side, u, centerD, 1.48, depth + 0.08);
  }

  // 10. Fitted Kitchen Counter (Sink, Faucet, Stove Cooktop) & Tall Retro Refrigerator (flush against `side` wall)
  addWallKitchenCounterAndFridge(room, side, u) {
    const counterU = u - 0.46;
    const depth = 0.68;
    const centerD = 0.03 + depth * 0.5;
    // Lower kitchen cabinet & cream countertop
    this.addWallBox(room, side, counterU, centerD, 0.44, 1.54, 0.88, depth, [224, 148, 82]);
    this.addWallBox(room, side, counterU, centerD + 0.02, 0.92, 1.62, 0.08, depth + 0.04, [246, 244, 238]);
    // Stainless sink basin & faucet against the wall
    this.addWallBox(room, side, counterU - 0.38, centerD + 0.04, 0.985, 0.48, 0.05, 0.42, [175, 192, 206]);
    this.addWallBox(room, side, counterU - 0.38, 0.14, 1.11, 0.06, 0.22, 0.06, [155, 168, 182]);
    // Dark 4-burner stove cooktop
    this.addWallBox(room, side, counterU + 0.38, centerD + 0.04, 0.98, 0.52, 0.04, 0.44, [48, 52, 62]);
    this.addWallCollider(room, side, counterU, centerD, 1.62, depth + 0.08);

    // Tall Retro Refrigerator flush against the wall right beside the counter
    const fridgeU = counterU + 1.28;
    const fDepth = 0.68;
    const fCenterD = 0.03 + fDepth * 0.5;
    const fFrontD = 0.03 + fDepth + 0.025;
    this.addWallBox(room, side, fridgeU, fCenterD, 0.88, 0.82, 1.76, fDepth, [238, 244, 248]);
    this.addWallBox(room, side, fridgeU, fFrontD, 1.24, 0.82, 0.04, 0.03, [170, 182, 194]);
    this.addWallBox(room, side, fridgeU - 0.28, fFrontD + 0.01, 1.48, 0.05, 0.28, 0.05, [185, 196, 208]);
    this.addWallBox(room, side, fridgeU - 0.28, fFrontD + 0.01, 0.82, 0.05, 0.44, 0.05, [185, 196, 208]);
    this.addWallCollider(room, side, fridgeU, fCenterD, 0.86, fDepth + 0.08);
    this.registerTallWallItem(room, side, fridgeU, 0.9);
  }

  // Compute all door-free wall spans across the 4 walls of `room`
  getAvailableWallSpans(room) {
    const spans = [];
    const cornerMargin = 1.12; // Leaves corners free for floor lamp, standing/box fan & corner plants
    const doorClearance = 1.52; // Leaves doorway opening & wall switch plate completely clear

    for (const side of ['north', 'south', 'east', 'west']) {
      const isNS = side === 'north' || side === 'south';
      const uMin = (isNS ? room.minX : room.minZ) + cornerMargin;
      const uMax = (isNS ? room.maxX : room.maxZ) - cornerMargin;
      if (uMax - uMin < 1.1) continue;

      const isExitWall = side === 'south' && room.gx === 0 && room.gz === 0 && room.floor === 0;
      const hasDoor = room.doors[side] || isExitWall;

      if (!hasDoor) {
        spans.push({
          side,
          u0: uMin,
          u1: uMax,
          uMid: (uMin + uMax) * 0.5,
          len: uMax - uMin,
          hasDoor: false,
        });
      } else {
        const dc = room.doorCenters[side];
        const leftU1 = dc - doorClearance;
        if (leftU1 - uMin >= 1.15) {
          spans.push({
            side,
            u0: uMin,
            u1: leftU1,
            uMid: (uMin + leftU1) * 0.5,
            len: leftU1 - uMin,
            hasDoor: true,
          });
        }
        const rightU0 = dc + doorClearance;
        if (uMax - rightU0 >= 1.15) {
          spans.push({
            side,
            u0: rightU0,
            u1: uMax,
            uMid: (rightU0 + uMax) * 0.5,
            len: uMax - rightU0,
            hasDoor: true,
          });
        }
      }
    }

    // Sort longest door-free spans first so the room's primary centerpiece gets the best wall!
    spans.sort((a, b) => (b.len - (b.hasDoor ? 2 : 0)) - (a.len - (a.hasDoor ? 2 : 0)));
    return spans;
  }

  // Subdivide remaining wall spans into individual ~1.35m wall slots for bookshelves, couches, chairs, dressers & consoles
  collectSecondaryWallSlots(spans) {
    const slots = [];
    for (const sp of spans) {
      if (sp.len >= 4.4) {
        // Long wall span: fit 2 or 3 pieces of wall furniture side-by-side flush along the wall!
        if (sp.len >= 6.8) {
          slots.push({ side: sp.side, u: sp.uMid - 2.25, maxW: 1.45 });
          slots.push({ side: sp.side, u: sp.uMid, maxW: 1.55 });
          slots.push({ side: sp.side, u: sp.uMid + 2.25, maxW: 1.45 });
        } else {
          slots.push({ side: sp.side, u: sp.uMid - 1.12, maxW: 1.45 });
          slots.push({ side: sp.side, u: sp.uMid + 1.12, maxW: 1.45 });
        }
      } else if (sp.len >= 2.75) {
        slots.push({ side: sp.side, u: sp.uMid - 0.68, maxW: 1.28 });
        slots.push({ side: sp.side, u: sp.uMid + 0.68, maxW: 1.28 });
      } else {
        slots.push({ side: sp.side, u: sp.uMid, maxW: sp.len - 0.08 });
      }
    }
    return slots;
  }

  addFurnitureForTheme(room) {
    const t = room.theme.type;
    const spans = this.getAvailableWallSpans(room);
    if (spans.length === 0) return;

    const primarySpan = spans[0];
    const remainingSpans = spans.slice(1);
    // If the primary wall is extra long (e.g. a rectangular room wall >= 6.6m), carve out a side slot on the primary wall too!
    if (primarySpan.len >= 6.6) {
      remainingSpans.unshift({
        side: primarySpan.side,
        u0: primarySpan.uMid + 1.55,
        u1: primarySpan.u1,
        uMid: (primarySpan.uMid + 1.55 + primarySpan.u1) * 0.5,
        len: primarySpan.u1 - (primarySpan.uMid + 1.55),
        hasDoor: false,
      });
      primarySpan.uMid -= 0.85;
    }
    const wallSlots = this.collectSecondaryWallSlots(remainingSpans);

    if (t === 'living') {
      // Primary Wall: Plush 3-Seater Couch flush against wall + Wooden Coffee Table in front
      this.addWallCouch(room, primarySpan.side, primarySpan.uMid, [78, 118, 168], [62, 98, 146], true);

      // Other Walls: TV Media Console, Tall Bookshelf, Upholstered Reading Armchair, Low Credenza Bookcase, Display Shelf!
      const builders = [
        (s) => this.addWallTVConsole(room, s.side, s.u),
        (s) => this.addWallTallBookshelf(room, s.side, s.u, Math.min(1.24, s.maxW)),
        (s) => this.addWallArmchair(room, s.side, s.u, [196, 118, 78], [172, 98, 62]),
        (s) => this.addWallLowBookcase(room, s.side, s.u, Math.min(1.34, s.maxW)),
        (s) => this.addWallDisplayShelf(room, s.side, s.u, Math.min(1.18, s.maxW)),
        (s) => this.addWallTallBookshelf(room, s.side, s.u, Math.min(1.18, s.maxW)),
      ];
      wallSlots.slice(0, builders.length).forEach((slot, idx) => builders[idx](slot));
    } else if (t === 'bedroom') {
      // Primary Wall: Cozy Bed (headboard flush against wall) + Attached Bedside Nightstand & Bedside Table Lamp!
      this.addWallBedAndNightstand(room, primarySpan.side, primarySpan.uMid);

      // Other Walls: Tall Wooden Bookshelf, Bedroom Dresser, Wide Low Bookcase, Cozy Reading Armchair, Display Shelf!
      const builders = [
        (s) => this.addWallTallBookshelf(room, s.side, s.u, Math.min(1.24, s.maxW)),
        (s) => this.addWallDresser(room, s.side, s.u, Math.min(1.24, s.maxW)),
        (s) => this.addWallLowBookcase(room, s.side, s.u, Math.min(1.32, s.maxW)),
        (s) => this.addWallArmchair(room, s.side, s.u, [142, 112, 178], [118, 88, 154]),
        (s) => this.addWallTallBookshelf(room, s.side, s.u, Math.min(1.18, s.maxW)),
        (s) => this.addWallDisplayShelf(room, s.side, s.u, Math.min(1.16, s.maxW)),
      ];
      wallSlots.slice(0, builders.length).forEach((slot, idx) => builders[idx](slot));
    } else if (t === 'study') {
      // Primary Wall: Executive Home Office Desk (flush against wall) with Monitor, Office Chair & Desk Lamp!
      this.addWallOfficeDesk(room, primarySpan.side, primarySpan.uMid);

      // Other Walls: Multiple Tall Wooden Bookshelves flush against the walls, Low Credenza Bookcase, Reading Couch & Armchair!
      const builders = [
        (s) => this.addWallTallBookshelf(room, s.side, s.u, Math.min(1.26, s.maxW)),
        (s) => this.addWallTallBookshelf(room, s.side, s.u, Math.min(1.26, s.maxW)),
        (s) => this.addWallLowBookcase(room, s.side, s.u, Math.min(1.34, s.maxW)),
        (s) => this.addWallArmchair(room, s.side, s.u, [168, 96, 78], [142, 76, 60]),
        (s) => this.addWallDisplayShelf(room, s.side, s.u, Math.min(1.18, s.maxW)),
        (s) => this.addWallCouch(room, s.side, s.u, [132, 92, 68], [110, 74, 52], false),
      ];
      wallSlots.slice(0, builders.length).forEach((slot, idx) => builders[idx](slot));
    } else if (t === 'kitchen') {
      // 1. Primary Wall: Fitted Kitchen Counter (Sink, Faucet, Stove Cooktop) + Tall Retro Refrigerator flush against wall!
      this.addWallKitchenCounterAndFridge(room, primarySpan.side, primarySpan.uMid);

      // 2. Other Walls: Kitchen Pantry & Dishware Hutch Shelf + Side Prep Counter Bookcase flush against walls!
      const builders = [
        (s) => this.addWallDisplayShelf(room, s.side, s.u, Math.min(1.2, s.maxW)),
        (s) => this.addWallLowBookcase(room, s.side, s.u, Math.min(1.28, s.maxW)),
        (s) => this.addWallDresser(room, s.side, s.u, Math.min(1.2, s.maxW)),
      ];
      wallSlots.slice(0, builders.length).forEach((slot, idx) => builders[idx](slot));

      // 3. Center of the Kitchen: Center Kitchen Island with Overhang Butcher-Block Countertop & 2 Barstools!
      const ix = room.cx;
      const iz = room.cz;
      this.addBox(room, ix, 0.43, iz, 1.46, 0.86, 0.78, [76, 112, 134]);
      this.addBox(room, ix, 0.9, iz, 1.64, 0.08, 0.94, [248, 245, 238]);
      this.addBox(room, ix - 0.32, 0.96, iz + 0.06, 0.42, 0.04, 0.3, [196, 140, 86]);
      this.addBox(room, ix + 0.28, 0.98, iz - 0.04, 0.26, 0.08, 0.26, [224, 92, 74]);
      for (const stoolOffset of [-0.42, 0.42]) {
        const sx = ix + stoolOffset;
        const sz = iz - 0.56;
        this.addBox(room, sx, 0.28, sz, 0.14, 0.56, 0.14, [122, 82, 52]);
        this.addBox(room, sx, 0.595, sz, 0.34, 0.07, 0.34, [218, 128, 72]);
      }
      this.addCollider(ix, iz - 0.06, 0.84, 0.58, room.floor);
    } else if (t === 'playroom' || t === 'music' || t === 'loft' || t === 'sunroom') {
      // Primary Wall: Craft & Activity Desk flush against wall with Chair & Desk Lamp!
      this.addWallOfficeDesk(room, primarySpan.side, primarySpan.uMid);

      // Other Walls: Tall Bookshelf, Tiered Toy & Craft Cubby Shelf, Plush Lounge Couch, Cozy Armchair, Low Bookcase!
      const builders = [
        (s) => this.addWallDisplayShelf(room, s.side, s.u, Math.min(1.2, s.maxW)),
        (s) => this.addWallTallBookshelf(room, s.side, s.u, Math.min(1.24, s.maxW)),
        (s) => this.addWallCouch(room, s.side, s.u, [86, 162, 118], [68, 138, 96], false),
        (s) => this.addWallArmchair(room, s.side, s.u, [224, 148, 78], [196, 122, 58]),
        (s) => this.addWallLowBookcase(room, s.side, s.u, Math.min(1.32, s.maxW)),
      ];
      wallSlots.slice(0, builders.length).forEach((slot, idx) => builders[idx](slot));
    } else {
      // Foyer / Front Hallway: Entryway Console Table with Entry Table Lamp, Low Bookcase Credenza & Hallway Armchair flush against walls!
      this.addWallDresser(room, primarySpan.side, primarySpan.uMid, 1.22);
      this.addWallDeskLamp(room, primarySpan.side, primarySpan.uMid - 0.28, 0.26, 0.9, 'Entry Table Lamp');

      const builders = [
        (s) => this.addWallLowBookcase(room, s.side, s.u, Math.min(1.3, s.maxW)),
        (s) => this.addWallArmchair(room, s.side, s.u, [184, 92, 78], [156, 72, 60]),
        (s) => this.addWallTallBookshelf(room, s.side, s.u, Math.min(1.18, s.maxW)),
      ];
      wallSlots.slice(0, builders.length).forEach((slot, idx) => builders[idx](slot));
    }
  }

  addCollider(x, z, halfW, halfD, floor = 0) {
    this.colliders.push({
      floor,
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
    const upstairsRooms = nonFoyerRooms.filter((r) => r.floor === 1);
    const shuffledNonFoyer = this.rng.shuffle(nonFoyerRooms.length ? nonFoyerRooms : this.rooms);

    // If this house has a 2nd floor, make sure Goal 1 features an Upstairs room so kids get to go up the stairs!
    const r1 = (this.hasSecondFloor && upstairsRooms.length > 0)
      ? this.rng.pick(upstairsRooms)
      : shuffledNonFoyer[0];
    const targetRooms = [r1, ...shuffledNonFoyer.filter((r) => r !== r1)];
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

  getRoomAt(x, z, floor = 0) {
    // First check exact AABB bounds for variable-sized luxury rooms on the current floor
    for (const r of this.rooms) {
      if (r.floor === floor && x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) {
        return r;
      }
    }
    const gx = Math.round(x / this.roomSize);
    const gz = Math.round(z / this.roomSize);
    return (
      this.roomMap.get(this.gridKey(gx, gz, floor)) ||
      this.rooms.find((r) => r.floor === floor) ||
      this.rooms[0]
    );
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
      const by = room.baseY;
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
      if (p.y > by + this.wallHeight - 0.4) p.y = by + 0.4;
      if (p.y < by + 0.35) p.y = by + this.wallHeight - 0.45;
    }
  }

  // Test player movement against walls, doorways, and furniture colliders on the current floor
  canMoveTo(nx, nz, radius = 0.38, floor = 0) {
    // Find which room on `floor` contains (nx, nz) — supports variable-sized 1.5x & 2x luxury rooms!
    let room = null;
    for (const r of this.rooms) {
      if (r.floor === floor && nx >= r.minX && nx <= r.maxX && nz >= r.minZ && nz <= r.maxZ) {
        room = r;
        break;
      }
    }
    if (!room) {
      const gx = Math.round(nx / this.roomSize);
      const gz = Math.round(nz / this.roomSize);
      room = this.roomMap.get(this.gridKey(gx, gz, floor));
    }
    if (!room) return false;

    const halfDoor = this.doorWidth * 0.5 - radius * 0.72;
    const dc = room.doorCenters || { north: room.cx, south: room.cx, east: room.cz, west: room.cz };

    // Check North wall (+Z)
    if (nz + radius > room.maxZ) {
      if (!room.doors.north || Math.abs(nx - dc.north) > halfDoor) return false;
    }
    // Check South wall (-Z)
    if (nz - radius < room.minZ) {
      if (!room.doors.south || Math.abs(nx - dc.south) > halfDoor) return false;
    }
    // Check East wall (+X)
    if (nx + radius > room.maxX) {
      if (!room.doors.east || Math.abs(nz - dc.east) > halfDoor) return false;
    }
    // Check West wall (-X)
    if (nx - radius < room.minX) {
      if (!room.doors.west || Math.abs(nz - dc.west) > halfDoor) return false;
    }

    // Check furniture AABBs on the same floor
    for (const c of this.colliders) {
      if (c.floor !== floor) continue;
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

  // Find the best interactive target in front of the player (or hovered by mouse) on the active floor
  findNearestInteractive(cam, hoveredId = null) {
    const currentFloor = cam.floor || 0;
    if (hoveredId && this.interactiveById.has(hoveredId)) {
      const item = this.interactiveById.get(hoveredId);
      if (item.room.floor === currentFloor) {
        const dist = Math.hypot(item.x - cam.x, item.z - cam.z);
        if (dist <= 4.8) return item;
      }
    }

    const lookX = Math.sin(cam.yaw) * Math.cos(cam.pitch);
    const lookY = Math.sin(cam.pitch);
    const lookZ = Math.cos(cam.yaw) * Math.cos(cam.pitch);

    let bestItem = null;
    let bestScore = Infinity;

    for (const item of this.interactives) {
      if (item.room.floor !== currentFloor) continue;
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
  // Both 1st floor and 2nd floor rooms render simultaneously in true 3D depth order,
  // so looking up the stairwell from the 1st floor shows the 2nd floor ceiling/fan/rails,
  // and looking down the stairwell from the 2nd floor shows the 1st floor hallway below
  // while the 2nd-floor floorboards naturally occlude the stairs underneath them!
  collectRenderPrimitives(pushPoly, pushSprite, hoverTarget, camera, setCurrentRoom = () => {}) {
    const hoverId = hoverTarget ? hoverTarget.id : null;
    const activeFloor = camera.floor || 0;

    for (const room of this.rooms) {
      const dxAABB = Math.max(0, room.minX - camera.x, camera.x - room.maxX);
      const dyAABB = Math.max(
        0,
        room.baseY - camera.y,
        camera.y - (room.baseY + this.wallHeight)
      );
      const dzAABB = Math.max(0, room.minZ - camera.z, camera.z - room.maxZ);
      const distRoom = Math.hypot(dxAABB, dyAABB, dzAABB);
      if (distRoom > 18.5) continue;

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
      const dist = Math.hypot(item.x - camera.x, item.y - camera.y, item.z - camera.z);
      if (dist > 17.5) continue;
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

    // Emit subtle warm golden dust motes ONLY when a room's fan is actively spinning
    for (const p of this.breezeParticles) {
      if (p.room.floor !== activeFloor) continue;
      const cVel = p.room.ceilingFan ? p.room.ceilingFan.currentAngularVel : 0;
      const pVel = p.room.portableFan ? p.room.portableFan.currentAngularVel : 0;
      if (cVel + pVel < 1.5) continue;

      const dist = Math.hypot(p.x - camera.x, p.z - camera.z);
      if (dist > 7.5) continue;
      setCurrentRoom(p.room);

      pushSprite(
        p.x, p.y, p.z,
        p.size * 0.45,
        'rgba(255, 244, 200, 0.35)',
        { alpha: 0.35 }
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

  // High-Resolution Woven Rectangular Area Rug: Scales with luxury room size!
  emitHighResRug(room, pushPoly) {
    const { cz, theme, baseY } = room;
    const hasStairwell = room.hasStairsUp || room.hasStairsDown;
    const cx = hasStairwell ? room.cx + 0.55 : room.cx;
    const scaleW = (room.sizeX || this.roomSize) / this.roomSize;
    const scaleD = (room.sizeZ || this.roomSize) / this.roomSize;
    const rugW = (hasStairwell ? 1.15 : 1.68) * Math.min(1.65, scaleW);
    const rugD = 1.42 * Math.min(1.65, scaleD);

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
          { x: cx - rugW - fringeLen, y: baseY + 0.012, z: tz0 },
          { x: cx - rugW - fringeLen, y: baseY + 0.012, z: tz1 },
          { x: cx - rugW, y: baseY + 0.012, z: tz1 },
          { x: cx - rugW, y: baseY + 0.012, z: tz0 },
        ],
        cream,
        { x: 0, y: 1, z: 0 },
        { layer: 2, lineWidth: 0 }
      );
      // East (+X) fringe tufts
      pushPoly(
        [
          { x: cx + rugW, y: baseY + 0.012, z: tz0 },
          { x: cx + rugW, y: baseY + 0.012, z: tz1 },
          { x: cx + rugW + fringeLen, y: baseY + 0.012, z: tz1 },
          { x: cx + rugW + fringeLen, y: baseY + 0.012, z: tz0 },
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
          { x: cx - hw, y: baseY + 0.015, z: cz - hd },
          { x: cx - hw, y: baseY + 0.015, z: cz + hd },
          { x: cx + hw, y: baseY + 0.015, z: cz + hd },
          { x: cx + hw, y: baseY + 0.015, z: cz - hd },
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
          { x: sx0, y: baseY + 0.017, z: cz - fieldD },
          { x: sx0, y: baseY + 0.017, z: cz + fieldD },
          { x: sx1, y: baseY + 0.017, z: cz + fieldD },
          { x: sx1, y: baseY + 0.017, z: cz - fieldD },
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
        { x: cx, y: baseY + 0.019, z: cz - 0.2 },
        { x: cx - 0.28, y: baseY + 0.019, z: cz },
        { x: cx, y: baseY + 0.019, z: cz + 0.2 },
        { x: cx + 0.28, y: baseY + 0.019, z: cz },
      ],
      goldAccent,
      { x: 0, y: 1, z: 0 },
      { layer: 2, strokeStyle: 'rgba(255, 250, 235, 0.65)', lineWidth: 1.0 }
    );
  }

  emitRoomGeometry(room, pushPoly) {
    const { minX, maxX, minZ, maxZ, cx, cz, theme, baseY } = room;
    const roomW = maxX - minX;
    const roomD = maxZ - minZ;
    const H = this.wallHeight;
    const dc = room.doorCenters || { north: cx, south: cx, east: cz, west: cz };

    // 1. High-Resolution Textured Floor: Mosaic Ceramic Tile (Kitchen) or Fine-Strip Hardwood Planks with Multi-Ribbon Wood Grain!
    if (theme.type === 'kitchen') {
      const tileStepsX = Math.max(14, Math.round(roomW / 0.5));
      const tileStepsZ = Math.max(14, Math.round(roomD / 0.5));
      const stepX = roomW / tileStepsX;
      const stepZ = roomD / tileStepsZ;
      const groutColor = 'rgba(124, 118, 108, 0.48)';
      for (let ix = 0; ix < tileStepsX; ix++) {
        for (let iz = 0; iz < tileStepsZ; iz++) {
          const x0 = minX + ix * stepX;
          const x1 = x0 + stepX;
          const z0 = minZ + iz * stepZ;
          const z1 = z0 + stepZ;
          const isAlt = (ix + iz) % 2 === 0;
          const jitter = this.hash2D(ix * 11, iz * 19) * 5;
          const tileColor = isAlt
            ? this.tintColor(theme.floorColor, 10 + jitter)
            : this.tintColor(theme.floorColor, -18 + jitter);

          pushPoly(
            [
              { x: x0, y: baseY, z: z0 },
              { x: x0, y: baseY, z: z1 },
              { x: x1, y: baseY, z: z1 },
              { x: x1, y: baseY, z: z0 },
            ],
            tileColor,
            { x: 0, y: 1, z: 0 },
            { layer: 0, strokeStyle: groutColor, lineWidth: 0.85 }
          );
        }
      }
    } else {
      // High-Resolution Narrow Hardwood Floorboards (~0.30m planks across variable-width rooms!)
      const numStrips = Math.max(24, Math.round(roomW / 0.3));
      const stripW = roomW / numStrips;
      const plankSeamColor = 'rgba(54, 32, 16, 0.5)';

      for (let s = 0; s < numStrips; s++) {
        const x0 = minX + s * stripW;
        const x1 = x0 + stripW;

        // If this is the 2nd Floor Upstairs Landing (hasStairsDown), check if this strip overlaps the stairwell X range!
        const isStairOpeningStrip =
          room.hasStairsDown &&
          this.stairwell &&
          x1 > this.stairwell.minX + 0.02 &&
          x0 < this.stairwell.maxX - 0.02;

        // 4 staggered plank joint patterns scaled proportionally across roomD
        const staggerType = s % 4;
        let fracs;
        if (staggerType === 0) {
          fracs = [0, 0.25, 0.52, 0.77, 1.0];
        } else if (staggerType === 1) {
          fracs = [0, 0.15, 0.4, 0.65, 0.87, 1.0];
        } else if (staggerType === 2) {
          fracs = [0, 0.3, 0.58, 0.82, 1.0];
        } else {
          fracs = [0, 0.2, 0.45, 0.7, 1.0];
        }
        let joints = fracs.map((f) => minZ + f * roomD);

        // CRITICAL FIX: For strips overlapping the stairwell opening, insert EXACT joints at zBottom and zTop
        // so the floorboards on the top landing (z >= zTop) and south gallery (z <= zBottom) are 100% solid right up to the top step!
        if (isStairOpeningStrip) {
          const zb = this.stairwell.zBottom;
          const zt = this.stairwell.zTop;
          const filtered = joints.filter((z) => z <= zb - 0.15 || z >= zt + 0.15);
          filtered.push(zb, zt);
          filtered.sort((a, b) => a - b);
          joints = filtered;
        }

        for (let p = 0; p < joints.length - 1; p++) {
          const z0 = joints[p];
          const z1 = joints[p + 1];
          const midZ = (z0 + z1) * 0.5;

          // Only skip the plank segment that is strictly INSIDE the stairwell opening [zBottom, zTop]!
          if (
            isStairOpeningStrip &&
            midZ > this.stairwell.zBottom + 0.02 &&
            midZ < this.stairwell.zTop - 0.02
          ) {
            continue;
          }
          const hVal = this.hash2D(room.gx * 31 + s * 7, room.gz * 29 + p * 13);
          const variation = hVal * 21;
          const plankColor = this.tintColor(theme.floorColor, variation);

          // Base plank board (Layer 0)
          pushPoly(
            [
              { x: x0, y: baseY, z: z0 },
              { x: x0, y: baseY, z: z1 },
              { x: x1, y: baseY, z: z1 },
              { x: x1, y: baseY, z: z0 },
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
              { x: r1x0, y: baseY + 0.002, z: r1z0 },
              { x: r1x0 + stripW * 0.05, y: baseY + 0.002, z: r1z1 },
              { x: r1x1 + stripW * 0.05, y: baseY + 0.002, z: r1z1 },
              { x: r1x1, y: baseY + 0.002, z: r1z0 },
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
              { x: r2x0, y: baseY + 0.003, z: r2z0 },
              { x: r2x0 - stripW * 0.04, y: baseY + 0.003, z: r2z1 },
              { x: r2x1 - stripW * 0.04, y: baseY + 0.003, z: r2z1 },
              { x: r2x1, y: baseY + 0.003, z: r2z0 },
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
                { x: kx - kw, y: baseY + 0.004, z: kz - kd },
                { x: kx - kw, y: baseY + 0.004, z: kz + kd },
                { x: kx + kw, y: baseY + 0.004, z: kz + kd },
                { x: kx + kw, y: baseY + 0.004, z: kz - kd },
              ],
              this.tintColor(plankColor, -26),
              { x: 0, y: 1, z: 0 },
              { layer: 1, lineWidth: 0 }
            );
          }
        }
      }
    }

    // High-Resolution Woven Patterned Area Rug (skip the rug in the Kitchen and in the Grand Staircase Hall!)
    if (!room.hasStairsUp && !room.hasStairsDown && theme.type !== 'kitchen') {
      this.emitHighResRug(room, pushPoly);
    }

    // 2. Coffered Ceiling Panels with Recessed Acoustic/Plaster Tiles & Exposed Wooden Ceiling Beams!
    const ceilColor = [242, 239, 232];
    const ceilStepsX = Math.max(6, Math.round(roomW / 1.2));
    const ceilStepsZ = Math.max(6, Math.round(roomD / 1.2));
    const cStepX = roomW / ceilStepsX;
    const cStepZ = roomD / ceilStepsZ;
    for (let ix = 0; ix < ceilStepsX; ix++) {
      for (let iz = 0; iz < ceilStepsZ; iz++) {
        const x0 = minX + ix * cStepX;
        const x1 = x0 + cStepX;
        const z0 = minZ + iz * cStepZ;
        const z1 = z0 + cStepZ;

        // Leave 1st-floor ceiling open strictly inside the center staircase stairwell [zBottom, zTop]!
        const midX = (x0 + x1) * 0.5;
        const midZ = (z0 + z1) * 0.5;
        if (
          room.hasStairsUp &&
          this.stairwell &&
          midX > this.stairwell.minX - 0.1 &&
          midX < this.stairwell.maxX + 0.1 &&
          midZ > this.stairwell.zBottom - 0.1 &&
          midZ < this.stairwell.zTop + 0.1
        ) {
          continue;
        }

        const tone = ((ix + iz) % 2 === 0) ? 3 : -3;

        pushPoly(
          [
            { x: x0, y: baseY + H, z: z0 },
            { x: x1, y: baseY + H, z: z0 },
            { x: x1, y: baseY + H, z: z1 },
            { x: x0, y: baseY + H, z: z1 },
          ],
          this.tintColor(ceilColor, tone),
          { x: 0, y: -1, z: 0 },
          { layer: 0, strokeStyle: 'rgba(185, 178, 165, 0.55)', lineWidth: 1.1 }
        );
      }
    }

    // Exposed Wooden Ceiling Rafter Beams running across the ceiling (skip in the 1st-floor Staircase Hall so beams never cross the open stairwell!)
    if (!room.hasStairsUp) {
      const beamColor = [132, 94, 64];
      const beamW = roomW - 0.08;
      for (const bz of [minZ + roomD * 0.25, maxZ - roomD * 0.25]) {
        this.emitBox(pushPoly, cx, baseY + H - 0.06, bz, beamW, 0.12, 0.16, beamColor, { layer: 2 });
      }
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
        { x: u0, y: baseY + v0, z: maxZ },
        { x: u0, y: baseY + v1, z: maxZ },
        { x: u1, y: baseY + v1, z: maxZ },
        { x: u1, y: baseY + v0, z: maxZ },
      ],
      minX, maxX, dc.north, hd, dh, H
    );

    // SOUTH WALL (-Z, normal 0, 0, 1)
    this.emitWallSide(
      pushPoly,
      room.doors.south,
      theme.wallColor,
      { x: 0, y: 0, z: 1 },
      (u0, u1, v0, v1) => [
        { x: u1, y: baseY + v0, z: minZ },
        { x: u1, y: baseY + v1, z: minZ },
        { x: u0, y: baseY + v1, z: minZ },
        { x: u0, y: baseY + v0, z: minZ },
      ],
      minX, maxX, dc.south, hd, dh, H
    );

    // EAST WALL (+X, normal -1, 0, 0)
    this.emitWallSide(
      pushPoly,
      room.doors.east,
      theme.wallColor,
      { x: -1, y: 0, z: 0 },
      (u0, u1, v0, v1) => [
        { x: maxX, y: baseY + v0, z: u1 },
        { x: maxX, y: baseY + v1, z: u1 },
        { x: maxX, y: baseY + v1, z: u0 },
        { x: maxX, y: baseY + v0, z: u0 },
      ],
      minZ, maxZ, dc.east, hd, dh, H
    );

    // WEST WALL (-X, normal 1, 0, 0)
    this.emitWallSide(
      pushPoly,
      room.doors.west,
      theme.wallColor,
      { x: 1, y: 0, z: 0 },
      (u0, u1, v0, v1) => [
        { x: minX, y: baseY + v0, z: u0 },
        { x: minX, y: baseY + v1, z: u0 },
        { x: minX, y: baseY + v1, z: u1 },
        { x: minX, y: baseY + v0, z: u1 },
      ],
      minZ, maxZ, dc.west, hd, dh, H
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
    // Bottom (-Y) so elevated boxes (ceiling beams, fan motor housings, window frames, monitors) are solid from underneath!
    pushPoly(
      [{ x: x0, y: y0, z: z1 }, { x: x0, y: y0, z: z0 }, { x: x1, y: y0, z: z0 }, { x: x1, y: y0, z: z1 }],
      color, { x: 0, y: -1, z: 0 }, options
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
    const { x, y, z, bladeAngle, speed, room } = fan;
    const by = room.baseY;
    const boxOpts = { interactiveId: fan.id, highlight: isHovered };
    const bladeOpts = { interactiveId: fan.id, highlight: isHovered, doubleSided: true };

    // Downrod & Motor Housing (single-sided 3D boxes with non-overlapping Y ranges!)
    this.emitBox(pushPoly, x, by + this.wallHeight - 0.14, z, 0.1, 0.28, 0.1, [85, 72, 62], boxOpts);
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
    const { x, z, speed, bladeAngle, room } = fan;
    const by = room.baseY;
    // Box faces must stay single-sided so back faces don't fight with front faces!
    const boxOpts = { interactiveId: fan.id, highlight: isHovered };
    const bladeOpts = { interactiveId: fan.id, highlight: isHovered, doubleSided: true };

    // Base & vertical pole (separated cleanly without overlapping Y ranges)
    this.emitBox(pushPoly, x, by + 0.06, z, 0.46, 0.12, 0.46, [68, 78, 96], boxOpts);
    this.emitBox(pushPoly, x, by + 0.58, z, 0.1, 0.92, 0.1, [195, 205, 220], boxOpts);

    // Oscillating Head
    const headYaw = fan.baseYaw + Math.sin(fan.oscillatePhase) * 0.55;
    const dirX = Math.cos(headYaw);
    const dirZ = Math.sin(headYaw);
    const perpX = -dirZ;
    const perpZ = dirX;
    const hy = by + 1.17;

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

    // Remove floating blue circles above standing fans! Only show a text label if hovered.
    if (isHovered) {
      pushSprite(x, hy + 0.34, z, 0.01, 'rgba(0,0,0,0)', {
        interactiveId: fan.id,
        label: `🌬️ ${FAN_SPEED_LABELS[speed]}`,
      });
    }
  }

  emitBoxFan(pushPoly, pushSprite, fan, isHovered) {
    const { x, z, speed, bladeAngle, room } = fan;
    const by = room.baseY;
    const boxOpts = { interactiveId: fan.id, highlight: isHovered };
    const bladeOpts = { interactiveId: fan.id, highlight: isHovered, doubleSided: true };
    const hy = by + 0.42;

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

    // Physical rotary speed switch knob on top of the Box Fan (instead of a floating blue circle!)
    const knobColor = speed > 0 ? [56, 217, 255] : [245, 238, 220];
    this.emitBox(pushPoly, x, hy + 0.34, z, 0.1, 0.05, 0.1, knobColor, {
      ...boxOpts,
      emissive: speed > 0,
    });
    if (isHovered) {
      pushSprite(x, hy + 0.42, z, 0.01, 'rgba(0,0,0,0)', {
        interactiveId: fan.id,
        label: `🧊 ${FAN_SPEED_LABELS[speed]}`,
      });
    }
  }

  emitFloorLamp(pushPoly, pushSprite, lamp, isHovered) {
    const { x, z, isOn, room } = lamp;
    const by = room.baseY;
    const opts = { interactiveId: lamp.id, highlight: isHovered };

    // Base & Brass Pole
    this.emitBox(pushPoly, x, by + 0.04, z, 0.38, 0.08, 0.38, [96, 76, 56], opts);
    this.emitBox(pushPoly, x, by + 0.72, z, 0.07, 1.32, 0.07, [204, 164, 88], opts);

    // Warm Lampshade
    const shadeColor = isOn ? [255, 226, 138] : [215, 206, 188];
    this.emitBox(pushPoly, x, by + 1.44, z, 0.44, 0.38, 0.44, shadeColor, {
      ...opts,
      emissive: isOn,
    });

    if (isOn) {
      pushSprite(x, by + 1.44, z, 0.65, 'rgba(255, 205, 100, 0.5)', {
        glow: true,
        interactiveId: lamp.id,
      });
    }
  }

  emitStairMarker(pushPoly, pushSprite, stair, isHovered) {
    const isUp = stair.direction === 'up';
    pushSprite(
      stair.x,
      stair.y + 0.65,
      stair.z,
      0.095,
      isUp ? '#38d9ff' : '#ffb72b',
      {
        interactiveId: stair.id,
        label: isUp
          ? '🪜 UPSTAIRS (2nd Floor) — Walk Here or Click!'
          : '🪜 DOWNSTAIRS (1st Floor) — Walk Here or Click!',
      }
    );
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

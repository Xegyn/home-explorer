// Main Game Loop, Controls (Keyboard + Mouse + Touch D-Pad + USB/Bluetooth Gamepad),
// Interactive Fan/Light Toggling, Checklist Evaluation, and Floorplan Minimap!

import { Cozy3DRenderer } from './renderer.js?v=4';
import { ProceduralHouse, FAN_SPEED_LABELS } from './house.js?v=4';
import { sound } from './audio.js?v=4';

class HouseExplorerGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new Cozy3DRenderer(this.canvas);

    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');

    // UI Elements
    this.elHouseTitle = document.getElementById('house-title');
    this.elCurrentRoom = document.getElementById('current-room');
    this.elLightsCount = document.getElementById('lights-count');
    this.elFansCount = document.getElementById('fans-count');
    this.elChecklistItems = document.getElementById('checklist-items');
    this.elExitBanner = document.getElementById('exit-unlocked-banner');
    this.elPrompt = document.getElementById('interaction-prompt');
    this.elPromptIcon = document.getElementById('prompt-icon');
    this.elPromptTitle = document.getElementById('prompt-title');
    this.elPromptState = document.getElementById('prompt-state');
    this.elReticle = document.getElementById('reticle');
    this.elGamepadIndicator = document.getElementById('gamepad-indicator');

    this.welcomeDialog = document.getElementById('welcome-dialog');
    this.victoryDialog = document.getElementById('victory-dialog');

    // Game State
    this.levelNumber = 1;
    this.house = null;
    this.hoverTarget = null;
    this.mousePickedId = null;
    this.pointerScreenPos = { x: window.innerWidth * 0.5, y: window.innerHeight * 0.5 };
    this.usingMouseHover = false;

    // Input State
    this.keys = new Set();
    this.touchMoves = new Set();
    this.isDraggingLook = false;
    this.dragMovedDistance = 0;
    this.lastPointer = { x: 0, y: 0 };
    this.stepTimer = 0;
    this.gamepadPrevButtons = [];

    this.bindEvents();
    this.startNewHouse(1);

    // Show welcome modal on first launch
    if (typeof this.welcomeDialog.showModal === 'function') {
      this.welcomeDialog.showModal();
    }

    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  startNewHouse(levelNumber) {
    this.levelNumber = levelNumber;
    this.house = new ProceduralHouse(levelNumber, Date.now() + levelNumber * 997);

    // Spawn player in the Foyer (0, 0) looking North into the house
    this.renderer.camera.x = 0;
    this.renderer.camera.y = 1.55;
    this.renderer.camera.z = -1.25;
    this.renderer.camera.yaw = 0;
    this.renderer.camera.pitch = 0.04;

    this.elHouseTitle.textContent = this.house.houseName;
    this.elExitBanner.hidden = true;
    this.buildChecklistDOM();
    this.evaluateChecklist(true);
  }

  buildChecklistDOM() {
    this.elChecklistItems.innerHTML = '';
    for (const task of this.house.checklist) {
      const li = document.createElement('li');
      li.className = 'checklist-item';
      li.id = `task_${task.id}`;
      li.innerHTML = `
        <span class="check-box" aria-hidden="true"></span>
        <span class="task-title">${task.title}</span>
        <span class="task-progress" id="prog_${task.id}"></span>
      `;
      this.elChecklistItems.appendChild(li);
    }
  }

  evaluateChecklist(silent = false) {
    let allDone = true;
    let newlyCompletedTask = false;

    for (const task of this.house.checklist) {
      const res = task.check();
      const li = document.getElementById(`task_${task.id}`);
      const prog = document.getElementById(`prog_${task.id}`);
      const box = li ? li.querySelector('.check-box') : null;

      if (res.done && !task.completed) {
        task.completed = true;
        newlyCompletedTask = true;
      } else if (!res.done && task.completed) {
        task.completed = false;
      }

      if (!res.done) allDone = false;

      if (li) {
        li.classList.toggle('completed', res.done);
        if (box) box.textContent = res.done ? '✓' : '';
      }
      if (prog) {
        prog.textContent = res.progress;
      }
    }

    const wasUnlocked = this.house.exitUnlocked;
    this.house.exitUnlocked = allDone;
    this.elExitBanner.hidden = !allDone;

    if (!silent) {
      if (allDone && !wasUnlocked) {
        sound.playHouseCleared();
      } else if (newlyCompletedTask) {
        sound.playTaskComplete();
      }
    }

    // Update top-left counters
    const counts = this.house.getCounts();
    this.elLightsCount.textContent = `${counts.lightsOn} / ${counts.lightsTotal}`;
    this.elFansCount.textContent = `${counts.fansOn} / ${counts.fansTotal}`;
  }

  // Trigger interaction on a Fan, Light, Wall Switch, Pull-Chain, or Exit Door
  interactWith(target) {
    if (!target) return;

    if (target.kind === 'fan') {
      target.speed = (target.speed + 1) % 4;
      target.chainSwing = 1.0;
      sound.playFanSpeed(target.speed);
    } else if (target.kind === 'light') {
      target.isOn = !target.isOn;
      sound.playSwitch(target.isOn);
    } else if (target.kind === 'switch_light') {
      target.targetLight.isOn = !target.targetLight.isOn;
      sound.playSwitch(target.targetLight.isOn);
    } else if (target.kind === 'switch_fan') {
      const fan = target.targetFan;
      fan.speed = (fan.speed + 1) % 4;
      fan.chainSwing = 1.0;
      sound.playFanSpeed(fan.speed);
    } else if (target.kind === 'exit') {
      if (this.house.exitUnlocked) {
        this.showVictoryModal();
      } else {
        sound.playSwitch(false);
      }
      return;
    }

    this.evaluateChecklist(false);
    this.updateInteractionPrompt();
  }

  showVictoryModal() {
    sound.playHouseCleared();
    const counts = this.house.getCounts();
    document.getElementById('victory-title').textContent = `House #${this.levelNumber} Complete!`;
    document.getElementById('victory-stats').innerHTML = `
      <div class="victory-stat-box">🏠 Rooms Explored: <strong>${this.house.rooms.length}</strong></div>
      <div class="victory-stat-box">🌀 Fans Spinning: <strong>${counts.fansOn} / ${counts.fansTotal}</strong></div>
      <div class="victory-stat-box">💡 Lights Glowing: <strong>${counts.lightsOn} / ${counts.lightsTotal}</strong></div>
    `;
    if (typeof this.victoryDialog.showModal === 'function' && !this.victoryDialog.open) {
      this.victoryDialog.showModal();
    }
  }

  describeInteractiveState(item) {
    if (!item) return '';
    if (item.kind === 'fan') {
      const nextSpeed = FAN_SPEED_LABELS[(item.speed + 1) % 4];
      return `Speed: ${FAN_SPEED_LABELS[item.speed]}  (Next → ${nextSpeed})`;
    }
    if (item.kind === 'light') {
      return `Light is ${item.isOn ? 'ON 🌟' : 'OFF 🌑'}`;
    }
    if (item.kind === 'switch_light') {
      return `Ceiling Light: ${item.targetLight.isOn ? 'ON 🌟' : 'OFF 🌑'}`;
    }
    if (item.kind === 'switch_fan') {
      return `Ceiling Fan Speed: ${FAN_SPEED_LABELS[item.targetFan.speed]}`;
    }
    if (item.kind === 'exit') {
      return this.house.exitUnlocked
        ? '🎉 UNLOCKED! Click or press SPACE to enter Next House!'
        : '🔒 Finish the House Helper Goals on the right first!';
    }
    return '';
  }

  updateInteractionPrompt() {
    const target = this.hoverTarget;
    if (!target) {
      this.elPrompt.hidden = true;
      this.elReticle.classList.remove('reticle-active');
      return;
    }

    this.elPrompt.hidden = false;
    this.elReticle.classList.add('reticle-active');
    this.elPromptIcon.textContent = target.icon;
    this.elPromptTitle.textContent = target.name;
    this.elPromptState.textContent = this.describeInteractiveState(target);
  }

  bindEvents() {
    // Keyboard listeners
    window.addEventListener('keydown', (e) => {
      if (this.welcomeDialog.open || this.victoryDialog.open) {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          if (this.welcomeDialog.open) this.welcomeDialog.close();
          if (this.victoryDialog.open) {
            this.victoryDialog.close();
            this.startNewHouse(this.levelNumber + 1);
          }
        }
        return;
      }

      this.keys.add(e.code);

      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (this.hoverTarget) {
          this.interactWith(this.hoverTarget);
        }
      } else if (e.code === 'KeyF') {
        this.toggleFlashlight();
      } else if (e.code === 'KeyN') {
        this.startNewHouse(this.levelNumber + 1);
      } else if (e.code === 'KeyH') {
        if (!this.welcomeDialog.open) this.welcomeDialog.showModal();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    // Mouse / Touch Look & Direct Click-to-Interact on 3D Fans, Pull-Chains, Switches & Lamps!
    this.canvas.addEventListener('pointerdown', (e) => {
      sound.init();
      this.isDraggingLook = true;
      this.dragMovedDistance = 0;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.pointerScreenPos = { x: e.clientX, y: e.clientY };
      this.usingMouseHover = true;
    });

    window.addEventListener('pointermove', (e) => {
      this.pointerScreenPos = { x: e.clientX, y: e.clientY };
      this.usingMouseHover = true;

      if (!this.isDraggingLook) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.dragMovedDistance += Math.hypot(dx, dy);
      this.lastPointer = { x: e.clientX, y: e.clientY };

      this.renderer.camera.yaw += dx * 0.0045;
      this.renderer.camera.pitch = Math.max(
        -0.75,
        Math.min(0.85, this.renderer.camera.pitch - dy * 0.0038)
      );
    });

    window.addEventListener('pointerup', (e) => {
      if (this.isDraggingLook && this.dragMovedDistance < 10) {
        // Direct click/tap on a 3D fixture!
        const clickedId = this.renderer.render(this.house, this.hoverTarget, {
          x: e.clientX,
          y: e.clientY,
        });
        if (clickedId && this.house.interactiveById.has(clickedId)) {
          const item = this.house.interactiveById.get(clickedId);
          this.hoverTarget = item;
          this.interactWith(item);
        }
      }
      this.isDraggingLook = false;
    });

    // Clicking the bottom interaction banner also triggers the current target
    this.elPrompt.addEventListener('click', () => {
      if (this.hoverTarget) this.interactWith(this.hoverTarget);
    });

    // HUD Action Buttons
    document.getElementById('btn-interact').addEventListener('click', () => {
      if (this.hoverTarget) this.interactWith(this.hoverTarget);
    });

    document.getElementById('btn-flashlight').addEventListener('click', () => {
      this.toggleFlashlight();
    });

    document.getElementById('btn-new-house').addEventListener('click', () => {
      sound.playSwitch(true);
      this.startNewHouse(this.levelNumber + 1);
    });

    document.getElementById('btn-help').addEventListener('click', () => {
      if (!this.welcomeDialog.open) this.welcomeDialog.showModal();
    });

    document.getElementById('btn-start-game').addEventListener('click', () => {
      sound.init();
      sound.playSwitch(true);
      this.welcomeDialog.close();
    });

    document.getElementById('btn-next-level').addEventListener('click', () => {
      sound.playSwitch(true);
      this.victoryDialog.close();
      this.startNewHouse(this.levelNumber + 1);
    });

    // On-screen D-Pad buttons (great for iPad or kid mouse play)
    const dpadButtons = document.querySelectorAll('.dpad-btn');
    dpadButtons.forEach((btn) => {
      const dir = btn.dataset.move;
      const startMove = (e) => {
        e.preventDefault();
        sound.init();
        this.touchMoves.add(dir);
        btn.classList.add('active');
      };
      const stopMove = () => {
        this.touchMoves.delete(dir);
        btn.classList.remove('active');
      };
      btn.addEventListener('pointerdown', startMove);
      btn.addEventListener('pointerup', stopMove);
      btn.addEventListener('pointerleave', stopMove);
      btn.addEventListener('pointercancel', stopMove);
    });

    // USB / Bluetooth Gamepad connection events
    window.addEventListener('gamepadconnected', () => {
      this.elGamepadIndicator.hidden = false;
    });
    window.addEventListener('gamepaddisconnected', () => {
      this.elGamepadIndicator.hidden = true;
    });
  }

  toggleFlashlight() {
    this.renderer.camera.flashlightOn = !this.renderer.camera.flashlightOn;
    sound.playSwitch(this.renderer.camera.flashlightOn);
    const btn = document.getElementById('btn-flashlight');
    btn.style.borderColor = this.renderer.camera.flashlightOn ? '#ffb72b' : '';
  }

  updateMovement(dt) {
    if (this.welcomeDialog.open || this.victoryDialog.open) return;

    const cam = this.renderer.camera;
    let moveForward = 0;
    let moveStrafe = 0;
    let turnYaw = 0;
    let lookPitch = 0;

    // Keyboard WASD (Walk & Strafe) + Arrow Keys (Look Left/Right/Up/Down)
    if (this.keys.has('KeyW') || this.touchMoves.has('forward')) {
      moveForward += 1;
    }
    if (this.keys.has('KeyS') || this.touchMoves.has('backward')) {
      moveForward -= 1;
    }
    if (this.keys.has('KeyA')) {
      moveStrafe -= 1;
    }
    if (this.keys.has('KeyD')) {
      moveStrafe += 1;
    }
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyQ') || this.touchMoves.has('turnLeft')) {
      turnYaw -= 1;
    }
    if (this.keys.has('ArrowRight') || this.keys.has('KeyE') || this.touchMoves.has('turnRight')) {
      turnYaw += 1;
    }
    if (this.keys.has('ArrowUp')) {
      lookPitch += 1;
    }
    if (this.keys.has('ArrowDown')) {
      lookPitch -= 1;
    }

    // Poll USB / Bluetooth Gamepad (Xbox, PlayStation DualSense, Switch Pro)
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = gamepads[0];
    if (gp) {
      this.elGamepadIndicator.hidden = false;
      const deadzone = 0.16;
      const lx = Math.abs(gp.axes[0]) > deadzone ? gp.axes[0] : 0;
      const ly = Math.abs(gp.axes[1]) > deadzone ? gp.axes[1] : 0;
      const rx = Math.abs(gp.axes[2]) > deadzone ? gp.axes[2] : 0;
      const ry = Math.abs(gp.axes[3]) > deadzone ? gp.axes[3] : 0;

      moveStrafe += lx;
      moveForward -= ly;
      turnYaw += rx * 1.25;
      lookPitch -= ry * 0.9;

      // Button 0 (A / Cross) -> Interact with Fan/Light
      const btnA = gp.buttons[0]?.pressed;
      if (btnA && !this.gamepadPrevButtons[0] && this.hoverTarget) {
        this.interactWith(this.hoverTarget);
      }
      // Button 1 (B / Circle) or Y -> Toggle Flashlight
      const btnY = gp.buttons[3]?.pressed;
      if (btnY && !this.gamepadPrevButtons[3]) {
        this.toggleFlashlight();
      }
      this.gamepadPrevButtons[0] = btnA;
      this.gamepadPrevButtons[3] = btnY;
    }

    // Apply turning
    if (turnYaw !== 0) {
      cam.yaw += turnYaw * 2.1 * dt;
      this.usingMouseHover = false;
    }
    if (lookPitch !== 0) {
      cam.pitch = Math.max(-0.75, Math.min(0.85, cam.pitch + lookPitch * 1.6 * dt));
    }

    // Apply walking with smooth wall sliding collision
    const walkSpeed = 3.25;
    const sinY = Math.sin(cam.yaw);
    const cosY = Math.cos(cam.yaw);

    const vx = (sinY * moveForward + cosY * moveStrafe) * walkSpeed * dt;
    const vz = (cosY * moveForward - sinY * moveStrafe) * walkSpeed * dt;

    let moved = false;
    if (Math.abs(vx) > 0.0001) {
      if (this.house.canMoveTo(cam.x + vx, cam.z)) {
        cam.x += vx;
        moved = true;
      }
    }
    if (Math.abs(vz) > 0.0001) {
      if (this.house.canMoveTo(cam.x, cam.z + vz)) {
        cam.z += vz;
        moved = true;
      }
    }

    // Gentle head-bob and footstep sound while walking
    if (moved) {
      this.stepTimer += dt;
      cam.y = 1.55 + Math.sin(this.stepTimer * 11) * 0.032;
      if (this.stepTimer > 0.44) {
        this.stepTimer = 0;
        sound.playStep();
      }

      // If all checklist goals are complete and the kid walks right up to the glowing Front Exit Door, celebrate!
      if (this.house.exitUnlocked && this.house.exitDoor) {
        const distToExit = Math.hypot(
          cam.x - this.house.exitDoor.x,
          cam.z - this.house.exitDoor.z
        );
        if (distToExit < 1.15 && !this.victoryDialog.open) {
          this.showVictoryModal();
        }
      }
    } else {
      cam.y += (1.55 - cam.y) * Math.min(1, dt * 8);
    }

    // Update current room indicator badge
    const room = this.house.getRoomAt(cam.x, cam.z);
    if (room) {
      this.elCurrentRoom.textContent = `${room.icon} ${room.name}`;
    }
  }

  drawMinimap() {
    const ctx = this.minimapCtx;
    const W = this.minimapCanvas.width;
    const H = this.minimapCanvas.height;
    ctx.clearRect(0, 0, W, H);

    // Find bounding box of all rooms to center the floorplan
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const r of this.house.rooms) {
      minX = Math.min(minX, r.minX);
      maxX = Math.max(maxX, r.maxX);
      minZ = Math.min(minZ, r.minZ);
      maxZ = Math.max(maxZ, r.maxZ);
    }

    const span = Math.max(maxX - minX, maxZ - minZ) + 3;
    const scale = (W - 20) / span;
    const centerX = (minX + maxX) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;

    // Map world (x, z) to minimap (mx, my) — North (+Z) is UP on the minimap
    const toMap = (wx, wz) => ({
      x: W * 0.5 + (wx - centerX) * scale,
      y: H * 0.5 - (wz - centerZ) * scale,
    });

    // Draw rooms
    for (const r of this.house.rooms) {
      const p0 = toMap(r.minX, r.maxZ);
      const rw = (r.maxX - r.minX) * scale;
      const rh = (r.maxZ - r.minZ) * scale;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.11)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.fillRect(p0.x + 1, p0.y + 1, rw - 2, rh - 2);
      ctx.strokeRect(p0.x + 1, p0.y + 1, rw - 2, rh - 2);
    }

    // Draw interactive fans, lights, and exit door dots
    for (const item of this.house.interactives) {
      const pt = toMap(item.x, item.z);
      ctx.beginPath();
      if (item.kind === 'fan') {
        ctx.fillStyle = item.speed > 0 ? '#38d9ff' : 'rgba(56, 217, 255, 0.35)';
        ctx.arc(pt.x, pt.y, item.speed > 0 ? 4.5 : 3, 0, Math.PI * 2);
      } else if (item.kind === 'light') {
        ctx.fillStyle = item.isOn ? '#ffb72b' : 'rgba(255, 183, 43, 0.35)';
        ctx.arc(pt.x + 3, pt.y + 3, item.isOn ? 4 : 2.5, 0, Math.PI * 2);
      } else if (item.kind === 'exit') {
        ctx.fillStyle = this.house.exitUnlocked ? '#3ddc84' : '#ff6b6b';
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
      }
      ctx.fill();
    }

    // Draw Player Arrow
    const cam = this.renderer.camera;
    const pPt = toMap(cam.x, cam.z);
    ctx.save();
    ctx.translate(pPt.x, pPt.y);
    ctx.rotate(cam.yaw);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.updateMovement(dt);
    this.house.update(dt);

    // Find hovered or look-targeted fan/light/switch
    const testPt = this.usingMouseHover ? this.pointerScreenPos : null;
    this.mousePickedId = this.renderer.render(this.house, this.hoverTarget, testPt);
    this.hoverTarget = this.house.findNearestInteractive(
      this.renderer.camera,
      this.mousePickedId
    );
    this.updateInteractionPrompt();
    this.drawMinimap();

    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new HouseExplorerGame();
});

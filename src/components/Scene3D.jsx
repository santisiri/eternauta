import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import Stats from 'three/examples/jsm/libs/stats.module';

class InfiniteGround {
    constructor(scene, textureUrl) {
        this.scene = scene;
        this.tiles = new Map(); // Store active tiles
        this.tileSize = 40;
        this.loadTexture(textureUrl);
    }

    loadTexture(url) {
        const textureLoader = new THREE.TextureLoader();
        this.texture = textureLoader.load(url);
        this.texture.wrapS = THREE.RepeatWrapping;
        this.texture.wrapT = THREE.RepeatWrapping;
        this.texture.repeat.set(4, 4); // Each tile will have 4x4 texture repetitions
    }

    createTile(x, z) {
        const geometry = new THREE.PlaneGeometry(this.tileSize, this.tileSize);
        const material = new THREE.MeshStandardMaterial({
            map: this.texture,
            roughness: 0.8,
            metalness: 0.1
        });

        const tile = new THREE.Mesh(geometry, material);
        tile.rotation.x = -Math.PI / 2;
        tile.position.set(
            x * this.tileSize,
            0,
            z * this.tileSize
        );
        tile.receiveShadow = true;
        this.scene.add(tile);
        return tile;
    }

    update(playerPosition) {
        // Convert player position to tile coordinates
        const tileX = Math.floor(playerPosition.x / this.tileSize);
        const tileZ = Math.floor(playerPosition.z / this.tileSize);
        
        // Generate tiles in a 5x5 grid around player
        for (let x = tileX - 2; x <= tileX + 2; x++) {
            for (let z = tileZ - 2; z <= tileZ + 2; z++) {
                const key = `${x},${z}`;
                if (!this.tiles.has(key)) {
                    this.tiles.set(key, this.createTile(x, z));
                }
            }
        }

        // Remove tiles that are too far from the player
        for (const [key, tile] of this.tiles.entries()) {
            const [x, z] = key.split(',').map(Number);
            if (Math.abs(x - tileX) > 3 || Math.abs(z - tileZ) > 3) {
                this.scene.remove(tile);
                this.tiles.delete(key);
            }
        }
    }
}

class SnowSystem {
    constructor(scene) {
        this.scene = scene;
        this.particles = null;
        this.init();
    }

    init() {
        const particleGeometry = new THREE.BufferGeometry();
        const particleCount = 3000; // Increased particle count
        const posArray = new Float32Array(particleCount * 3);
        
        for(let i = 0; i < particleCount * 3; i += 3) {
            posArray[i] = (Math.random() - 0.5) * 150;    // Wider x range
            posArray[i + 1] = Math.random() * 50;         // Higher y range
            posArray[i + 2] = (Math.random() - 0.5) * 150; // Wider z range
        }
        
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
        
        const particleMaterial = new THREE.PointsMaterial({
            size: 0.2, // Increased from 0.15 to 0.2 for larger snowflakes
            color: 0xffffff,
            transparent: true,
            opacity: 0.9, // Increased from 0.8 to 0.9 for more visible snow
            blending: THREE.AdditiveBlending
        });
        
        this.particles = new THREE.Points(particleGeometry, particleMaterial);
        this.scene.add(this.particles);
    }

    update(playerPosition) {
        if (!this.particles) return;
        
        const positions = this.particles.geometry.attributes.position.array;
        for(let i = 0; i < positions.length; i += 3) {
            // Move particles down
            positions[i + 1] -= 0.02; // Increased fall speed
            
            // Reset particles that fall below ground
            if(positions[i + 1] < 0) {
                // Reset around player position
                positions[i] = playerPosition.x + (Math.random() - 0.5) * 150;
                positions[i + 1] = 50;
                positions[i + 2] = playerPosition.z + (Math.random() - 0.5) * 150;
            }
            
            // Add slight horizontal movement
            positions[i] += Math.sin(Date.now() * 0.0005 + i) * 0.008;
            positions[i + 2] += Math.cos(Date.now() * 0.0005 + i) * 0.008;
        }
        
        this.particles.geometry.attributes.position.needsUpdate = true;
    }
}

class PlayerCharacter {
    constructor(scene, buildingSystem) {
        this.scene = scene;
        this.buildingSystem = buildingSystem;
        this.model = null;
        this.mixer = null;
        this.animations = {};
        this.currentAction = null;
        this.position = new THREE.Vector3(0, 2, 0);
        this.rotation = new THREE.Euler(0, 0, 0);
        this.moveSpeed = 0.05;
        this.rotateSpeed = 0.015;
        this.isMoving = false;
        this.isJumping = false;
        this.fps = 30;
        this.radius = 1.5;
        this.pendingMove = 0;
        this.baseHeight = 2;
        // Jump physics parameters
        this.jumpVelocity = new THREE.Vector3();
        this.jumpSpeed = 0.19;
        this.jumpForwardSpeed = 0.35;
        this.gravity = 0.006;
        this.jumpDuration = 0;
        this.maxJumpDuration = 90;
        this.landingHeight = 2; // Explicit landing height
    }

    async load() {
        const loader = new FBXLoader();
        
        try {
            const [idleModel, walkModel, jumpModel] = await Promise.all([
                loader.loadAsync('/assets/eternauta_idle.fbx'),
                loader.loadAsync('/assets/eternauta_walk.fbx'),
                loader.loadAsync('/assets/eternauta_jumping.fbx')
            ]);

            // Use the idle model as our base
            this.model = idleModel;
            
            // Scale and position the model
            this.model.scale.set(4, 4, 4);
            this.model.position.copy(this.position);
            
            // Make sure the model casts shadows and is well-lit
            this.model.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        child.material.needsUpdate = true;
                        child.material.side = THREE.DoubleSide;
                        child.material.emissive = new THREE.Color(0x333333);
                        child.material.emissiveIntensity = 0.2;
                    }
                }
            });

            this.scene.add(this.model);

            // Create animation mixer
            this.mixer = new THREE.AnimationMixer(this.model);

            // Store animations with adjusted timeScale
            if (idleModel.animations && idleModel.animations.length > 0) {
                const idleClip = idleModel.animations[0].clone();
                idleClip.tracks = idleClip.tracks.filter(track => !track.name.includes('position'));
                this.animations.idle = this.mixer.clipAction(idleClip);
                this.animations.idle.timeScale = (30/60) * 0.24;
                this.animations.idle.setLoop(THREE.LoopRepeat);
            }
            if (walkModel.animations && walkModel.animations.length > 0) {
                const walkClip = walkModel.animations[0].clone();
                walkClip.tracks = walkClip.tracks.filter(track => !track.name.includes('position'));
                this.animations.walk = this.mixer.clipAction(walkClip);
                this.animations.walk.timeScale = (30/60) * 0.24;
                this.animations.walk.setLoop(THREE.LoopRepeat);
            }
            if (jumpModel.animations && jumpModel.animations.length > 0) {
                const jumpClip = jumpModel.animations[0].clone();
                jumpClip.tracks = jumpClip.tracks.filter(track => !track.name.includes('position'));
                this.animations.jump = this.mixer.clipAction(jumpClip);
                this.animations.jump.timeScale = (30/60) * 0.24;
                this.animations.jump.setLoop(THREE.LoopOnce);
                this.animations.jump.clampWhenFinished = true;
            }

            // Set up initial animation
            if (this.animations.idle) {
                this.currentAction = this.animations.idle;
                this.currentAction.play();
            }

            return this.model;
        } catch (error) {
            console.error('Error loading character models:', error);
            throw error;
        }
    }

    update(deltaTime) {
        if (this.mixer) {
            const adjustedDeltaTime = deltaTime * (this.fps / 60);
            this.mixer.update(adjustedDeltaTime);
        }

        // Update jumping state
        if (this.isJumping) {
            this.jumpDuration++;
            
            // Apply gravity
            this.jumpVelocity.y -= this.gravity;
            
            // Calculate new position
            const newPosition = this.position.clone();
            newPosition.y += this.jumpVelocity.y;
            
            // Move forward during jump with variable speed
            const forwardVector = new THREE.Vector3();
            const jumpProgress = this.jumpDuration / this.maxJumpDuration;
            const currentForwardSpeed = this.jumpForwardSpeed * (1 - jumpProgress * 0.7);
            forwardVector.setFromSpherical(new THREE.Spherical(
                currentForwardSpeed,
                Math.PI / 2,
                this.rotation.y
            ));
            newPosition.add(forwardVector);

            // Check for collisions before updating position
            if (!this.buildingSystem?.checkCollision(newPosition, this.radius)) {
                this.position.copy(newPosition);
                this.model.position.copy(this.position);
            } else {
                // If collision detected, bounce back and end jump
                this.jumpVelocity.y = -this.jumpVelocity.y * 0.5;
                this.isJumping = false;
                this.jumpDuration = 0;
                this.position.y = this.landingHeight;
                this.model.position.y = this.landingHeight;
                this.setAnimation(this.isMoving ? 'walk' : 'idle');
            }

            // Check if landed or hit max duration
            if (this.position.y <= this.landingHeight || this.jumpDuration >= this.maxJumpDuration) {
                this.position.y = this.landingHeight;
                this.model.position.y = this.landingHeight;
                this.isJumping = false;
                this.jumpDuration = 0;
                this.setAnimation(this.isMoving ? 'walk' : 'idle');
            }
        }
    }

    move(direction) {
        if (!this.model) return;
        
        // Store the movement direction
        this.pendingMove = direction;
        
        // Only update position if we're actually moving
        if (this.isMoving) {
            this.updatePosition();
        }
    }

    updatePosition() {
        const moveVector = new THREE.Vector3();
        moveVector.setFromSpherical(new THREE.Spherical(
            this.moveSpeed,
            Math.PI / 2,
            this.rotation.y
        ));
        
        // Calculate new position
        const newPosition = this.position.clone().add(moveVector.multiplyScalar(this.pendingMove));
        newPosition.y = this.position.y; // Keep the same height

        // Check for collisions before updating position
        if (!this.buildingSystem?.checkCollision(newPosition, this.radius)) {
            this.position.copy(newPosition);
            this.model.position.copy(this.position);
        }
    }

    rotate(direction) {
        if (!this.model) return;
        
        this.rotation.y += direction * this.rotateSpeed;
        this.model.rotation.y = this.rotation.y;
    }

    setAnimation(animationName) {
        if (!this.animations[animationName] || !this.currentAction) return;
        if (this.currentAction === this.animations[animationName]) return;

        const newAction = this.animations[animationName];
        const oldAction = this.currentAction;

        // Update movement state
        this.isMoving = animationName === 'walk';

        // If we're starting to move, update position immediately
        if (this.isMoving && this.pendingMove !== 0) {
            this.updatePosition();
        }

        // Ensure smooth transition between animations
        newAction.reset();
        newAction.setLoop(animationName === 'jump' ? THREE.LoopOnce : THREE.LoopRepeat);
        if (animationName === 'jump') {
            newAction.clampWhenFinished = true;
        }
        newAction.play();
        newAction.crossFadeFrom(oldAction, 0.2, true);
        this.currentAction = newAction;
    }

    jump() {
        if (!this.isJumping) {
            this.isJumping = true;
            this.jumpDuration = 0;
            this.setAnimation('jump');
            
            // Initialize jump velocity
            this.jumpVelocity.set(0, this.jumpSpeed, 0);
        }
    }
}

class CameraController {
    constructor(camera, target) {
        this.camera = camera;
        this.target = target;
        this.offset = new THREE.Vector3(0, 3, 8);
        this.smoothFactor = 0.1;
        this.baseHeight = 2; // Base height for the target
    }

    update() {
        if (!this.target || !this.target.position) return;
        
        // Calculate desired camera position
        const desiredPosition = new THREE.Vector3();
        // Use base height for vertical position to prevent camera shake
        const targetPosition = this.target.position.clone();
        targetPosition.y = this.baseHeight;
        desiredPosition.copy(targetPosition).add(this.offset);

        // Smoothly move camera
        this.camera.position.lerp(desiredPosition, this.smoothFactor);

        // Make camera look at target (using base height)
        this.camera.lookAt(targetPosition);
    }
}

class InputController {
    constructor() {
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false
        };
        this.jumpPressed = false; // Track if jump was already triggered
        this.setupEventListeners();
    }

    setupEventListeners() {
        window.addEventListener('keydown', (e) => this.onKeyDown(e));
        window.addEventListener('keyup', (e) => this.onKeyUp(e));
    }

    onKeyDown(event) {
        switch (event.code) {
            case 'KeyW': this.keys.forward = true; break;
            case 'KeyS': this.keys.backward = true; break;
            case 'KeyA': this.keys.left = true; break;
            case 'KeyD': this.keys.right = true; break;
            case 'Space': 
                this.keys.jump = true;
                // Only trigger jump if it wasn't already pressed
                if (!this.jumpPressed) {
                    this.jumpPressed = true;
                }
                break;
        }
    }

    onKeyUp(event) {
        switch (event.code) {
            case 'KeyW': this.keys.forward = false; break;
            case 'KeyS': this.keys.backward = false; break;
            case 'KeyA': this.keys.left = false; break;
            case 'KeyD': this.keys.right = false; break;
            case 'Space': 
                this.keys.jump = false;
                this.jumpPressed = false; // Reset jump pressed state when space is released
                break;
        }
    }

    update(player) {
        if (!player) return;
        
        if (this.keys.forward) player.move(1);
        if (this.keys.backward) player.move(-1);
        if (this.keys.left) player.rotate(1);
        if (this.keys.right) player.rotate(-1);
        
        // Only trigger jump if space was just pressed
        if (this.keys.jump && this.jumpPressed && !player.isJumping) {
            player.jump();
            this.jumpPressed = false; // Reset jump pressed state after triggering jump
        }

        // Update animation state (only if not jumping)
        if (!player.isJumping) {
            const isMoving = this.keys.forward || this.keys.backward;
            player.setAnimation(isMoving ? 'walk' : 'idle');
        }
    }
}

class BuildingSystem {
    constructor(scene) {
        this.scene = scene;
        this.buildings = new Map(); // Store active buildings
        this.buildingModels = []; // Array to store multiple building models
        this.gridSize = 25; // Reduced to place buildings closer
        this.buildingSpacing = 12; // Reduced spacing between buildings
        this.buildingChance = 0.8; // Increased chance of building spawn
        this.loadedCells = new Set(); // Track which cells have been processed
        this.collisionBoxes = new Map(); // Store collision boxes for each building
    }

    async loadBuildingModel() {
        const loader = new FBXLoader();
        try {
            // Load both building models
            const [building00, building01] = await Promise.all([
                loader.loadAsync('/assets/building_00.fbx'),
                loader.loadAsync('/assets/building_01.fbx')
            ]);

            // Set up both building models with enhanced lighting
            [building00, building01].forEach(model => {
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        if (child.material) {
                            child.material.needsUpdate = true;
                            // Enhanced material properties for better visibility
                            child.material.metalness = 0.2;
                            child.material.roughness = 0.8;
                            child.material.emissive = new THREE.Color(0x222222);
                            child.material.emissiveIntensity = 0.1;
                            child.material.envMapIntensity = 1.0;
                            child.material.side = THREE.DoubleSide;
                        }
                    }
                });
            });

            this.buildingModels = [building00, building01];
            console.log('Building models loaded successfully');
        } catch (error) {
            console.error('Error loading building models:', error);
        }
    }

    createBuilding(x, z) {
        if (!this.buildingModels.length) {
            console.log('Building models not loaded yet');
            return null;
        }

        // Randomly select a building model
        const buildingIndex = Math.floor(Math.random() * this.buildingModels.length);
        const buildingModel = this.buildingModels[buildingIndex];
        const building = buildingModel.clone();
        
        // Random rotation (0, 90, 180, or 270 degrees)
        const rotation = Math.floor(Math.random() * 4) * (Math.PI / 2);
        
        // Random scale variation (much larger than before)
        const baseScale = 25; // Increased base scale for buildings
        const scaleVar = 0.9 + Math.random() * 0.2; // 90% to 110% of base scale
        const finalScale = baseScale * scaleVar;
        building.scale.set(finalScale, finalScale, finalScale);

        // Random position within the grid cell (with some offset from edges)
        const offsetX = (Math.random() - 0.5) * (this.gridSize - this.buildingSpacing);
        const offsetZ = (Math.random() - 0.5) * (this.gridSize - this.buildingSpacing);
        
        // Different heights for different building types
        const buildingHeight = buildingIndex === 1 ? 6.8 : 6.47; // building_01 is 5% higher
        
        // Position the building
        const buildingPosition = new THREE.Vector3(
            x * this.gridSize + offsetX,
            buildingHeight,
            z * this.gridSize + offsetZ
        );
        
        building.position.copy(buildingPosition);
        building.rotation.y = rotation;
        
        // Create collision box for the building (adjusted for each building type)
        const boxSize = finalScale * 0.8; // Increased from 0.6 to 0.8 for tighter collision
        const boxHeight = buildingIndex === 1 ? boxSize * 1.4 : boxSize * 1.2; // Taller collision box for building_01
        const boxGeometry = new THREE.BoxGeometry(boxSize, boxHeight, boxSize);
        const boxMaterial = new THREE.MeshBasicMaterial({ 
            visible: false,
            side: THREE.DoubleSide 
        });
        const collisionBox = new THREE.Mesh(boxGeometry, boxMaterial);
        collisionBox.position.copy(buildingPosition); // Use the same position as building
        collisionBox.rotation.y = rotation; // Match building rotation
        this.scene.add(collisionBox);
        
        // Add the building to the scene
        this.scene.add(building);
        console.log('Created building at:', building.position);
        return { building, collisionBox, buildingIndex };
    }

    checkCollision(playerPosition, playerRadius) {
        for (const [key, { collisionBox, buildingIndex }] of this.buildings.entries()) {
            const buildingPosition = collisionBox.position;
            const buildingSize = collisionBox.geometry.parameters.width / 2;
            
            // Calculate distance between player and building center
            const dx = playerPosition.x - buildingPosition.x;
            const dz = playerPosition.z - buildingPosition.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            // Different collision buffers for different building types
            const collisionBuffer = buildingIndex === 1 ? 0.5 : 0.02;
            
            // Check if player is too close to building
            if (distance < (buildingSize + playerRadius + collisionBuffer)) {
                return true; // Collision detected
            }
        }
        return false; // No collision
    }

    update(playerPosition) {
        // Convert player position to grid coordinates
        const gridX = Math.floor(playerPosition.x / this.gridSize);
        const gridZ = Math.floor(playerPosition.z / this.gridSize);
        
        // Generate buildings in a 4x4 grid around player (closer buildings)
        for (let x = gridX - 2; x <= gridX + 2; x++) {
            for (let z = gridZ - 2; z <= gridZ + 2; z++) {
                const key = `${x},${z}`;
                
                // If we haven't processed this cell yet
                if (!this.loadedCells.has(key) && !this.buildings.has(key)) {
                    this.loadedCells.add(key);
                    
                    // Random chance to place a building
                    if (Math.random() < this.buildingChance) {
                        // Don't place buildings too close to the origin (player spawn)
                        const distanceFromOrigin = Math.sqrt(x * x + z * z);
                        if (distanceFromOrigin > 0.3) { // Allow buildings even closer to spawn
                            const buildingData = this.createBuilding(x, z);
                            if (buildingData) {
                                this.buildings.set(key, buildingData);
                            }
                        }
                    }
                }
            }
        }

        // Remove buildings that are too far from the player
        for (const [key, { building, collisionBox }] of this.buildings.entries()) {
            const [x, z] = key.split(',').map(Number);
            if (Math.abs(x - gridX) > 3 || Math.abs(z - gridZ) > 3) {
                this.scene.remove(building);
                this.scene.remove(collisionBox);
                this.buildings.delete(key);
            }
        }
    }
}

export default function Scene3D() {
    const containerRef = useRef();
    const sceneRef = useRef();
    const playerRef = useRef();
    const cameraRef = useRef();
    const cameraControllerRef = useRef();
    const inputControllerRef = useRef();
    const mixerRef = useRef();
    const clockRef = useRef();
    const snowSystemRef = useRef();
    const groundSystemRef = useRef();
    const buildingSystemRef = useRef();
    const statsRef = useRef();

    useEffect(() => {
        // Initialize scene with denser fog
        const scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x666666, 0.035); // Increased from 0.025 to 0.035 for denser fog
        sceneRef.current = scene;

        // Initialize stats
        const stats = new Stats();
        statsRef.current = stats;
        stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3: custom
        containerRef.current.appendChild(stats.dom);

        // Initialize camera with adjusted position
        const camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        camera.position.set(0, 3, 8);
        cameraRef.current = camera;

        // Initialize renderer with better shadows
        const renderer = new THREE.WebGLRenderer({ 
            antialias: true,
            powerPreference: "high-performance"
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        THREE.ColorManagement.enabled = true;
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        containerRef.current.appendChild(renderer.domElement);

        // Enhanced lighting setup
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.0); // Increased from 0.8
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 2.0); // Increased from 1.5
        directionalLight.position.set(5, 10, 5);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        directionalLight.shadow.camera.near = 0.5;
        directionalLight.shadow.camera.far = 50;
        directionalLight.shadow.bias = -0.0001;
        
        // Adjust shadow camera frustum
        directionalLight.shadow.camera.left = -15; // Increased from -10
        directionalLight.shadow.camera.right = 15; // Increased from 10
        directionalLight.shadow.camera.top = 15; // Increased from 10
        directionalLight.shadow.camera.bottom = -15; // Increased from -10
        
        scene.add(directionalLight);

        // Add some rim lighting
        const rimLight = new THREE.DirectionalLight(0x6699ff, 1.0); // Increased from 0.8
        rimLight.position.set(-5, 3, -5);
        scene.add(rimLight);

        // Add a spotlight to follow the character
        const spotLight = new THREE.SpotLight(0xffffff, 1.0);
        spotLight.position.set(0, 10, 0);
        spotLight.angle = Math.PI / 4;
        spotLight.penumbra = 0.1;
        spotLight.decay = 1;
        spotLight.distance = 50;
        spotLight.castShadow = true;
        scene.add(spotLight);

        // Initialize infinite ground system
        groundSystemRef.current = new InfiniteGround(scene, '/assets/floor.png');

        // Initialize snow system
        snowSystemRef.current = new SnowSystem(scene);

        // Initialize building system
        buildingSystemRef.current = new BuildingSystem(scene);
        buildingSystemRef.current.loadBuildingModel();

        // Initialize controllers
        const player = new PlayerCharacter(scene, buildingSystemRef.current);
        playerRef.current = player;
        
        const inputController = new InputController();
        inputControllerRef.current = inputController;

        // Initialize clock for animation timing
        const clock = new THREE.Clock();
        clockRef.current = clock;

        // Load player model and set up camera
        player.load().then(model => {
            const cameraController = new CameraController(camera, model);
            cameraControllerRef.current = cameraController;
        });

        // Animation loop
        function animate() {
            requestAnimationFrame(animate);

            stats.begin();

            const deltaTime = clock.getDelta();
            
            // Update player and animations
            if (playerRef.current && playerRef.current.model) {
                inputControllerRef.current.update(playerRef.current);
                playerRef.current.update(deltaTime);

                // Update spotlight position to follow character
                spotLight.position.set(
                    playerRef.current.model.position.x,
                    10,
                    playerRef.current.model.position.z
                );
                spotLight.target = playerRef.current.model;

                // Update all systems with player position
                const playerPosition = playerRef.current.model.position;
                groundSystemRef.current.update(playerPosition);
                snowSystemRef.current.update(playerPosition);
                buildingSystemRef.current.update(playerPosition);
            }

            // Update camera
            if (cameraControllerRef.current) {
                cameraControllerRef.current.update();
            }

            renderer.render(scene, camera);

            stats.end();
        }

        // Handle window resize
        function onWindowResize() {
            camera.aspect = window.innerWidth / window.innerHeight;
            camera.updateProjectionMatrix();
            renderer.setSize(window.innerWidth, window.innerHeight);
        }

        window.addEventListener('resize', onWindowResize);
        animate();

        // Cleanup
        return () => {
            window.removeEventListener('resize', onWindowResize);
            containerRef.current?.removeChild(renderer.domElement);
            if (statsRef.current) {
                containerRef.current?.removeChild(statsRef.current.dom);
            }
        };
    }, []);

    return <div ref={containerRef} style={{ width: '100%', height: '100vh' }} />;
} 
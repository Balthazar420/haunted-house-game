import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
// GSAP is loaded via the script tag in index.html, no import needed

// --- Basic Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x101010);
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.8;
document.body.appendChild(renderer.domElement);

// --- Lighting ---
const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2.0);
camera.add(hemisphereLight);
const flashlight = new THREE.PointLight(0xffffff, 10, 30);
camera.add(flashlight);

// --- Audio ---
const listener = new THREE.AudioListener();
camera.add(listener);
const audioLoader = new THREE.AudioLoader();
let thunderSound, footstepSound;

// --- Player and Controls Setup ---
const controls = new PointerLockControls(camera, document.body);
document.body.addEventListener('click', () => { controls.lock(); });
scene.add(controls.getObject());

// --- Keyboard Input State ---
const keys = { w: false, a: false, s: false, d: false, ' ': false };
let spaceKeyPressed = false;
document.addEventListener('keydown', (event) => { if (event.key.toLowerCase() in keys) keys[event.key.toLowerCase()] = true; });
document.addEventListener('keyup', (event) => { if (event.key.toLowerCase() in keys) keys[event.key.toLowerCase()] = false; });

// --- Physics and Collision ---
const collidableObjects = [];
const playerRaycaster = new THREE.Raycaster();
const moveSpeed = 4.0;
const clock = new THREE.Clock();
const gravity = 30.0;
let playerVelocityY = 0;
const playerHeight = 1.8;

// --- Interaction ---
const interactionRaycaster = new THREE.Raycaster();
let door;
let scaryFace;
let eventPlane, defaultMaterial, scareMaterial;
let isScarePlaying = false;

// --- Load Assets ---
const gltfLoader = new GLTFLoader();
gltfLoader.load('./Hauntus.glb', (gltf) => {
    const model = gltf.scene;
    scene.add(model);
    const levelMesh = model.getObjectByName('Level');
    if (levelMesh) collidableObjects.push(levelMesh);
    door = model.getObjectByName('door_1');
    if (door) {
        door.isOpen = false;
        collidableObjects.push(door);
    }
    scaryFace = model.getObjectByName('face_scare');
    if (scaryFace) {
        scaryFace.visible = false;
        setInterval(triggerLightning, 5000);
    }
    const spawnPoint = model.getObjectByName('player_spawn');
    if (spawnPoint) {
        controls.getObject().position.copy(spawnPoint.position);
    }
    eventPlane = model.getObjectByName('event_plane');
    if(eventPlane) {
        defaultMaterial = eventPlane.material;
        const textureLoader = new THREE.TextureLoader();
        textureLoader.load('./scare_image.jpg', (texture) => {
            texture.flipY = false; 
            scareMaterial = new THREE.MeshStandardMaterial({ map: texture });
        }); 
    }
}, undefined, (error) => { console.error("Error loading model:", error); });

audioLoader.load('thunder.mp3', (buffer) => {
    thunderSound = new THREE.Audio(listener);
    thunderSound.setBuffer(buffer);
    thunderSound.setVolume(0.5);
});

// Loading footstep.mp3
audioLoader.load('footstep.mp3', (buffer) => {
    footstepSound = new THREE.Audio(listener);
    footstepSound.setBuffer(buffer);
    footstepSound.setVolume(0.5);
    footstepSound.setLoop(true);
});


// --- Game Logic Functions ---
function triggerLightning() {
    if (isScarePlaying) return;
    isScarePlaying = true;
    if (thunderSound) {
        if (thunderSound.isPlaying) thunderSound.stop();
        thunderSound.play();
    }
    gsap.delayedCall(0.5, () => {
        if (!scaryFace) return;
        const lightning = new THREE.PointLight(0xffffff, 0, 50);
        lightning.position.set(scaryFace.position.x, scaryFace.position.y + 5, scaryFace.position.z + 5);
        scene.add(lightning);
        scaryFace.visible = true;
        gsap.to(lightning, { intensity: 200, duration: 0.05, yoyo: true, repeat: 1 });
        gsap.to(lightning, { intensity: 150, duration: 0.1, delay: 0.15, yoyo: true, repeat: 1 });
        if (eventPlane && scareMaterial) {
            eventPlane.material = scareMaterial;
        }
        gsap.delayedCall(0.5, (lightToRemove) => {
            if (scaryFace) scaryFace.visible = false;
            if (eventPlane && defaultMaterial) {
                eventPlane.material = defaultMaterial;
            }
            scene.remove(lightToRemove);
            isScarePlaying = false; 
        }, [scene.getObjectByProperty('isPointLight', true)]);
    });
}

function handleInteractions() {
    if (!door) return;
    interactionRaycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = interactionRaycaster.intersectObject(door);
    if (intersects.length > 0 && intersects[0].distance < 4) {
        if (keys[' '] && !spaceKeyPressed) {
            spaceKeyPressed = true;
            if (!door.isOpen) {
                gsap.to(door.rotation, { y: door.rotation.y + (Math.PI / 2), duration: 1.5, ease: "power2.inOut" });
                door.isOpen = true;
                const index = collidableObjects.indexOf(door);
                if (index > -1) collidableObjects.splice(index, 1);
            } else {
                gsap.to(door.rotation, { y: 0, duration: 1.5, ease: "power2.inOut" });
                door.isOpen = false;
                collidableObjects.push(door);
            }
        }
    }
    if (!keys[' ']) {
        spaceKeyPressed = false;
    }
}

function updateMovement(delta) {
    if (collidableObjects.length === 0) return;
    const playerPosition = controls.getObject().position;
    
    let onGround = false;
    const downRaycaster = new THREE.Raycaster(playerPosition, new THREE.Vector3(0, -1, 0));
    const verticalIntersections = downRaycaster.intersectObjects(collidableObjects, true);
    if (verticalIntersections.length > 0 && verticalIntersections[0].distance < playerHeight) {
        playerPosition.y = verticalIntersections[0].point.y + playerHeight;
        playerVelocityY = 0;
        onGround = true;
    }

    const isMoving = keys.w || keys.a || keys.s || keys.d;
    if (isMoving) {
        const forwardAmount = (keys.w ? 1 : 0) + (keys.s ? -1 : 0);
        const rightAmount = (keys.d ? 1 : 0) + (keys.a ? -1 : 0);
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        forward.y = 0;
        forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, camera.up).normalize();
        const moveVector = new THREE.Vector3().addScaledVector(forward, forwardAmount).addScaledVector(right, rightAmount).normalize().multiplyScalar(moveSpeed * delta);
        playerRaycaster.set(playerPosition, moveVector.clone().normalize());
        const horizontalIntersections = playerRaycaster.intersectObjects(collidableObjects, true);
        if (!horizontalIntersections.length || horizontalIntersections[0].distance > 0.5) {
            playerPosition.add(moveVector);
        }
    }
    
    playerVelocityY -= gravity * delta;
    playerPosition.y += playerVelocityY * delta;

    if (footstepSound) {
        if (isMoving && onGround) {
            if (!footstepSound.isPlaying) {
                footstepSound.play();
            }
        } else {
            if (footstepSound.isPlaying) {
                footstepSound.stop();
            }
        }
    }
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (controls.isLocked) {
        updateMovement(delta);
        handleInteractions();
    }
    renderer.render(scene, camera);
}
animate();

// --- Window Resize Handler ---
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
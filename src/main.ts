import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

interface Cell {
  i: number;
  j: number;
}

interface Coin {
  serial: number;
  cache: Cell;
}

interface Momento<T> {
  toMomento(): T;
  fromMomento(momento: T): void;
}

class Geocache implements Momento<string> {
  cell: Cell;
  coins: Coin[];

  constructor(cell: Cell, coins: Coin[]) {
    this.cell = cell;
    this.coins = coins;
  }

  toMomento() {
    return JSON.stringify(this.coins);
  }

  fromMomento(momento: string) {
    this.coins = JSON.parse(momento);
  }
}

const NULL_ISLAND = { lat: 0, lng: 0 };
const TILE_DEGREES = 0.0001;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

const map = leaflet.map(document.getElementById("map")!, {
  center: [36.98949379578401, -122.06277128548504],
  zoom: 19,
  minZoom: 19,
  maxZoom: 19,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution:
    '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

let playerCell = getCell(36.98949379578401, -122.06277128548504);
let playerMarker = leaflet.marker(cellToLatLng(playerCell)).addTo(map);
playerMarker.bindTooltip("That's you!");

let playerCoins: Coin[] = [];
let movementHistory: leaflet.LatLng[] = [cellToLatLng(playerCell)];
let polyline = leaflet.polyline(movementHistory, { color: 'blue' }).addTo(map);

const statusPanel = document.getElementById("statusPanel")!;

function getCell(lat: number, lng: number): Cell {
  return {
    i: Math.floor((lat - NULL_ISLAND.lat) / TILE_DEGREES),
    j: Math.floor((lng - NULL_ISLAND.lng) / TILE_DEGREES),
  };
}

function cellToLatLng(cell: Cell): leaflet.LatLng {
  return new leaflet.LatLng(cell.i * TILE_DEGREES, cell.j * TILE_DEGREES);
}

const cacheMemory: { [key: string]: Geocache } = {};

function spawnOrRestoreCache(i: number, j: number) {
  const key = `${i}:${j}`;
  let geocache: Geocache;

  if (cacheMemory[key]) {
    geocache = cacheMemory[key];
    geocache.fromMomento(geocache.toMomento());
  } else {
    const numCoins = Math.floor(luck([i, j, "initialCoins"].toString()) * 5 + 1);
    const coins: Coin[] = Array.from({ length: numCoins }, (_, serial) => ({
      serial,
      cache: { i, j },
    }));

    geocache = new Geocache({ i, j }, coins);

    cacheMemory[key] = geocache;
  }

  const cacheBounds = leaflet.latLngBounds([
    cellToLatLng({ i, j }),
    cellToLatLng({ i: i + 1, j: j + 1 }),
  ]);

  const cacheRect = leaflet.rectangle(cacheBounds).addTo(map);

  cacheRect.bindPopup(() => {
    const coinDisplay = geocache.coins
      .map((coin, idx) => `<span class="coin" data-idx="${idx}">${coin.cache.i}:${coin.cache.j}#${coin.serial}</span><br>`)
      .join("");
    const popupDiv = document.createElement("div");

    popupDiv.innerHTML = `
      <div>Cache at ${i},${j} with ${geocache.coins.length} coins.</div>
      ${coinDisplay}
      <button id="collect">Collect</button>
      <button id="deposit">Deposit</button>
    `;

    popupDiv.querySelectorAll(".coin").forEach(coinElement => {
      coinElement.addEventListener("click", (event) => {
        const idx = parseInt((<HTMLElement>event.target).dataset.idx!);
        const { cache } = geocache.coins[idx];
        const coinLatLng = cellToLatLng(cache);
        map.setView(coinLatLng);
      });
    });

    popupDiv.querySelector<HTMLButtonElement>("#collect")!.addEventListener("click", () => {
      if (geocache.coins.length > 0) {
        playerCoins.push(geocache.coins.pop()!);
        updateStatusPanel();
      }
    });

    popupDiv.querySelector<HTMLButtonElement>("#deposit")!.addEventListener("click", () => {
      if (playerCoins.length > 0) {
        geocache.coins.push(playerCoins.pop()!);
        updateStatusPanel();
      }
    });

    return popupDiv;
  });

  return geocache;
}

function updateStatusPanel() {
  statusPanel.innerHTML = `Coins: ${playerCoins
    .map((coin) => `<span>${coin.cache.i}:${coin.cache.j}#${coin.serial}</span>`)
    .join(", ")}`;
}

function movePlayer(dLat: number, dLng: number) {
  playerCell.i += dLat;
  playerCell.j += dLng;

  const newLatLng = cellToLatLng(playerCell);
  playerMarker.setLatLng(newLatLng);
  map.setView(newLatLng);

  movementHistory.push(newLatLng);
  polyline.setLatLngs(movementHistory);

  regenerateCaches();
}

function regenerateCaches() {
  map.eachLayer((layer: leaflet.Layer) => {
    if (layer instanceof leaflet.Rectangle) map.removeLayer(layer);
  });

  const startI = playerCell.i - NEIGHBORHOOD_SIZE;
  const startJ = playerCell.j - NEIGHBORHOOD_SIZE;
  const endI = playerCell.i + NEIGHBORHOOD_SIZE;
  const endJ = playerCell.j + NEIGHBORHOOD_SIZE;

  for (let i = startI; i < endI; i++) {
    for (let j = startJ; j < endJ; j++) {
      if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
        spawnOrRestoreCache(i, j);
      }
    }
  }
}

function saveGameState() {
  localStorage.setItem('playerCell', JSON.stringify(playerCell));
  localStorage.setItem('playerCoins', JSON.stringify(playerCoins));
  localStorage.setItem('cacheMemory', JSON.stringify(cacheMemory));
  localStorage.setItem('movementHistory', JSON.stringify(movementHistory));
}

function loadGameState() {
  const savedPlayerCell = localStorage.getItem('playerCell');
  const savedPlayerCoins = localStorage.getItem('playerCoins');
  const savedCacheMemory = localStorage.getItem('cacheMemory');
  const savedMovementHistory = localStorage.getItem('movementHistory');

  if (savedPlayerCell && savedPlayerCoins && savedCacheMemory && savedMovementHistory) {
    playerCell = JSON.parse(savedPlayerCell);
    playerCoins = JSON.parse(savedPlayerCoins);
    const savedCaches = JSON.parse(savedCacheMemory);
    Object.keys(savedCaches).forEach(key => {
      cacheMemory[key] = Object.assign(new Geocache({ i: 0, j: 0 }, []), savedCaches[key]);
    });
    movementHistory = JSON.parse(savedMovementHistory).map((latLng: [number, number]) => new leaflet.LatLng(latLng[0], latLng[1]));
    polyline.setLatLngs(movementHistory);
  }
}

function resetGameState() {
  if (confirm('Are you sure you want to erase your game state?')) {
    localStorage.clear();
    playerCell = getCell(36.98949379578401, -122.06277128548504);
    playerCoins = [];
    movementHistory = [cellToLatLng(playerCell)];
    polyline.setLatLngs(movementHistory);
    regenerateCaches();
  }
}

// Load saved game state if available
loadGameState();

// Facade pattern for geolocation
function enableGeolocation() {
  if ('geolocation' in navigator) {
    navigator.geolocation.watchPosition((position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      playerCell = getCell(lat, lng);
      movePlayer(0, 0);  // Update the player's position
    });
  }
}

// Add UI buttons
const controls = document.createElement("div");
controls.innerHTML = `
  <button id="up">⬆️</button>
  <button id="down">⬇️</button>
  <button id="left">⬅️</button>
  <button id="right">➡️</button>
  <button id="geo">🌐</button>
  <button id="reset">🚮</button>
`;

document.body.appendChild(controls);

document.getElementById("up")!.addEventListener("click", () => movePlayer(-1, 0));
document.getElementById("down")!.addEventListener("click", () => movePlayer(1, 0));
document.getElementById("left")!.addEventListener("click", () => movePlayer(0, -1));
document.getElementById("right")!.addEventListener("click", () => movePlayer(0, 1));
document.getElementById("geo")!.addEventListener("click", enableGeolocation);
document.getElementById("reset")!.addEventListener("click", resetGameState);

// Save game state periodically
setInterval(saveGameState, 5000);

// Initialize caches
regenerateCaches();
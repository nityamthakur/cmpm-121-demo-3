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

// Global Coordinate System anchored at Null Island
const NULL_ISLAND = { lat: 0, lng: 0 };
const TILE_DEGREES = 0.0001;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Initialize map
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

// Player marker
let playerCell = getCell(36.98949379578401, -122.06277128548504);
let playerMarker = leaflet.marker(cellToLatLng(playerCell)).addTo(map);
playerMarker.bindTooltip("That's you!");

let playerCoins: Coin[] = [];
const statusPanel = document.getElementById("statusPanel")!;

function getCell(lat: number, lng: number): Cell {
  return {
    i: Math.floor((lat - NULL_ISLAND.lat) / TILE_DEGREES),
    j: Math.floor((lng - NULL_ISLAND.lng) / TILE_DEGREES),
  };
}

function cellToLatLng(cell: Cell): [number, number] {
  return [cell.i * TILE_DEGREES, cell.j * TILE_DEGREES];
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
      .map((coin) => `${coin.cache.i}:${coin.cache.j}#${coin.serial}`)
      .join("<br>");
    const popupDiv = document.createElement("div");

    popupDiv.innerHTML = `
      <div>Cache at ${i},${j} with ${geocache.coins.length} coins.</div>
      <div>${coinDisplay}</div>
      <button id="collect">Collect</button>
      <button id="deposit">Deposit</button>
    `;

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
    .map((coin) => `${coin.cache.i}:${coin.cache.j}#${coin.serial}`)
    .join(", ")}`;
}

function movePlayer(dLat: number, dLng: number) {
  playerCell.i += dLat;
  playerCell.j += dLng;

  playerMarker.setLatLng(cellToLatLng(playerCell));

  map.setView(cellToLatLng(playerCell));

  regenerateCaches();
}

function regenerateCaches() {
  map.eachLayer((layer: leaflet.Layer) => { // Specify the type here
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

// Add buttons for movement
const controls = document.createElement("div");
controls.innerHTML = `
  <button id="up">⬆️</button>
  <button id="down">⬇️</button>
  <button id="left">⬅️</button>
  <button id="right">➡️</button>
`;

document.body.appendChild(controls);

document.getElementById("up")!.addEventListener("click", () => movePlayer(-1, 0));
document.getElementById("down")!.addEventListener("click", () => movePlayer(1, 0));
document.getElementById("left")!.addEventListener("click", () => movePlayer(0, -1));
document.getElementById("right")!.addEventListener("click", () => movePlayer(0, 1));

// Initialize caches
regenerateCaches();
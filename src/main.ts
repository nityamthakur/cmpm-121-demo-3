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

// Global Coordinate System anchored at Null Island
const NULL_ISLAND = { lat: 0, lng: 0 };
const TILE_DEGREES = 0.0001;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.1;

// Initialize Leaflet map
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
const playerMarker = leaflet.marker([36.98949379578401, -122.06277128548504]).addTo(map);
playerMarker.bindTooltip("That's you!");

let playerCoins: Coin[] = [];
const statusPanel = document.getElementById("statusPanel")!;

// Use the Flyweight pattern to convert lat-lng to game cells
function getCell(lat: number, lng: number): Cell {
  return {
    i: Math.floor((lat - NULL_ISLAND.lat) / TILE_DEGREES),
    j: Math.floor((lng - NULL_ISLAND.lng) / TILE_DEGREES),
  };
}

// Function to add caches with unique coins
function spawnCache(i: number, j: number) {
  const bounds = leaflet.latLngBounds([
    [i * TILE_DEGREES, j * TILE_DEGREES],
    [(i + 1) * TILE_DEGREES, (j + 1) * TILE_DEGREES],
  ]);

  const cache = leaflet.rectangle(bounds).addTo(map);

  let coins: Coin[] = [];
  const numCoins = Math.floor(luck([i, j, "initialCoins"].toString()) * 5 + 1);

  for (let serial = 0; serial < numCoins; serial++) {
    coins.push({ serial, cache: { i, j } });
  }

  cache.bindPopup(() => {
    const coinDisplay = coins
      .map((coin) => `${coin.cache.i}:${coin.cache.j}#${coin.serial}`)
      .join("<br>");
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>Cache at ${i},${j} with ${coins.length} coins.</div>
      <div>${coinDisplay}</div>
      <button id="collect">Collect</button>
      <button id="deposit">Deposit</button>
    `;

    const collectButton = popupDiv.querySelector<HTMLButtonElement>("#collect")!;
    const depositButton = popupDiv.querySelector<HTMLButtonElement>("#deposit")!;

    collectButton.addEventListener("click", () => {
      if (coins.length > 0) {
        playerCoins.push(coins.pop()!);
        updateStatusPanel();
      }
    });

    depositButton.addEventListener("click", () => {
      if (playerCoins.length > 0) {
        coins.push(playerCoins.pop()!);
        updateStatusPanel();
      }
    });

    return popupDiv;
  });
}

function updateStatusPanel() {
  statusPanel.innerHTML = `Coins: ${
    playerCoins.map((coin) => `${coin.cache.i}:${coin.cache.j}#${coin.serial}`).join(", ")
    }`;
}

// Generate caches based on player starting location
const playerStartCell = getCell(36.98949379578401, -122.06277128548504);

for (let i = playerStartCell.i - NEIGHBORHOOD_SIZE; i < playerStartCell.i + NEIGHBORHOOD_SIZE; i++) {
  for (let j = playerStartCell.j - NEIGHBORHOOD_SIZE; j < playerStartCell.j + NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(i, j);
    }
  }
}

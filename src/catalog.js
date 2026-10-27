'use strict';

// Catalog for the two built-in buying scenarios.
// Quantities are computed by the agent from scenario parameters
// (attendees for events, weekly covers for a cafe restock).
// `alt` describes a cheaper substitute the agent may swap in when
// the budget gate is under pressure.

const SCENARIOS = {
  'community-meetup': {
    label: 'Community meetup supplies',
    scaleLabel: 'attendees',
    items: [
      { id: 'coffee-urn',    name: 'Coffee urn rental (serves 50)',        category: 'Drinks',    unitPrice: 38.0, qty: (n) => Math.ceil(n / 50),  tier: 'essential', alt: { name: 'Two 12-cup drip brewers (borrowed-style budget pick)', unitPrice: 18.0 } },
      { id: 'coffee-beans',  name: 'Coffee beans, 2 lb bag',               category: 'Drinks',    unitPrice: 16.5, qty: (n) => Math.ceil(n / 25),  tier: 'essential' },
      { id: 'cups',          name: 'Compostable cups, pack of 50',         category: 'Supplies',  unitPrice: 9.0,  qty: (n) => Math.ceil(n / 50),  tier: 'essential' },
      { id: 'pastries',      name: 'Pastry box, dozen',                    category: 'Food',      unitPrice: 24.0, qty: (n) => Math.ceil(n / 12),  tier: 'standard',  alt: { name: 'Bakery day-old pastry box, dozen', unitPrice: 11.0 } },
      { id: 'fruit',         name: 'Fruit tray',                           category: 'Food',      unitPrice: 19.0, qty: (n) => Math.ceil(n / 20),  tier: 'standard' },
      { id: 'name-tags',     name: 'Name tags + markers, pack',            category: 'Supplies',  unitPrice: 7.5,  qty: () => 1,               tier: 'essential' },
      { id: 'signage',       name: 'Printed welcome signage set',          category: 'Supplies',  unitPrice: 14.0, qty: () => 1,               tier: 'nice',      alt: { name: 'Hand-lettered signage kit', unitPrice: 4.0 } },
      { id: 'speaker-gift',  name: 'Speaker thank-you gift card',          category: 'Thanks',    unitPrice: 25.0, qty: () => 1,               tier: 'nice' },
      { id: 'sparkling',     name: 'Sparkling water, 12-pack',             category: 'Drinks',    unitPrice: 8.5,  qty: (n) => Math.ceil(n / 24),  tier: 'standard' },
      { id: 'extension',     name: 'Extension cord + power strip',         category: 'Gear',      unitPrice: 21.0, qty: () => 1,               tier: 'standard' },
    ],
  },
  'cafe-restock': {
    label: 'Small cafe weekly restock',
    scaleLabel: 'weekly covers',
    items: [
      { id: 'milk',          name: 'Whole milk, gallon',                   category: 'Dairy',     unitPrice: 4.6,  qty: (n) => Math.ceil(n / 40),  tier: 'essential' },
      { id: 'oat-milk',      name: 'Oat milk, half-gallon',                category: 'Dairy',     unitPrice: 5.4,  qty: (n) => Math.ceil(n / 60),  tier: 'standard',  alt: { name: 'Store-brand oat milk, half-gallon', unitPrice: 3.9 } },
      { id: 'espresso',      name: 'Espresso beans, 5 lb bag',             category: 'Coffee',    unitPrice: 58.0, qty: (n) => Math.ceil(n / 220), tier: 'essential', alt: { name: 'House-blend beans, 5 lb bag', unitPrice: 41.0 } },
      { id: 'cups-12oz',     name: '12 oz hot cups, sleeve of 50',         category: 'Supplies',  unitPrice: 8.2,  qty: (n) => Math.ceil(n / 50),  tier: 'essential' },
      { id: 'lids',          name: 'Cup lids, sleeve of 50',               category: 'Supplies',  unitPrice: 5.1,  qty: (n) => Math.ceil(n / 50),  tier: 'essential' },
      { id: 'napkins',       name: 'Napkins, 500-count',                   category: 'Supplies',  unitPrice: 6.8,  qty: (n) => Math.ceil(n / 250), tier: 'standard' },
      { id: 'syrup-vanilla', name: 'Vanilla syrup, 750 ml',                category: 'Flavors',   unitPrice: 11.5, qty: (n) => Math.ceil(n / 180), tier: 'standard' },
      { id: 'syrup-seasonal',name: 'Seasonal syrup (pumpkin spice), 750 ml', category: 'Flavors', unitPrice: 13.0, qty: () => 1,               tier: 'nice',      alt: { name: 'House-made spiced syrup kit', unitPrice: 6.5 } },
      { id: 'cleaner',       name: 'Espresso machine cleaner',             category: 'Care',      unitPrice: 15.0, qty: () => 1,               tier: 'essential' },
      { id: 'flowers',       name: 'Counter flowers, weekly bunch',        category: 'Ambience',  unitPrice: 12.0, qty: () => 1,               tier: 'nice' },
    ],
  },
};

function getScenario(id) {
  return SCENARIOS[id] || null;
}

function listScenarios() {
  return Object.entries(SCENARIOS).map(([id, s]) => ({ id, label: s.label, scaleLabel: s.scaleLabel, itemCount: s.items.length }));
}

module.exports = { SCENARIOS, getScenario, listScenarios };

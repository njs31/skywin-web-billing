export type FieldCatalogSeedSub = {
  slug: string;
  title: string;
  queries: string[];
  matchTerms: string[];
  iconKey: string;
  iconUri?: string;
  iconTint: boolean;
  productIds: number[];
};

export type FieldCatalogSeedCategory = {
  slug: string;
  title: string;
  queries: string[];
  iconKey: string;
  subs: FieldCatalogSeedSub[];
};

const CDN = "https://skywin.qwicksapp.com/cdn/icons";

export const FIELD_CATALOG_SEED: FieldCatalogSeedCategory[] = [
  {
    slug: "sprayers",
    title: "Sprayers",
    queries: ["sprayer", "spray", "knapsack"],
    iconKey: "sprayers",
    subs: [
      {
        slug: "battery",
        title: "Battery",
        queries: ["battery sprayer", "kissan dost battery", "skywin sprayer"],
        matchTerms: ["battery sprayer"],
        iconKey: "battery",
        iconUri: `${CDN}/battery.png?v=1`,
        iconTint: false,
        productIds: [1184, 1182, 1194, 966, 967, 968, 969, 970, 971],
      },
      {
        slug: "petrol",
        title: "Petrol",
        queries: ["petrol sprayer", "petrol"],
        matchTerms: ["petrol"],
        iconKey: "petrol",
        iconUri: `${CDN}/petrol.png?v=2`,
        iconTint: false,
        productIds: [],
      },
      {
        slug: "diesel",
        title: "Diesel",
        queries: ["diesel sprayer", "diesel"],
        matchTerms: ["diesel"],
        iconKey: "diesel",
        iconUri: `${CDN}/diesel.png?v=3`,
        iconTint: false,
        productIds: [],
      },
      {
        slug: "power",
        title: "Power spray",
        queries: ["power sprayer", "knapsack", "htp sprayer", "kps", "bharat", "portable power"],
        matchTerms: ["power sprayer", "knapsack", "htp", "4 stroke", "2 stroke"],
        iconKey: "power",
        iconTint: true,
        productIds: [1185, 414, 422, 425, 440, 444, 449, 450, 451, 458, 506],
      },
      {
        slug: "manual",
        title: "Manual",
        queries: ["manual sprayer", "manual pressure", "titan manual"],
        matchTerms: ["manual"],
        iconKey: "manual",
        iconTint: true,
        productIds: [1548, 431, 432, 433, 445, 1195],
      },
      {
        slug: "mist",
        title: "Mist blower",
        queries: ["mist blower", "duster"],
        matchTerms: ["mist", "blower", "duster"],
        iconKey: "mist",
        iconTint: true,
        productIds: [424, 1492],
      },
      {
        slug: "washer",
        title: "Car washer",
        queries: ["car washer", "pressure sprayer"],
        matchTerms: ["washer", "car wash"],
        iconKey: "washer",
        iconUri: `${CDN}/car-washer.png?v=2`,
        iconTint: false,
        productIds: [1136, 972],
      },
      {
        slug: "spares",
        title: "Spares",
        queries: ["sprayer gun", "lance", "nozzle", "hose", "charger", "strainer", "SSS", "SSD", "SM6"],
        matchTerms: ["lance", "nozzle", "hose", "charger", "gun", "pump", "belt", "strainer"],
        iconKey: "spares",
        iconTint: true,
        productIds: [
          435, 436, 454, 455, 456, 460, 1453, 1454, 1455, 1456, 1458, 1460, 1461, 1462, 1465, 1466, 1467, 1, 973, 974,
          975, 976, 977, 978, 979, 980, 981, 982, 983, 984, 985, 986, 987, 988, 989, 990, 991,
        ],
      },
    ],
  },
  {
    slug: "organic",
    title: "Organic",
    queries: ["yieldwin", "sunwin", "breezz", "sea king", "organic"],
    iconKey: "organic",
    subs: [
      {
        slug: "foliar",
        title: "Foliar",
        queries: ["yieldwin", "breezz", "sunwin", "golden yield", "poomalai", "blood", "vairam", "paar kadal"],
        matchTerms: ["yieldwin", "breezz", "sunwin", "golden", "poomalai", "blood", "vairam"],
        iconKey: "foliar",
        iconTint: true,
        productIds: [
          533, 534, 535, 536, 537, 538, 539, 540, 541, 542, 543, 544, 545, 546, 547, 548, 549, 550, 551, 552, 553, 554,
          555, 556, 557, 558, 559, 560, 561, 562, 563, 564, 590, 591, 592, 593, 594, 595, 596, 597, 1520, 1518, 1517,
          1516, 1521,
        ],
      },
      {
        slug: "soil",
        title: "Soil",
        queries: ["sea king", "deep gel", "solaivanam", "basiya", "grogreen", "winner", "saral", "neer"],
        matchTerms: ["sea king", "seaking", "gel", "solaivanam", "basiya", "grogreen"],
        iconKey: "soil",
        iconTint: true,
        productIds: [
          1180, 1273, 565, 566, 567, 568, 1153, 1142, 1246, 569, 573, 574, 575, 576, 577, 578, 579, 580, 581, 582, 583,
          584, 585, 586, 587, 588, 589, 598, 599, 600, 601, 1141, 1541, 1388,
        ],
      },
      {
        slug: "drip",
        title: "Drip irrigation",
        queries: ["drip special", "sunwin drip"],
        matchTerms: ["drip"],
        iconKey: "drip",
        iconTint: true,
        productIds: [570, 571, 572],
      },
    ],
  },
  {
    slug: "machineries",
    title: "Machineries",
    queries: ["weeder", "machine", "harvester", "petrol"],
    iconKey: "machineries",
    subs: [],
  },
];

import { db } from "../db";
import { sql } from "drizzle-orm";

export const ZONE_1_KANCHI_PINS = [
  "601102", "601301", "601302", "602101", "602102", "602103", "602104", "602105", "602106", "602107",
  "602108", "602109", "602117", "603001", "603002", "603101", "603102", "603103", "603104", "603105",
  "603106", "603107", "603108", "603109", "603110", "603111", "603112", "603127", "603201", "603202",
  "603204", "603209", "603232", "603301", "603302", "603303", "603304", "603305", "603306", "603307",
  "603308", "603309", "603310", "603311", "603312", "603313", "603314", "603319", "603401", "603402",
  "603403", "603405", "603406", "631202", "631402", "631501", "631502", "631503", "631551", "631552",
  "631561", "631601", "631605", "631606", "603210", "603211", "631553", "631603", "631604", "603404",
];

export const ZONE_1_TIRUVALLUR_PINS = [
  "601101", "601103", "601201", "601202", "601203", "601204", "601205", "601206", "602001", "602002",
  "602003", "602021", "602023", "602024", "602025", "602026", "631203", "631204", "631205", "631207",
  "631208", "631209", "631210", "631213", "631301", "631201", "631206", "631211", "631212", "631302",
  "631303", "631304", "602022", "602027",
];

export const ZONE_4_KANCHI_PINS = [
  "600016", "600043", "600044", "600045", "600046", "600047", "600048", "600056", "600059", "600061",
  "600063", "600064", "600069", "600070", "600073", "600074", "600075", "600088", "600089", "600091",
  "600096", "600097", "600100", "600114", "600115", "600116", "600117", "600119", "600125", "600122",
  "600126", "600127", "600129",
];

export const ZONE_4_TIRUVALLUR_PINS = [
  "600019", "600037", "600049", "600050", "600051", "600052", "600053", "600054", "600055", "600057",
  "600058", "600060", "600062", "600065", "600066", "600067", "600068", "600071", "600072", "600076",
  "600077", "600080", "600087", "600095", "600098", "600099", "600103", "600109", "600110", "600120",
  "600123", "600124", "600128",
];

const SEED_RATES = [
  // --- Slab 1: 250gm - 500gm ---
  {
    slab: "250gm-500gm",
    minWeightGrams: 0,
    maxWeightGrams: 500,
    zoneName: "Rest of Tamil Nadu & Pondicherry",
    regions: "Tamil Nadu (Kanchipuram, Tiruvallur, Villupuram, Tiruvannamalai, Cuddalore, Tiruchirappalli, Ariyalur, Nagapattinam, Thiruvarur, Thanjavur, Pudukkottai, Perambalur, Namakkal, Karur, Vellore, Theni, Sivaganga, Dharmapuri, Salem, Erode), Pondicherry",
    transitDays: "3 - 5 Days",
    shippingFee: 63.0,
    pincodes: [...ZONE_1_KANCHI_PINS, ...ZONE_1_TIRUVALLUR_PINS].join(","),
    districts: "villupuram,tiruvannamalai,cuddalore,tiruchirappalli,ariyalur,nagapattinam,thiruvarur,thanjavur,pudukkottai,perambalur,namakkal,karur,vellore,theni,sivaganga,dharmapuri,salem,erode",
    states: "pondicherry,puducherry",
  },
  {
    slab: "250gm-500gm",
    minWeightGrams: 0,
    maxWeightGrams: 500,
    zoneName: "AP Border & South Karnataka",
    regions: "Andhra Pradesh (Ananthapur, Chittoor, Kurnool, Prakasam, Nellore), Karnataka (Bangalore, Tumkur, Chikkaballapur, Ramanagar, Kolar, Bangalore Central)",
    transitDays: "3 - 5 Days",
    shippingFee: 63.0,
    pincodes: "",
    districts: "ananthapur,chittoor,kurnool,prakasam,nellore,bangalore,bangalore urban,bangalore central,tumkur,chikkaballapur,ramanagar,ramanagara,kolar",
    states: "",
  },
  {
    slab: "250gm-500gm",
    minWeightGrams: 0,
    maxWeightGrams: 500,
    zoneName: "North, Central & Rest of India",
    regions: "Uttar Pradesh, Rajasthan, Haryana, Punjab, Uttarakhand, Chandigarh, Andhra Pradesh (Rest), Kerala, Karnataka (Rest), Maharashtra, Gujarat, Goa, Madhya Pradesh, Chattisgarh, Jharkhand, West Bengal, Bihar, Odisha",
    transitDays: "3 - 5 Days",
    shippingFee: 111.0,
    pincodes: "",
    districts: "",
    states: "uttar pradesh,rajasthan,haryana,punjab,uttarakhand,chandigarh,kerala,gujarat,goa,madhya pradesh,chattisgarh,chhattisgarh,jharkhand,bihar,odisha,andhra pradesh,karnataka,maharashtra,west bengal,andaman and nicobar islands,assam,tripura,meghalaya,manipur,nagaland,mizoram,arunachal pradesh,sikkim,himachal pradesh,jammu and kashmir,ladakh",
  },
  {
    slab: "250gm-500gm",
    minWeightGrams: 0,
    maxWeightGrams: 500,
    zoneName: "Chennai & Suburbs",
    regions: "Tamil Nadu (Chennai, Kanchipuram urban, Tiruvallur urban)",
    transitDays: "1 - 3 Days",
    shippingFee: 67.0,
    pincodes: [...ZONE_4_KANCHI_PINS, ...ZONE_4_TIRUVALLUR_PINS].join(","),
    districts: "chennai",
    states: "",
  },
  {
    slab: "250gm-500gm",
    minWeightGrams: 0,
    maxWeightGrams: 500,
    zoneName: "Metros (Delhi, Mumbai, Kolkata)",
    regions: "Delhi, Maharashtra (Mumbai), West Bengal (Kolkata)",
    transitDays: "3 - 5 Days",
    shippingFee: 99.0,
    pincodes: "",
    districts: "delhi,new delhi,north delhi,south delhi,west delhi,east delhi,mumbai,mumbai suburban,kolkata",
    states: "delhi",
  },
  {
    slab: "250gm-500gm",
    minWeightGrams: 0,
    maxWeightGrams: 500,
    zoneName: "South Tamil Nadu",
    regions: "Tamil Nadu (Coimbatore, Ramanathapuram, Dindigul, Madurai, Virudhunagar, Tuticorin, Tirunelveli, Tenkasi, Kanyakumari, Krishnagiri, Nilgiris)",
    transitDays: "3 - 5 Days",
    shippingFee: 109.0,
    pincodes: "",
    districts: "coimbatore,ramanathapuram,dindigul,madurai,virudhunagar,tuticorin,thoothukudi,tirunelveli,tenkasi,kanyakumari,krishnagiri,nilgiris,the nilgiris",
    states: "",
  },

  // --- Slab 2: 500 to 1kg ---
  {
    slab: "500 to 1kg",
    minWeightGrams: 501,
    maxWeightGrams: 1000,
    zoneName: "Rest of Tamil Nadu & Pondicherry",
    regions: "Tamil Nadu (Kanchipuram, Tiruvallur, Villupuram, Tiruvannamalai, Cuddalore, Tiruchirappalli, Ariyalur, Nagapattinam, Thiruvarur, Thanjavur, Pudukkottai, Perambalur, Namakkal, Karur, Vellore, Theni, Sivaganga, Dharmapuri, Salem, Erode), Pondicherry",
    transitDays: "3 - 5 Days",
    shippingFee: 85.0,
    pincodes: [...ZONE_1_KANCHI_PINS, ...ZONE_1_TIRUVALLUR_PINS].join(","),
    districts: "villupuram,tiruvannamalai,cuddalore,tiruchirappalli,ariyalur,nagapattinam,thiruvarur,thanjavur,pudukkottai,perambalur,namakkal,karur,vellore,theni,sivaganga,dharmapuri,salem,erode",
    states: "pondicherry,puducherry",
  },
  {
    slab: "500 to 1kg",
    minWeightGrams: 501,
    maxWeightGrams: 1000,
    zoneName: "AP Border & South Karnataka",
    regions: "Andhra Pradesh (Ananthapur, Chittoor, Kurnool, Prakasam, Nellore), Karnataka (Bangalore, Tumkur, Chikkaballapur, Ramanagar, Kolar, Bangalore Central)",
    transitDays: "3 - 5 Days",
    shippingFee: 85.0,
    pincodes: "",
    districts: "ananthapur,chittoor,kurnool,prakasam,nellore,bangalore,bangalore urban,bangalore central,tumkur,chikkaballapur,ramanagar,ramanagara,kolar",
    states: "",
  },
  {
    slab: "500 to 1kg",
    minWeightGrams: 501,
    maxWeightGrams: 1000,
    zoneName: "North, Central & Rest of India",
    regions: "Uttar Pradesh, Rajasthan, Haryana, Punjab, Uttarakhand, Chandigarh, Andhra Pradesh (Rest), Kerala, Karnataka (Rest), Maharashtra, Gujarat, Goa, Madhya Pradesh, Chattisgarh, Jharkhand, West Bengal, Bihar, Odisha",
    transitDays: "3 - 5 Days",
    shippingFee: 159.0,
    pincodes: "",
    districts: "",
    states: "uttar pradesh,rajasthan,haryana,punjab,uttarakhand,chandigarh,kerala,gujarat,goa,madhya pradesh,chattisgarh,chhattisgarh,jharkhand,bihar,odisha,andhra pradesh,karnataka,maharashtra,west bengal,andaman and nicobar islands,assam,tripura,meghalaya,manipur,nagaland,mizoram,arunachal pradesh,sikkim,himachal pradesh,jammu and kashmir,ladakh",
  },
  {
    slab: "500 to 1kg",
    minWeightGrams: 501,
    maxWeightGrams: 1000,
    zoneName: "Chennai & Suburbs",
    regions: "Tamil Nadu (Chennai, Kanchipuram urban, Tiruvallur urban)",
    transitDays: "1 - 3 Days",
    shippingFee: 85.0,
    pincodes: [...ZONE_4_KANCHI_PINS, ...ZONE_4_TIRUVALLUR_PINS].join(","),
    districts: "chennai",
    states: "",
  },
  {
    slab: "500 to 1kg",
    minWeightGrams: 501,
    maxWeightGrams: 1000,
    zoneName: "Metros (Delhi, Mumbai, Kolkata)",
    regions: "Delhi, Maharashtra (Mumbai), West Bengal (Kolkata)",
    transitDays: "3 - 5 Days",
    shippingFee: 139.0,
    pincodes: "",
    districts: "delhi,new delhi,north delhi,south delhi,west delhi,east delhi,mumbai,mumbai suburban,kolkata",
    states: "delhi",
  },
  {
    slab: "500 to 1kg",
    minWeightGrams: 501,
    maxWeightGrams: 1000,
    zoneName: "South Tamil Nadu",
    regions: "Tamil Nadu (Coimbatore, Ramanathapuram, Dindigul, Madurai, Virudhunagar, Tuticorin, Tirunelveli, Tenkasi, Kanyakumari, Krishnagiri, Nilgiris)",
    transitDays: "3 - 5 Days",
    shippingFee: 159.0,
    pincodes: "",
    districts: "coimbatore,ramanathapuram,dindigul,madurai,virudhunagar,tuticorin,thoothukudi,tirunelveli,tenkasi,kanyakumari,krishnagiri,nilgiris,the nilgiris",
    states: "",
  },
];

async function seedRates() {
  console.log("Seeding shipping rates from PDF sheet...");
  // Clear existing default rates to allow clean reseed
  await db.execute(sql`DELETE FROM shipping_rates`);

  for (const rate of SEED_RATES) {
    await db.execute(sql`
      INSERT INTO shipping_rates (
        slab, min_weight_grams, max_weight_grams, zone_name, regions,
        transit_days, shipping_fee, pincodes, districts, states, is_active
      ) VALUES (
        ${rate.slab}, ${rate.minWeightGrams}, ${rate.maxWeightGrams}, ${rate.zoneName}, ${rate.regions},
        ${rate.transitDays}, ${rate.shippingFee}, ${rate.pincodes}, ${rate.districts}, ${rate.states}, TRUE
      )
    `);
  }
  console.log(`Successfully seeded ${SEED_RATES.length} shipping rate rules!`);
}

seedRates()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Failed to seed rates:", err);
    process.exit(1);
  });

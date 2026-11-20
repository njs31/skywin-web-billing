import { calculateManualShippingRate, getShippingProvider, setShippingProvider } from "../lib/delivery/manual-rates";
import { recordOrderCheckpoint, getOrderTrackingDetails, registerPushToken } from "../lib/services/shipping-checkpoints";

async function runTests() {
  console.log("=== 1. Testing Shipping Provider Switch ===");
  const initial = await getShippingProvider();
  console.log("Initial provider:", initial);

  await setShippingProvider("manual", "test-runner");
  let current = await getShippingProvider();
  console.log("Switched to manual:", current);
  if (current !== "manual") throw new Error("Failed to switch to manual");

  await setShippingProvider("delhivery", "test-runner");
  current = await getShippingProvider();
  console.log("Switched to delhivery:", current);
  if (current !== "delhivery") throw new Error("Failed to switch to delhivery");

  // Reset to manual for live usage
  await setShippingProvider("manual", "test-runner");
  console.log("Reset back to manual (SkyWin Delivery): OK");

  console.log("\n=== 2. Testing Manual Rate Calculation from PDF Sheet ===");

  // Test 1: Chennai Suburbs (Slab 250-500g)
  const q1 = await calculateManualShippingRate("600016", 350);
  console.log("Test 1 (PIN 600016, 350g):", q1);
  if (q1.amount !== 67) throw new Error(`Expected ₹67 for PIN 600016 350g, got ${q1.amount}`);

  // Test 2: Kumbakonam / TN Rest (Slab 250-500g)
  const q2 = await calculateManualShippingRate("612401", 450);
  console.log("Test 2 (PIN 612401, 450g):", q2);
  if (q2.amount !== 63) throw new Error(`Expected ₹63 for PIN 612401 450g, got ${q2.amount}`);

  // Test 3: South TN / Coimbatore (Slab 500-1kg)
  const q3 = await calculateManualShippingRate("641001", 750);
  console.log("Test 3 (PIN 641001, 750g):", q3);
  if (q3.amount !== 159) throw new Error(`Expected ₹159 for PIN 641001 750g, got ${q3.amount}`);

  // Test 4: Mumbai Metro (Slab 250-500g)
  const q4 = await calculateManualShippingRate("400001", 400);
  console.log("Test 4 (PIN 400001, 400g):", q4);
  if (q4.amount !== 99) throw new Error(`Expected ₹99 for PIN 400001 400g, got ${q4.amount}`);

  // Test 5: Delhi Metro (Slab 500-1kg)
  const q5 = await calculateManualShippingRate("110001", 900);
  console.log("Test 5 (PIN 110001, 900g):", q5);
  if (q5.amount !== 139) throw new Error(`Expected ₹139 for PIN 110001 900g, got ${q5.amount}`);

  console.log("\n=== 3. Testing Checkpoint Updates & Push Notification System ===");
  const testOrderId = "TEST-SW-9999";

  // Register dummy push token
  await registerPushToken("9942499930", "ExponentPushToken[dummy-test-token-1234]");

  const checkpointsToTest = [
    "Order Received",
    "Order Processing",
    "Dispatched",
    "In transit",
    "Out for delivery",
    "Delivered",
  ] as const;

  for (const cp of checkpointsToTest) {
    const res = await recordOrderCheckpoint({
      orderId: testOrderId,
      checkpoint: cp,
      note: `Status updated to ${cp}`,
      location: "Kumbakonam Hub",
      updatedBy: "Office Officer",
    });
    console.log(`Updated ${testOrderId} -> ${cp}:`, res.success, res.notification.title);
  }

  const track = await getOrderTrackingDetails(testOrderId);
  console.log("\nTracking Details for " + testOrderId + ":", {
    orderId: track.orderId,
    currentStatus: track.currentStatus,
    courier: track.courier,
    historyEvents: track.history.length,
  });

  if (track.currentStatus !== "Delivered") {
    throw new Error(`Expected latest status Delivered, got ${track.currentStatus}`);
  }

  console.log("\nALL TESTS PASSED SUCCESSFULLY!");
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test failed:", err);
    process.exit(1);
  });

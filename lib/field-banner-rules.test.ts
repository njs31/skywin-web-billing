import test from "node:test";
import assert from "node:assert/strict";
import { bannersFor, canManageBanners, checkBanner, type AppBanner } from "./field-banner-rules";
import { cleanIconUri } from "./field-icon-url";

const IMG = "https://skywin.qwicksapp.com/api/field/media/0f8fad5b-d9cb-469f-a165-70867728950e";
const clean = (uri: string) => cleanIconUri(uri, "production");

test("banners: only admins and managers may change them", () => {
  assert.equal(canManageBanners("admin"), true);
  assert.equal(canManageBanners("manager"), true);
  for (const role of ["regional_manager", "sales_manager", "sales_officer", "cashier", "dealer", "", null, undefined]) {
    assert.equal(canManageBanners(role as string | null | undefined), false, String(role));
  }
});

test("banners: a Products page banner needs an uploaded picture", () => {
  const ok = checkBanner({ imageUrl: IMG, placement: "products", categoryId: 4, title: "  Diwali   offer " }, clean);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.value.placement, "products");
  assert.equal(ok.value.categoryId, null, "category is ignored on the Products page");
  assert.equal(ok.value.title, "Diwali offer");
  assert.equal(ok.value.imageUrl, IMG);
  assert.deepEqual(checkBanner({ imageUrl: "", placement: "products" }, clean).errors, ["Upload a picture first."]);
});

test("banners: pictures from other sites are refused", () => {
  const bad = checkBanner({ imageUrl: "https://evil.example.com/x.png", placement: "products" }, clean);
  assert.deepEqual(bad.errors, ["Upload the picture from this page."]);
  const js = checkBanner({ imageUrl: "javascript:alert(1)", placement: "products" }, clean);
  assert.deepEqual(js.errors, ["Upload the picture from this page."]);
});

test("banners: a category banner needs its category; product link is optional", () => {
  assert.deepEqual(checkBanner({ imageUrl: IMG, placement: "category" }, clean).errors, ["Choose the category for this banner."]);
  const ok = checkBanner({ imageUrl: IMG, placement: "category", categoryId: 7, productId: 1184 }, clean);
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.value.categoryId, 7);
  assert.equal(ok.value.productId, 1184);
  assert.equal(checkBanner({ imageUrl: IMG, placement: "products", productId: -3 }, clean).value.productId, null);
  assert.equal(checkBanner({ imageUrl: IMG, placement: "products", productId: 1.5 }, clean).value.productId, null);
  assert.deepEqual(checkBanner({ imageUrl: IMG, placement: "home" }, clean).errors, ["Choose where the banner shows."]);
});

test("banners: each app page gets only its own banners, in order", () => {
  const all: AppBanner[] = [
    { id: 1, imageUrl: IMG, placement: "products", category: null, productId: null },
    { id: 2, imageUrl: IMG, placement: "category", category: "pesticides", productId: null },
    { id: 3, imageUrl: IMG, placement: "products", category: null, productId: 9 },
    { id: 4, imageUrl: IMG, placement: "category", category: "organic", productId: null },
  ];
  assert.deepEqual(bannersFor(all, "products").map((b) => b.id), [1, 3]);
  assert.deepEqual(bannersFor(all, "category", "pesticides").map((b) => b.id), [2]);
  assert.deepEqual(bannersFor(all, "category", "seeds").map((b) => b.id), []);
});

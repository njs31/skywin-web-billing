import test from "node:test";
import assert from "node:assert/strict";
import { isUniqueViolation } from "./db-errors";

/**
 * The shape production actually threw when a supplier was added twice, taken
 * from the container logs: a wrapper Error whose own message says nothing
 * useful, with the Postgres error hung off `cause`.
 */
function driverError() {
  const cause = Object.assign(
    new Error('duplicate key value violates unique constraint "suppliers_name_unique"'),
    {
      code: "23505",
      constraint_name: "suppliers_name_unique",
      table_name: "suppliers",
      detail: "Key (name)=(Sea2Farms Crop Nutrition Pvt Ltd) already exists.",
    }
  );
  return new Error(
    'Failed query: insert into "suppliers" ("id", "name") values (default, $1)',
    { cause }
  );
}

test("isUniqueViolation", async (t) => {
  await t.test("sees through the driver's wrapper", () => {
    // The regression: the old check read only the top-level message, which is
    // "Failed query: ...", so a duplicate supplier escaped as a raw database
    // error and production showed a Server Components render notice instead.
    const err = driverError();
    assert.equal(err.message.includes("unique"), false, "wrapper says nothing useful");
    assert.equal(isUniqueViolation(err), true);
  });

  await t.test("recognises the SQLSTATE on its own", () => {
    assert.equal(isUniqueViolation(Object.assign(new Error("nope"), { code: "23505" })), true);
  });

  await t.test("recognises the wording on its own", () => {
    assert.equal(isUniqueViolation(new Error("duplicate key value violates ...")), true);
    assert.equal(isUniqueViolation(new Error("violates unique constraint")), true);
  });

  await t.test("leaves other database errors alone", () => {
    // A foreign key or not-null failure must still surface as itself, not as
    // "already exists".
    assert.equal(
      isUniqueViolation(Object.assign(new Error("Failed query"), {
        cause: Object.assign(new Error('null value in column "name"'), { code: "23502" }),
      })),
      false
    );
    assert.equal(isUniqueViolation(new Error("connection refused")), false);
    assert.equal(isUniqueViolation(null), false);
    assert.equal(isUniqueViolation(undefined), false);
    assert.equal(isUniqueViolation("duplicate key"), true);
  });

  await t.test("survives an error chain that loops", () => {
    const a: Error & { cause?: unknown } = new Error("a");
    const b: Error & { cause?: unknown } = new Error("b");
    a.cause = b;
    b.cause = a;
    assert.equal(isUniqueViolation(a), false);
  });
});

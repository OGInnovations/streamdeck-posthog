import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { alertLevel, crossedIntoAlert } from "../thresholds.js";

describe("alertLevel", () => {
	it("reports nothing when alerts are off", () => {
		assert.equal(alertLevel(999, {}), undefined);
		assert.equal(alertLevel(999, { warnAt: 10, criticalAt: 20 }), undefined);
		assert.equal(alertLevel(999, { alertDirection: "", warnAt: 10 }), undefined);
	});

	describe("watching for a rise", () => {
		const settings = { alertDirection: "above", warnAt: 100, criticalAt: 250 };

		it("stays quiet below the warning level", () => {
			assert.equal(alertLevel(99, settings), undefined);
		});

		it("warns at the level, not just past it", () => {
			assert.equal(alertLevel(100, settings), "warn");
		});

		it("escalates to critical", () => {
			assert.equal(alertLevel(249, settings), "warn");
			assert.equal(alertLevel(250, settings), "critical");
			assert.equal(alertLevel(10_000, settings), "critical");
		});
	});

	describe("watching for a decline", () => {
		const settings = { alertDirection: "below", warnAt: 99, criticalAt: 95 };

		it("stays quiet above the warning level", () => {
			assert.equal(alertLevel(99.5, settings), undefined);
		});

		it("warns then escalates as the value falls", () => {
			assert.equal(alertLevel(99, settings), "warn");
			assert.equal(alertLevel(96, settings), "warn");
			assert.equal(alertLevel(95, settings), "critical");
			assert.equal(alertLevel(0, settings), "critical");
		});
	});

	it("works with only one level set", () => {
		assert.equal(alertLevel(150, { alertDirection: "above", criticalAt: 100 }), "critical");
		assert.equal(alertLevel(150, { alertDirection: "above", warnAt: 100 }), "warn");
		assert.equal(alertLevel(50, { alertDirection: "above", warnAt: 100 }), undefined);
	});

	it("reports critical when a value is past both, whichever order they were entered", () => {
		// Someone may reasonably type the critical level into the warning field.
		assert.equal(alertLevel(500, { alertDirection: "above", warnAt: 250, criticalAt: 100 }), "critical");
	});

	it("ignores blank and unparseable levels", () => {
		assert.equal(alertLevel(500, { alertDirection: "above", warnAt: "", criticalAt: "" }), undefined);
		assert.equal(alertLevel(500, { alertDirection: "above", warnAt: "abc" }), undefined);
		// A threshold typed as text still works, since the inspector stores strings.
		assert.equal(alertLevel(500, { alertDirection: "above", warnAt: "250" }), "warn");
	});

	it("handles negative thresholds", () => {
		assert.equal(alertLevel(-5, { alertDirection: "below", warnAt: -1, criticalAt: -10 }), "warn");
		assert.equal(alertLevel(-20, { alertDirection: "below", warnAt: -1, criticalAt: -10 }), "critical");
	});
});

describe("crossedIntoAlert", () => {
	it("alerts on first entering a level", () => {
		assert.equal(crossedIntoAlert(undefined, "warn"), true);
		assert.equal(crossedIntoAlert(undefined, "critical"), true);
	});

	it("alerts when warning worsens to critical", () => {
		assert.equal(crossedIntoAlert("warn", "critical"), true);
	});

	it("stays silent while the level is unchanged", () => {
		// Otherwise the deck would nag on every poll for as long as the value
		// stayed out of bounds.
		assert.equal(crossedIntoAlert("warn", "warn"), false);
		assert.equal(crossedIntoAlert("critical", "critical"), false);
	});

	it("stays silent on recovery", () => {
		assert.equal(crossedIntoAlert("critical", "warn"), false);
		assert.equal(crossedIntoAlert("warn", undefined), false);
		assert.equal(crossedIntoAlert("critical", undefined), false);
		assert.equal(crossedIntoAlert(undefined, undefined), false);
	});

	it("alerts again after recovering and crossing back", () => {
		// The sequence a key actually goes through: breach, recover, breach.
		assert.equal(crossedIntoAlert(undefined, "warn"), true);
		assert.equal(crossedIntoAlert("warn", undefined), false);
		assert.equal(crossedIntoAlert(undefined, "warn"), true);
	});
});
